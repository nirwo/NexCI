from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
import requests
import re
import os
import json
from urllib.parse import quote, urljoin
import html
from datetime import timedelta
from collections import Counter

# Constants
APPLICATION_JSON = 'application/json'

# Import auth-related modules
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, User, Encryption, DashboardView
from forms import LoginForm, RegistrationForm, JenkinsConfigForm, SettingsForm # Import SettingsForm
import anthropic # Add this import
from flask_wtf.csrf import CSRFProtect # Import CSRFProtect

JOB_API_PATH_SEPARATOR = "/job/"

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-key-for-development')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///jenkins_monitor.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database
db.init_app(app)

# Initialize login manager
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Initialize CSRF protection
csrf = CSRFProtect()
csrf.init_app(app)

# Initialize encryption
with app.app_context():
    Encryption.initialize(app)

@login_manager.user_loader
def load_user(user_id):
    # Ensure user_id is valid before querying
    if user_id is None or not user_id.isdigit():
        return None
    user = User.query.get(int(user_id))
    return user

# Create database tables
with app.app_context():
    db.create_all()

# --- Helper Functions ---

def get_jenkins_api_data(api_url, username=None, api_token=None):
    # We're no longer using session for token storage due to cryptography.fernet.InvalidToken errors
    """Helper function to make authenticated GET requests to Jenkins API."""
    try:
        session = requests.Session()
        if username and api_token:
            session.auth = (username, api_token)

        response = session.get(api_url, timeout=20)
        response.raise_for_status()  # This will raise an exception for HTTP errors

        # Check if the response is JSON
        content_type = response.headers.get('Content-Type', '')
        if APPLICATION_JSON not in content_type.lower() and 'json' not in content_type.lower():
            app.logger.warning(f"Unexpected content type: {content_type} for URL: {api_url}")

        return response.json(), None # Return data, no error
    except requests.exceptions.RequestException as e:
        error_message = f"Error accessing {api_url}: {e}"
        status_code = 500
        if hasattr(e, 'response') and e.response is not None:
            status_code = e.response.status_code
            if status_code == 401:
                error_message = f'Authentication failed for {api_url}. Check credentials.'
            elif status_code == 403:
                 error_message = f'Forbidden access to {api_url}. Check permissions or Jenkins CSRF settings.'
            elif status_code == 404:
                error_message = f'Resource not found at {api_url}. Check URL/Job Path.'
            # Include response text if available and helpful
            try:
                 response_text = e.response.text
                 # Avoid dumping huge HTML pages, look for JSON error messages
                 if 'application/json' in e.response.headers.get('Content-Type', ''):
                     error_message += f" Details: {response_text[:500]}" # Limit length
                 elif '<title>Error</title>' in response_text: # Jenkins error page
                     error_message += " Jenkins returned an error page."
            except Exception:
                 pass # Ignore errors trying to get more details

        app.logger.error(error_message)
        return None, (jsonify({'error': error_message}), status_code)
    except Exception as e:
        app.logger.error(f"An unexpected error occurred accessing {api_url}: {e}")
        return None, (jsonify({'error': f'An unexpected server error occurred: {e}'}), 500)


# --- Auth Routes ---

@app.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    
    form = LoginForm()
    if form.validate_on_submit():
        user = User.query.filter_by(username=form.username.data).first()
        if user is None or not user.check_password(form.password.data):
            flash('Invalid username or password')
            return redirect(url_for('login'))
        
        login_user(user, remember=form.remember_me.data)
        return redirect(url_for('dashboard'))
    
    return render_template('login.html', title='Sign In', form=form)

@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('login'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    
    form = RegistrationForm()
    if form.validate_on_submit():
        user = User(username=form.username.data, email=form.email.data)
        user.set_password(form.password.data)
        db.session.add(user)
        db.session.commit()
        flash('Congratulations, you are now a registered user!')
        return redirect(url_for('login'))
    
    return render_template('register.html', title='Register', form=form)

@app.route('/jenkins_config', methods=['GET', 'POST'])
@login_required
def jenkins_config():
    form = JenkinsConfigForm()
    
    # Pre-fill form with existing data if available
    if request.method == 'GET' and current_user.jenkins_url:
        form.jenkins_url.data = current_user.jenkins_url
        form.jenkins_username.data = current_user.jenkins_username
        # Don't pre-fill the token for security
    
    if form.validate_on_submit():
        current_user.jenkins_url = form.jenkins_url.data
        current_user.jenkins_username = form.jenkins_username.data
        current_user.set_jenkins_token(form.jenkins_api_token.data)
        db.session.commit()
        flash('Jenkins configuration updated.')
        return redirect(url_for('dashboard'))
    
    return render_template('jenkins_config.html', title='Jenkins Configuration', form=form)

# --- Main Application Routes ---

@app.route('/')
def index():
    if current_user.is_authenticated:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    # Check if Jenkins config exists
    if not current_user.jenkins_url:
        flash('Please configure your Jenkins connection first.')
        return redirect(url_for('jenkins_config'))
    
    # Store Jenkins credentials in session for API calls
    session['jenkins_url'] = current_user.jenkins_url
    session['jenkins_username'] = current_user.jenkins_username
    
    # The token persistence approach is causing InvalidToken errors
    # Clear any existing token to force a fresh retrieval
    if 'jenkins_token' in session:
        session.pop('jenkins_token', None)
    
    return render_template('dashboard.html', 
                          title='Jenkins Dashboard',
                          jenkins_url=current_user.jenkins_url)

# --- API Routes ---
# Update API endpoints to use current_user's Jenkins credentials

def extract_and_sort_jobs(api_data):
    """Helper function to extract and flatten the potentially nested job list."""
    jobs_list = []
    
    def extract_jobs(jobs):
        for job in jobs:
            # Extract the path relative to Jenkins root from the full URL
            job_url = job.get('url', '')
            url_path = ''
            try:
                # Find the part after /job/
                path_start_index = job_url.index('/job/') + 1 # Point after the first /
                url_path = job_url[path_start_index:] # Get e.g., job/FolderName/job/JobName/
            except ValueError:
                app.logger.warning(f"Could not parse job path from URL: {job_url}")
            
            # Ensure url_path ends with a slash if it's not empty
            if url_path and not url_path.endswith('/'):
                url_path += '/'

            jobs_list.append({
                'name': job.get('name'),         # For link text
                'fullName': job.get('fullName'), # For data-full-name and API calls
                'url': job.get('url'),           # For data-url
                'url_path': url_path             # Derived path, might be useful later
            })
            if 'jobs' in job: # Recursively check for nested jobs
                 extract_jobs(job['jobs'])
    
    extract_jobs(api_data['jobs'])
    # Sort jobs alphabetically by full name for better UI presentation
    jobs_list.sort(key=lambda x: x.get('fullName', '').lower())
    return jobs_list

@app.route('/api/jobs', methods=['POST', 'GET'])
@login_required
def get_jobs():
    """API endpoint to fetch list of jobs from Jenkins."""
    # For GET requests, use current_user's credentials
    if request.method == 'GET':
        jenkins_url = current_user.jenkins_url.rstrip('/')
        username = current_user.jenkins_username
        api_token = current_user.get_jenkins_token()
    else:
        # For backward compatibility, still accept POST with credentials
        data = request.json
        jenkins_url = data.get('jenkins_url', '').rstrip('/')
        username = data.get('username')
        api_token = data.get('api_token')

    if not jenkins_url:
        return jsonify({'error': 'Jenkins URL is required'}), 400

    # Jenkins API endpoint to get jobs (potentially nested)
    api_url = f"{jenkins_url}/api/json?tree=jobs[fullName,name,url,jobs[fullName,name,url,jobs[fullName,name,url]]]"

    api_data, error_response = get_jenkins_api_data(api_url, username, api_token)

    if error_response:
        return error_response

    if not api_data or 'jobs' not in api_data:
        return jsonify({'error': 'Could not parse job data from Jenkins response.'}), 500

    # Extract and sort jobs from the API data
    jobs_list = extract_and_sort_jobs(api_data)
    
    return jsonify({'jobs': jobs_list})

@app.route('/api/builds', methods=['POST', 'GET'])
@login_required
def get_builds():
    """API endpoint to fetch builds for a specific job."""
    # For GET requests, use current_user's credentials
    if request.method == 'GET':
        jenkins_url = current_user.jenkins_url.rstrip('/')
        username = current_user.jenkins_username
        api_token = current_user.get_jenkins_token()
        job_full_name = request.args.get('job_full_name')
    else:
        # For backward compatibility, still accept POST with credentials
        data = request.json
        jenkins_url = data.get('jenkins_url', '').rstrip('/')
        job_full_name = data.get('job_full_name')
        username = data.get('username')
        api_token = data.get('api_token')

    if not all([jenkins_url, job_full_name]):
        return jsonify({'error': 'Missing required parameters: Jenkins URL, Job Full Name'}), 400

    # Split the full name into parts (e.g., "Folder/Job" -> ["Folder", "Job"])
    path_parts = job_full_name.split('/')
    # Construct the URL segment with /job/ prepended to each part (e.g., "/job/Folder/job/Job/")
    job_path_segment = '/job/' + '/job/'.join(path_parts)
    # Ensure it ends with a slash before appending api/json
    if not job_path_segment.endswith('/'):
        job_path_segment += '/'

    api_url = f"{jenkins_url}{job_path_segment}api/json?tree=builds[number,url,timestamp,result,duration,description]"
    app.logger.debug(f"Constructed builds API URL: {api_url}") # Log the constructed URL

    api_data, error_response = get_jenkins_api_data(api_url, username, api_token)

    if error_response:
        return error_response

    if not api_data or 'builds' not in api_data:
        return jsonify({'builds': []}) # Return empty list if no builds found or key missing

    # Optionally sort builds by number (descending)
    builds = sorted(api_data['builds'], key=lambda x: int(x.get('number', 0)), reverse=True)

    return jsonify({'builds': builds})

@app.route('/api/job_kpis', methods=['POST'])
@login_required
def calculate_job_kpis():
    """API endpoint to fetch build history and calculate KPIs for a job."""
    data = request.json
    jenkins_url = current_user.jenkins_url.rstrip('/')
    job_full_name = data.get('job_full_name')
    build_limit = int(data.get('build_limit', 50)) # How many recent builds to analyze

    if not all([jenkins_url, job_full_name]):
        return jsonify({'error': 'Missing required parameters: Jenkins URL, Job Full Name'}), 400

    # The job_full_name received from frontend IS the relative url_path (e.g., job/Folder/job/Name/)
    # Ensure it starts with a slash if missing
    if not job_full_name.startswith('/'):
        job_full_name = '/' + job_full_name
    
    # Ensure job_full_name ends with / before appending api/json
    if not job_full_name.endswith('/'):
        job_full_name += '/'
    api_url = f"{jenkins_url}{job_full_name}api/json?tree=builds[number,timestamp,result,duration]{{,{build_limit}}}" # Limit builds fetched

    app.logger.info(f"Fetching KPI data from: {api_url}") # Log the URL
    # Get a fresh token to avoid cryptography.fernet.InvalidToken errors
    jenkins_token = current_user.get_jenkins_token()
    
    api_data, error_response = get_jenkins_api_data(api_url, current_user.jenkins_username, jenkins_token)

    if error_response:
        return error_response

    builds = api_data.get('builds', [])
    if not builds:
        return jsonify({'kpis': {'message': 'No build data found to calculate KPIs.'}})

    # Calculate KPIs
    total_builds = len(builds)
    status_counts = Counter(build.get('result') for build in builds if build.get('result'))
    successful_builds = [b for b in builds if b.get('result') == 'SUCCESS']
    
    success_count = status_counts.get('SUCCESS', 0)
    failure_count = status_counts.get('FAILURE', 0)
    unstable_count = status_counts.get('UNSTABLE', 0)
    aborted_count = status_counts.get('ABORTED', 0)

    success_rate = (success_count / total_builds * 100) if total_builds > 0 else 0
    
    avg_duration_ms = 0
    if successful_builds:
        total_duration_ms = sum(b.get('duration', 0) for b in successful_builds if b.get('duration') is not None)
        avg_duration_ms = total_duration_ms / len(successful_builds)

    # Format average duration (ms to H:M:S or M:S)
    avg_duration_formatted = 'N/A'
    if avg_duration_ms > 0:
        secs = int(avg_duration_ms / 1000)
        avg_duration_formatted = str(timedelta(seconds=secs))

    kpis = {
        'totalBuildsAnalyzed': total_builds,
        'successRate': round(success_rate, 1),
        'successCount': success_count,
        'failureCount': failure_count,
        'unstableCount': unstable_count,
        'abortedCount': aborted_count,
        'avgDurationSuccessful': avg_duration_formatted,
        'avgDurationMs': avg_duration_ms # Raw value for potential future use
    }

    app.logger.info(f"Calculated KPIs for {job_full_name}: {kpis}") # Log calculated KPIs

    return jsonify({'kpis': kpis})

def extract_log_error_message(response):
    """Extract a meaningful error message from Jenkins API error responses."""
    error_message = f"Jenkins API error: {response.status_code}"
    
    try:
        if 'text/html' in response.headers.get('Content-Type', '').lower() and 'Authentication required' in response.text:
            return "Authentication failed. Check username/API token."
        elif response.status_code == 404:
            return "Build log not found (404)."
        
        # Try parsing if it's JSON (less likely for consoleText error)
        if APPLICATION_JSON in response.headers.get('Content-Type', '').lower():
            error_detail = response.json().get('message', response.text[:100])  # Limit error text length
            return f"Jenkins API error: {response.status_code} - {error_detail}"
    except Exception:
        pass # Ignore errors trying to get more details

    return error_message

@app.route('/api/log', methods=['POST', 'GET'])
@login_required
def get_log():
    """API endpoint to fetch console logs for a build."""
    jenkins_url_base = current_user.jenkins_url # Base URL needed for potential relative path resolution
    
    # Handle both GET and POST methods
    if request.method == 'GET':
        build_url = request.args.get('build_url')
    else:  # POST
        data = request.json
        if not data:
            return jsonify({'error': 'No JSON data in request'}), 400
        build_url = data.get('build_url')
    
    if not all([jenkins_url_base, build_url]):
        app.logger.error("Missing data for log request: build_url=%s", build_url)
        return jsonify({'error': 'Missing Jenkins URL or build URL'}), 400

    # Construct the URL for the console text API endpoint
    log_api_url = urljoin(build_url, 'consoleText') 
    app.logger.info(f"Attempting to fetch log from: {log_api_url}")

    try:
        response = requests.get(
            log_api_url,
            # Always get a fresh token to avoid InvalidToken errors
        auth=(current_user.jenkins_username, current_user.get_jenkins_token()),
            timeout=30
        )
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        log_content = response.text
        app.logger.info(f"Successfully fetched log for build URL: {build_url} (Content length: {len(log_content)})")
        return jsonify({'log_content': log_content})
        
    except requests.exceptions.HTTPError as http_err:
        app.logger.error(f"HTTP error occurred while fetching log: {http_err} - Status: {response.status_code}")
        error_message = extract_log_error_message(response)
        return jsonify({'error': error_message}), response.status_code
        
    except requests.exceptions.RequestException as e:
        app.logger.error(f"Request exception while fetching log: {e}")
        return jsonify({'error': f"Error connecting to Jenkins: {str(e)}"}), 500
        
    except Exception as e:
        app.logger.error(f"Unexpected error while fetching log: {e}")
        return jsonify({'error': f"Unexpected error: {str(e)}"}), 500

@app.route('/api/logs', methods=['POST', 'GET'])
@login_required
def get_logs():
    """API endpoint to fetch and process Jenkins logs for a specific build."""
    data = request.json
    jenkins_url = current_user.jenkins_url.rstrip('/')
    job_full_name = data.get('job_full_name') # Now expects full name/path
    build_number = data.get('build_number')

    if not all([jenkins_url, job_full_name, build_number]):
        return jsonify({'error': 'Missing required parameters: Jenkins URL, Job Full Name, Build Number'}), 400

    # Construct the console log URL using the job's full path
    job_path = JOB_API_PATH_SEPARATOR + JOB_API_PATH_SEPARATOR.join(quote(part) for part in job_full_name.split('/'))
    log_url = f"{jenkins_url}{job_path}/{build_number}/consoleText"

    # Always get a fresh token to avoid cryptography.fernet.InvalidToken errors
    jenkins_token = current_user.get_jenkins_token()
        
    auth = (current_user.jenkins_username, jenkins_token)

    try:
        # Use a session for potential keep-alive benefits
        session = requests.Session()
        if auth:
            session.auth = auth

        # Make the request for console log text
        response = session.get(log_url, timeout=60) # Longer timeout for logs
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        # Return the raw text content with the original content type
        # Important: Do NOT set Access-Control-Allow-Origin here; Flask handles it if configured
        return response.text

    except requests.exceptions.RequestException as e:
        error_message, status_code = format_request_error(e, log_url)
        return jsonify({'error': error_message}), status_code
    except Exception as e:
        app.logger.error(f"Unexpected error fetching logs: {e}")
        return jsonify({'error': 'An unexpected server error occurred while fetching logs.'}), 500

def format_request_error(e, log_url):
    """Format error messages for Jenkins API request failures."""
    error_message = f"Error fetching logs from {log_url}: {e}"
    status_code = 500
    
    if hasattr(e, 'response') and e.response is not None:
        status_code = e.response.status_code
        # Provide more specific error if possible
        if status_code == 401:
            error_message = f'Authentication failed for {log_url}. Check credentials.'
        elif status_code == 403:
            error_message = f'Forbidden access to {log_url}. Check permissions or Jenkins CSRF settings.'
        elif status_code == 404:
            error_message = f'Resource not found at {log_url}. Check URL, Job Path, Build Number, and connectivity.'
        
        # Include response text if available and helpful
        try:
            response_text = e.response.text
            # Avoid dumping huge HTML pages, look for JSON error messages
            if APPLICATION_JSON in e.response.headers.get('Content-Type', ''):
                error_message += f" Details: {response_text[:500]}" # Limit length
            elif '<title>Error</title>' in response_text: # Jenkins error page
                error_message += " Jenkins returned an error page."
        except Exception: # Catch JSON decode errors or other issues
            pass # Keep the basic status code error message
            
    app.logger.error(error_message)
    return error_message, status_code

from flask_login import login_required, current_user
from flask import Response

@app.route('/api/proxy/log', methods=['GET'])
@login_required
def proxy_log():
    build_url = request.args.get('build_url')
    if not build_url:
        return jsonify({'error': 'Missing build_url parameter'}), 400

    # --- Use current_user credentials --- 
    try:
        configured = current_user.is_jenkins_configured()
        # Now, proceed if configured
        if not configured:
            return jsonify({'error': 'Jenkins is not configured for the current user.'}), 400
    except AttributeError as e:
        # If the attribute doesn't exist, we assume not configured for safety
        # Log this situation as it might indicate a programming error
        app.logger.error(f"AttributeError checking Jenkins config for user {current_user.id}: {e}")
        return jsonify({'error': 'Internal configuration error (AttributeError)'}), 500

    log_url = f"{build_url.rstrip('/')}/consoleText"
    jenkins_user = current_user.jenkins_username # Use direct attribute access like /api/builds
    jenkins_token = current_user.get_jenkins_token() # Assuming method exists

    try:
        response = requests.get(
            log_url,
            auth=(jenkins_user, jenkins_token) if jenkins_user and jenkins_token else None,
            timeout=30 # Add a timeout
        )
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        # Return the raw text content with the original content type
        # Important: Do NOT set Access-Control-Allow-Origin here; Flask handles it if configured
        return Response(response.content, content_type=response.headers.get('Content-Type'))

    except requests.exceptions.RequestException as e:
        error_message = f'Error fetching log from Jenkins: {e}'
        status_code = 500
        if hasattr(e, 'response') and e.response is not None:
             status_code = e.response.status_code
             # Provide more specific error if possible
             if status_code == 401 or status_code == 403:
                  error_message = 'Authentication or permission error accessing Jenkins log.'
             elif status_code == 404:
                  error_message = 'Jenkins log not found (404).'
             else:
                  error_message = f'Jenkins returned status {status_code}.'
        
        return jsonify({'error': error_message}), status_code
    except Exception as e:
        # Catch any other unexpected errors
        return jsonify({'error': 'An unexpected server error occurred.'}), 500

# Import config handling
import json
from flask import flash, redirect, url_for

# Constants
CONFIG_FILE = 'config.json'

# Config Handling Functions
def load_config():
    """Loads configuration from config.json."""
    try:
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"ANTHROPIC_API_KEY": ""} # Return default if file not found
    except json.JSONDecodeError:
        print(f"Error decoding {CONFIG_FILE}. Returning default config.")
        return {"ANTHROPIC_API_KEY": ""} # Return default on error

def save_config(config):
    """Saves configuration to config.json."""
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=4)
    except IOError as e:
        print(f"Error saving config to {CONFIG_FILE}: {e}")

# Settings Route
@app.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    config = load_config()
    form = SettingsForm(anthropic_api_key=config.get('ANTHROPIC_API_KEY', '')) # Instantiate form, pre-fill with current key

    if form.validate_on_submit(): # Use WTForms validation
        anthropic_key = form.anthropic_api_key.data.strip() # Get data from form object
        config['ANTHROPIC_API_KEY'] = anthropic_key
        save_config(config)
        if anthropic_key:
            flash('Anthropic API Key saved successfully.', 'success')
        else:
            flash('Anthropic API Key cleared.', 'info')
        return redirect(url_for('settings')) # Redirect to prevent form resubmission
    elif request.method == 'POST':
        # Handle validation errors if any (though Optional() makes this less likely for just one field)
        flash('There was an error saving the settings.', 'danger')

    # Pass the form object to the template for rendering
    return render_template('settings.html', form=form)

# Log Analysis API Route
@app.route('/api/analyze-log', methods=['POST'])
@login_required
def analyze_log():
    config = load_config()
    api_key = config.get('ANTHROPIC_API_KEY')

    if not api_key:
        return jsonify({"error": "Anthropic API Key not configured. Please set it in Settings."}), 400

    data = request.get_json()
    if not data or 'log_content' not in data:
        return jsonify({"error": "Missing 'log_content' in request body"}), 400

    log_content = data['log_content']
    if not log_content:
         return jsonify({"analysis": "Log content is empty. Nothing to analyze."}), 200

    try:
        client = anthropic.Anthropic(api_key=api_key)
        
        # Limit log content size to avoid excessive API costs/limits if necessary
        # Example: Truncate to last 500 lines or ~100k characters if needed
        max_chars = 100000 # Adjust as needed based on Claude's limits/pricing
        if len(log_content) > max_chars:
             log_content = log_content[-max_chars:]
             print(f"Warning: Log content truncated to last {max_chars} characters for analysis.")

        message = client.messages.create(
            model="claude-3-haiku-20240307", # Switch to Haiku model for testing
             max_tokens=1024, # Adjust max tokens for response length
             temperature=0.2, # Lower temperature for more factual analysis
             system="You are a helpful assistant specialized in analyzing Jenkins build logs.",
             messages=[
                 {
                     "role": "user",
                     "content": [
                         {
                             "type": "text",
                             "text": (
                                 "Please analyze the following Jenkins build log. Focus on:"
                                 "1. Identifying the main stages or significant steps."
                                 "2. Detecting any errors, failures, or critical warnings."
                                 "3. Providing a concise summary of the overall build outcome (Success, Failure, Unstable) and key findings."
                                 "Log Content:\n---\n"
                                 f"{log_content}"
                                 "\n---\nAnalysis:"
                             )
                         }
                     ]
                 }
             ]
        )
        
        analysis_text = "".join(block.text for block in message.content if block.type == 'text')
        return jsonify({"analysis": analysis_text})

    except anthropic.APIConnectionError as e:
        print(f"Anthropic API Connection Error: {e}")
        return jsonify({"error": "Could not connect to Anthropic API. Check network or API status."}), 503
    except anthropic.RateLimitError as e:
         print(f"Anthropic Rate Limit Error: {e}")
         return jsonify({"error": "Anthropic API rate limit exceeded. Please try again later."}), 429
    except anthropic.AuthenticationError as e:
        print(f"Anthropic Authentication Error: {e}")
        return jsonify({"error": "Anthropic API Key is invalid or missing. Check Settings."}), 401
    except anthropic.APIStatusError as e:
        error_details = e.response.text if hasattr(e.response, 'text') else str(e.response)
        app.logger.error(f"Anthropic API Status Error: Status {e.status_code}, Response Body: {error_details}")
        return jsonify({"error": f"Anthropic API returned an error: {e.status_code}"}), 502 # 502 Bad Gateway seems appropriate
    except Exception as e:
        print(f"Error during log analysis: {e}")
        return jsonify({"error": "An unexpected error occurred during analysis."}), 500

# --- New Jenkins Overview API ---
@app.route('/api/jenkins/overview')
@login_required
def jenkins_overview():
    """Fetches overview data like executor status and job count from Jenkins."""
    if not current_user.is_jenkins_configured():
        return jsonify({"error": "Jenkins is not configured."}), 400

    overview_data = {
        "executors": {"online": 0, "offline": 0, "total": 0},
        "jobs": {"count": 0}
    }
    error_messages = []

    # Fetch Executor Data
    try:
        executor_response = get_jenkins_api_data("/computer/api/json?tree=computer[offline,idle]")
        if executor_response:
            total_executors = len(executor_response.get('computer', []))
            online_executors = sum(1 for comp in executor_response.get('computer', []) if not comp.get('offline'))
            # idle_executors = sum(1 for comp in executor_response.get('computer', []) if comp.get('idle')) # Could add this later
            overview_data['executors']['total'] = total_executors
            overview_data['executors']['online'] = online_executors
            overview_data['executors']['offline'] = total_executors - online_executors
        else:
             error_messages.append("Failed to fetch executor data from Jenkins.")
    except Exception as e:
        app.logger.error(f"Error fetching Jenkins executor data: {e}")
        error_messages.append(f"Error fetching executor data: {e}")

    # Fetch Job Count
    try:
        jobs_response = get_jenkins_api_data("/api/json?tree=jobs[name]")
        if jobs_response:
            overview_data['jobs']['count'] = len(jobs_response.get('jobs', []))
        else:
            error_messages.append("Failed to fetch job data from Jenkins.")
    except Exception as e:
        app.logger.error(f"Error fetching Jenkins job data: {e}")
        error_messages.append(f"Error fetching job data: {e}")

    if error_messages:
        # Return partial data if available, along with errors
        overview_data['errors'] = error_messages
        # Decide on status code - 200 OK with errors, or maybe 207 Multi-Status?
        # Let's stick with 200 for now, client can check the errors array.
        return jsonify(overview_data), 200 
        
    return jsonify(overview_data)

# --- Helper: Get Anthropic Client ---
# Update to fetch API key from the logged-in user's settings
def get_anthropic_client():
    if not current_user or not current_user.is_authenticated:
        return None, "User not logged in."
    
    api_key = current_user.get_decrypted_anthropic_api_key()
    
    if not api_key:
        return None, "Anthropic API key not configured in user settings."
    return anthropic.Anthropic(api_key=api_key), None

# --- New API Endpoint: Suggest Stage Name ---
@app.route('/api/analyze/suggest_stage_name', methods=['POST'])
@login_required
def suggest_stage_name():
    # No changes needed here as get_anthropic_client now uses current_user implicitly
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400

    data = request.get_json()
    log_snippet = data.get('log_snippet')

    if not log_snippet:
        return jsonify({"error": "Missing 'log_snippet' in request"}), 400

    client, error_msg = get_anthropic_client()
    if error_msg:
        return jsonify({"error": error_msg}), 500

    # Limit snippet size to avoid excessive API costs/long processing
    max_snippet_length = 2000 # Adjust as needed
    if len(log_snippet) > max_snippet_length:
        log_snippet = log_snippet[:max_snippet_length] + "... (truncated)"

    prompt = (
        f"{anthropic.HUMAN_PROMPT} Analyze the following Jenkins build log snippet and suggest a concise, descriptive stage name "
        f"(max 4 words) that summarizes the primary action happening in this snippet. Focus on commands like git, mvn, docker, sh, echo, tests, deployment etc. "
        f"If no clear action is identifiable, return 'Processing'. Do not include prefixes like 'Stage:'.\n\n"
        f"Log Snippet:\n```\n{log_snippet}\n```\n\nSuggested Stage Name: {anthropic.AI_PROMPT}"
    )

    try:
        completion = client.completions.create(
            model="claude-instant-1.2", # Or another suitable model
            max_tokens_to_sample=30,
            prompt=prompt,
        )
        suggested_name = completion.completion.strip()
        # Basic validation/cleanup
        if not suggested_name or len(suggested_name) > 50:
             suggested_name = "Processing" # Fallback

        return jsonify({"suggested_name": suggested_name})

    except anthropic.BadRequestError as e:
         # Handle specific API errors like potential credit issues
        app.logger.error(f"Anthropic API Bad Request Error: {e}")
        error_detail = str(e) # Or parse e.body if more details are needed
        if "credits" in error_detail.lower():
            return jsonify({"error": "Insufficient Anthropic credits."}), 400
        else:
            return jsonify({"error": f"Anthropic API error: {error_detail}"}), 500
    except Exception as e:
        app.logger.error(f"Error suggesting stage name: {e}")
        return jsonify({"error": "Failed to analyze log snippet."}), 500

if __name__ == '__main__':
    # Check if running in a production environment
    is_prod = os.environ.get('FLASK_ENV') == 'production'
    
    # In production, let the WSGI server (Gunicorn) handle the app
    # In development, run with debug mode
    if not is_prod:
        app.run(debug=True)
