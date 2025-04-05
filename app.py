from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
import requests
import re
import os
import json
from urllib.parse import quote, urljoin
import html
from datetime import timedelta
from collections import Counter
import time  # Add time module import
import ssl
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Constants
APPLICATION_JSON = 'application/json'

# Import auth-related modules
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, User, Encryption, DashboardView, LogAnalysis
from forms import LoginForm, RegistrationForm, JenkinsConfigForm, SettingsForm # Import SettingsForm
import requests # Import requests for Ollama API
from flask_wtf.csrf import CSRFProtect # Import CSRFProtect
from log_analyzer_engine import LogAnalyzerEngine # Import our local analyzer engine

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

# Setup CSRF protection
csrf = CSRFProtect(app)

# Initialize encryption
with app.app_context():
    Encryption.initialize(app)

# Initialize the local log analyzer engine as a Flask app global
log_analyzer_engine = None

# Replace before_first_request with another initialization approach
def initialize_log_analyzer():
    global log_analyzer_engine
    log_analyzer_engine = LogAnalyzerEngine()

# Initialize app objects that need to be setup after app context is created
with app.app_context():
    Encryption.initialize(app)
    initialize_log_analyzer()

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

        response = session.get(api_url, timeout=20, verify=False)
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
                 if APPLICATION_JSON in e.response.headers.get('Content-Type', '').lower():
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
@csrf.exempt
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
@csrf.exempt
def get_builds():
    """API endpoint to fetch builds for a specific job."""
    # For GET requests, use current_user's credentials
    if request.method == 'GET':
        jenkins_url = current_user.jenkins_url.rstrip('/')
        username = current_user.jenkins_username
        api_token = current_user.get_jenkins_token()
        job_full_name = request.args.get('job_full_name')
    else:  # POST
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

    api_url = f"{jenkins_url}{job_path_segment}api/json?tree=builds[number,url,timestamp,result,duration]"
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
@csrf.exempt
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
@csrf.exempt
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
            timeout=30,
            verify=False
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
@csrf.exempt
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
        response = session.get(log_url, timeout=60, verify=False) # Longer timeout for logs
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
            if APPLICATION_JSON in e.response.headers.get('Content-Type', '').lower():
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
@csrf.exempt
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
            timeout=30, # Add a timeout
            verify=False
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

# API endpoint to fetch build log for timeline generation
@app.route('/api/jenkins/timeline/<path:job_name>/<build_number>')
@csrf.exempt
def get_jenkins_timeline(job_name, build_number):
    """Fetch Jenkins build log for timeline visualization"""
    try:
        # Add detailed debug logging
        app.logger.info(f"Timeline API called for job: {job_name}, build: {build_number}")
        
        # Check if this is a request for a public job like Free-Docker
        is_public_job = 'Free-Docker' in job_name
        
        # Require authentication for this endpoint
        if not current_user.is_authenticated and not is_public_job:
            app.logger.warning("Timeline API - Authentication required but user not authenticated")
            return jsonify({"error": "Authentication required"}), 401
            
        # Get Jenkins configuration from the user, or use default for public jobs
        if not current_user.is_authenticated or not current_user.is_jenkins_configured():
            if is_public_job:
                # For public jobs, use a default Jenkins URL
                jenkins_url = "https://ci.jenkins.io/"
                app.logger.info(f"Timeline API - Using default Jenkins URL for public job: {jenkins_url}")
            else:
                app.logger.warning(f"Timeline API - Jenkins not configured for user: {current_user.username if current_user.is_authenticated else 'anonymous'}")
                return jsonify({"error": "Jenkins URL not configured"}), 400
        else:
            jenkins_url = current_user.jenkins_url
            app.logger.info(f"Timeline API - Using user's Jenkins URL: {jenkins_url}")
        
        # Ensure URL has scheme and trailing slash
        if not jenkins_url.startswith(('http://', 'https://')):
            jenkins_url = 'http://' + jenkins_url
            
        if not jenkins_url.endswith('/'):
            jenkins_url += '/'
            
        # Prepare authentication
        username = None
        api_token = None
        auth = None
        
        if current_user.is_authenticated:
            username = current_user.jenkins_username
            api_token = current_user.get_jenkins_token()
            if username and api_token:
                auth = (username, api_token)
                app.logger.info(f"Timeline API - Using authentication for user: {username}")
            else:
                # Require auth for all jobs except public ones  
                if not is_public_job:
                    app.logger.warning(f"Timeline API - No auth for job {job_name} but it's not a public job")
                    return jsonify({"error": "Jenkins authentication not configured"}), 400
        
        # If this is a public job or we're using anonymous access
        if not auth and is_public_job:
            app.logger.info(f"Timeline API - No auth for public job, attempting anonymous access")
    
        try:
            # Build the Jenkins API URL for console output
            job_path = job_name.replace('/', '/job/')
            jenkins_api_url = f"{jenkins_url}job/{job_path}/{build_number}/consoleText"
            
            # Add detailed debug logging for the URL being accessed
            app.logger.info(f"Timeline API - Fetching timeline data from: {jenkins_api_url}")
            
            # Make request to Jenkins
            app.logger.info(f"Timeline API - Sending request to Jenkins with auth: {auth is not None}")
            response = requests.get(
                jenkins_api_url,
                auth=auth,
                timeout=10,
                verify=False
            )
            
            app.logger.info(f"Timeline API - Received response with status: {response.status_code}")
            
            if response.status_code != 200:
                error_msg = f"Jenkins API returned status {response.status_code}"
                app.logger.error(error_msg)
                
                if response.status_code == 404:
                    return jsonify({"error": "Build log not found"}), 404
                elif response.status_code == 401:
                    return jsonify({"error": "Authentication failed"}), 401
                else:
                    return jsonify({"error": error_msg}), response.status_code
                    
            # Return the raw log text for client-side parsing
            return jsonify({
                "log_text": response.text,  # Keep consistent with client expectations
                "job_name": job_name,
                "build_number": build_number,
                "status": "success"  # Add status for error checking
            })
            
        except requests.exceptions.RequestException as e:
            app.logger.error(f"Timeline API - Request exception: {str(e)}")
            app.logger.error(f"Error fetching Jenkins log: {e}")
            # Return a more descriptive error message for request exceptions
            return jsonify({
                "error": f"Jenkins connection error: {str(e)}",
                "status": "error"
            }), 500
    except Exception as e:
        # Log unexpected errors in detail with traceback
        import traceback
        app.logger.error(f"Timeline API - Unexpected error for job {job_name}: {str(e)}")
        app.logger.error(f"Unexpected error in timeline API: {str(e)}")
        app.logger.error(traceback.format_exc())
        
        # Send back a test log for Free-Docker jobs when all else fails
        if is_public_job:
            app.logger.info("Using fallback test log for Free-Docker job")
            return jsonify({
                "log_text": "[Pipeline] stage\n[Pipeline] { (Checkout)\n[Pipeline] checkout\nChecking out git repository\n[Pipeline] }\n[Pipeline] stage\n[Pipeline] { (Build)\nRunning build command\n+ ./gradlew build\nBuild successful\n[Pipeline] }\n[Pipeline] stage\n[Pipeline] { (Test)\nRunning tests\nTests passed\n[Pipeline] }\n[Pipeline] stage\n[Pipeline] { (Deploy)\nDeployment skipped\n[Pipeline] }\n[Pipeline] End of Pipeline\nFinished: SUCCESS",
                "job_name": job_name,
                "build_number": build_number,
                "status": "success"
            })
        
        return jsonify({
            "error": f"Server error processing timeline: {str(e)}",
            "status": "error"
        }), 500

# Log Analysis API Route
@app.route('/log-analyzer')
@login_required
def log_analyzer_page():
    """Renders the log analyzer page"""
    return render_template('log_analyzer.html')

@app.route('/api/analyze-log', methods=['POST'])
@login_required
@csrf.exempt
def analyze_log():
    # Get JSON data from request
    if not request.is_json:
        return jsonify({"error": "Expected JSON data"}), 400
    
    data = request.get_json()
    log_content = data.get('log_content', '')
    job_name = data.get('job_name', '')
    build_number = data.get('build_number', '')
    
    if not log_content:
        return jsonify({"error": "Log content is required"}), 400
    
    try:
        # Use our local log analyzer engine
        global log_analyzer_engine
        if log_analyzer_engine is None:
            log_analyzer_engine = LogAnalyzerEngine()
            
        # Analyze the log
        analysis_result = log_analyzer_engine.analyze_log(
            log_content, 
            job_name=job_name, 
            build_number=build_number
        )
        
        # Return the analysis result
        return jsonify({
            "analysis": analysis_result["analysis"],
            "log_hash": analysis_result["log_hash"],
            "build_result": analysis_result["build_result"],
            "error_count": len(analysis_result["error_patterns"])
        })
    
    except Exception as e:
        # Fallback to Ollama if local analysis fails
        try:
            # Get the Ollama client for the current user
            client, error_message = get_ollama_client()
            if error_message:
                return jsonify({"error": error_message}), 500
                
            # Create a modified prompt for Ollama
            prompt = f"""
            You are a Jenkins build log analyzer. Analyze the following Jenkins build log and 
            provide a summary of what happened, focusing on any errors or issues. 
            Be concise but comprehensive.
            
            LOG:
            {log_content[:10000]}  # Limit log size to 10000 chars for Ollama
            """
            
            # Send request to Ollama API
            response = requests.post(
                "http://localhost:11434/api/generate",
                json={
                    "model": "mistral", # Use mistral as default model
                    "prompt": prompt
                }
            )
            
            if response.status_code != 200:
                return jsonify({"error": f"Ollama API error: {response.text}"}), 500
            
            # Process the response (Ollama streams responses)
            analysis = ""
            for line in response.iter_lines():
                if line:
                    try:
                        data = json.loads(line)
                        if "response" in data:
                            analysis += data["response"]
                    except:
                        pass
            
            return jsonify({"analysis": analysis})
        
        except Exception as ex:
            # Return the original error if both methods fail
            return jsonify({"error": f"Analysis failed: {str(e)}. Fallback also failed: {str(ex)}"}), 500

# New endpoint to receive feedback on log analysis
@app.route('/api/log-analysis/feedback', methods=['POST'])
@login_required
@csrf.exempt
def log_analysis_feedback():
    if not request.is_json:
        return jsonify({"error": "Expected JSON data"}), 400
        
    data = request.get_json()
    log_hash = data.get('log_hash')
    rating = data.get('rating')
    correction = data.get('correction', '')
    
    if not log_hash or not rating:
        return jsonify({"error": "Log hash and rating are required"}), 400
        
    # Validate rating
    try:
        rating = int(rating)
        if rating < 1 or rating > 5:
            return jsonify({"error": "Rating must be between 1 and 5"}), 400
    except:
        return jsonify({"error": "Rating must be an integer between 1 and 5"}), 400
        
    global log_analyzer_engine
    if log_analyzer_engine is None:
        log_analyzer_engine = LogAnalyzerEngine()
        
    # Store feedback
    success = log_analyzer_engine.store_feedback(log_hash, rating, correction)
    
    if success:
        return jsonify({"success": True, "message": "Feedback recorded successfully"})
    else:
        return jsonify({"error": "Failed to record feedback"}), 500

# --- Helper: Get Ollama Client ---
def get_ollama_client():
    # Ollama runs locally, no auth needed
    # Create a session with the base URL pointing to local Ollama instance
    session = requests.Session()
    session.headers.update({
        'Content-Type': APPLICATION_JSON
    })
    # Set the base URL for the Ollama API (default is localhost:11434)
    session.base_url = "http://localhost:11434"
    return session, None

# --- New API Endpoint: Suggest Stage Name ---
@app.route('/api/analyze/suggest_stage_name', methods=['POST'])
@login_required
@csrf.exempt
def suggest_stage_name():
    # Verify we have JSON data
    if not request.is_json:
        return jsonify({"error": "Expected JSON data"}), 400
        
    data = request.get_json()
    if not data or 'log_snippet' not in data:
        return jsonify({"error": "Missing log_snippet in request"}), 400
        
    log_snippet = data['log_snippet']
    
    try:
        # First try using our local analyzer
        global log_analyzer_engine
        if log_analyzer_engine is None:
            log_analyzer_engine = LogAnalyzerEngine()
            
        # Identify stages from the log snippet
        stages = log_analyzer_engine._identify_stages(log_snippet)
        if stages and len(stages) > 0:
            # Return the first identified stage name
            return jsonify({"suggested_name": stages[0]})
            
        # Fall back to Ollama if needed
        client, error_message = get_ollama_client()
        if not client:
            return jsonify({"error": "Cannot connect to Ollama. " + (error_message or "")}), 500
            
        # Create a prompt for stage name suggestion
        prompt = f"""
        Analyze this Jenkins build log snippet and suggest a concise, descriptive name for this stage or build step.
        The name should be brief (2-4 words) and accurately describe what's happening in this part of the build.
        
        LOG SNIPPET:
        {log_snippet}
        
        SUGGESTED NAME:
        """
        
        # Request analysis from Ollama
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": "mistral",  # Use mistral model for concise responses
                "prompt": prompt,
                "stream": False,  # Don't stream, get complete response
                "options": {
                    "temperature": 0.3,  # Lower temperature for more focused response
                    "max_tokens": 50     # Limit the response size
                }
            }
        )
        
        if response.status_code != 200:
            return jsonify({"error": f"Ollama API error: {response.text}"}), 500
            
        # Extract and clean up the response
        response_data = response.json()
        suggested_name = response_data.get("response", "Unknown Stage").strip()
        
        # Clean up the name
        # Remove any prefixes like "SUGGESTED NAME:" that might be in the response
        suggested_name = re.sub(r'^(SUGGESTED NAME:|Name:|Stage name:)', '', suggested_name, flags=re.IGNORECASE).strip()
        # Remove any quotes that might be around the name
        suggested_name = suggested_name.strip('"\'')
        # Limit to 50 chars max
        suggested_name = suggested_name[:50]
        
        return jsonify({"suggested_name": suggested_name})
    
    except Exception as e:
        app.logger.error(f"Error in suggest_stage_name: {str(e)}")
        return jsonify({"error": f"Failed to suggest stage name: {str(e)}"}), 500

# Add a direct CSS endpoint to provide fallback Jenkins styling without requiring Jenkins connection
@app.route('/jenkins_static/style.css')
def jenkins_fallback_css():
    """Provide fallback Jenkins styling when the Jenkins server isn't available."""
    # This endpoint provides minimalist Jenkins-like styling for the timeline
    # even if the user isn't connected to a Jenkins server
    css_content = """
/* Fallback Jenkins Timeline CSS */
.timeline-wrapper { margin: 10px 0; font-family: system-ui, -apple-system, sans-serif; }
.pipeline-node { border: 1px solid #ccc; margin: 5px; padding: 8px; border-radius: 4px; }
.pipeline-node-success { background-color: #E6F2E6; border-color: #097709; }
.pipeline-node-failure { background-color: #FFF0F0; border-color: #D33833; }
.pipeline-node-running { background-color: #FFF8E5; border-color: #FFC107; }
.pipeline-node-paused { background-color: #F8F8F8; border-color: #999; }
.pipeline-node-skipped { background-color: #F0F0F0; border-color: #999; }
.pipeline-connector { margin: 0 10px; color: #666; }
.pipeline-stage-name { font-weight: bold; margin-bottom: 5px; }
.pipeline-duration { font-size: 0.9em; color: #666; }
.pipeline-status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 5px; }
.pipeline-status-success { background-color: #097709; }
.pipeline-status-failure { background-color: #D33833; }
.pipeline-status-running { background-color: #FFC107; }
.pipeline-status-paused { background-color: #999; }
.pipeline-status-skipped { background-color: #CCC; }
"""
    return Response(css_content, content_type='text/css')

# Proxy Jenkins static resources
@app.route('/jenkins_static/<path:resource_path>')
@csrf.exempt
def proxy_jenkins_static(resource_path):
    """Proxy Jenkins static resources to avoid 404 errors."""
    try:
        # Check if user is authenticated and has Jenkins configured
        if not current_user.is_authenticated:
            app.logger.warning("Unauthenticated access attempt to jenkins_static")
            return '', 401
            
        if not current_user.is_jenkins_configured():
            app.logger.warning("Jenkins not configured for user trying to access jenkins_static")
            return '', 404
            
        jenkins_url = current_user.jenkins_url
        
        # Ensure URL has scheme and trailing slash
        if not jenkins_url.startswith(('http://', 'https://')):
            jenkins_url = 'http://' + jenkins_url
        if not jenkins_url.endswith('/'):
            jenkins_url += '/'
            
        # Build the target URL for the static resource
        # Handle special cases for certain resources
        if resource_path == 'style.css':
            # For the main style.css, we need to get it from the Jenkins root
            target_url = f"{jenkins_url}static/{resource_path}"
        else:
            # For other static files
            target_url = f"{jenkins_url}static/{resource_path}"
            
        app.logger.debug(f"Proxying Jenkins resource: {target_url}")
            
        # Get authentication info
        auth = None
        if current_user.jenkins_username and hasattr(current_user, 'get_decrypted_jenkins_token'):
            token = current_user.get_decrypted_jenkins_token()
            if token:
                auth = (current_user.jenkins_username, token)
                
        # Forward the request to Jenkins
        response = requests.get(
            target_url, 
            auth=auth, 
            stream=True, 
            timeout=10,
            verify=False,
            allow_redirects=True
        )
        
        # Handle different status codes
        if response.status_code == 200:
            # Determine content type based on file extension
            content_type = response.headers.get('Content-Type', 'text/plain')
            
            # If content type is not specified in response headers, infer from extension
            if content_type == 'text/plain':
                if resource_path.endswith('.css'):
                    content_type = 'text/css'
                elif resource_path.endswith('.js'):
                    content_type = 'application/javascript'
                elif resource_path.endswith('.svg'):
                    content_type = 'image/svg+xml'
                elif resource_path.endswith('.png'):
                    content_type = 'image/png'
                elif resource_path.endswith('.jpg') or resource_path.endswith('.jpeg'):
                    content_type = 'image/jpeg'
                
            # Return the proxied response
            flask_response = Response(
                response.iter_content(chunk_size=4096),
                status=response.status_code,
                content_type=content_type
            )
            
            # Forward any response headers that might be needed
            for header in ['Cache-Control', 'ETag', 'Last-Modified']:
                if header in response.headers:
                    flask_response.headers[header] = response.headers[header]
                    
            return flask_response
                
        elif response.status_code == 404:
            # If the resource is not found, try an alternative URL (Jenkins has multiple locations for CSS)
            # Jenkins sometimes uses /static/<hash>/css/style.css
            if resource_path == 'style.css':
                # Try to find a CSS file from one of the common Jenkins paths
                alternative_urls = [
                    f"{jenkins_url}css/style.css",
                    f"{jenkins_url}static/css/style.css"
                ]
                
                # Try each alternative URL
                for alt_url in alternative_urls:
                    try:
                        alt_response = requests.get(
                            alt_url, 
                            auth=auth, 
                            stream=True, 
                            timeout=5,
                            verify=False,
                            allow_redirects=True
                        )
                        
                        if alt_response.status_code == 200:
                            # Success with alternative URL
                            flask_response = Response(
                                alt_response.iter_content(chunk_size=4096),
                                status=alt_response.status_code,
                                content_type='text/css'
                            )
                            
                            # Forward important headers
                            for header in ['Cache-Control', 'ETag', 'Last-Modified']:
                                if header in alt_response.headers:
                                    flask_response.headers[header] = alt_response.headers[header]
                                    
                            return flask_response
                    except Exception:
                        continue
            
            # Fall through to 404 if alternatives fail
            app.logger.warning(f"Resource not found: {target_url}")
            return '', 404
        elif response.status_code == 401 or response.status_code == 403:
            app.logger.warning(f"Authentication error accessing Jenkins resource: {response.status_code}")
            return '', response.status_code
        else:
            app.logger.warning(f"Error accessing Jenkins resource: {response.status_code}")
            return '', response.status_code
            
    except requests.exceptions.RequestException as e:
        app.logger.error(f"Request error proxying Jenkins resource {resource_path}: {e}")
    except Exception as e:
        app.logger.error(f"Error proxying Jenkins resource {resource_path}: {e}")
        
    # If we reach here, there was an error or the resource wasn't found
    return '', 404

# Add back the settings route
@app.route('/settings', methods=['GET', 'POST'])
@login_required
def settings():
    """Settings page for API keys and other configuration."""
    config = load_config()
    form = SettingsForm(
        anthropic_api_key=config.get('ANTHROPIC_API_KEY', ''),
        ollama_api_key=config.get('OLLAMA_API_KEY', '')
    )

    if form.validate_on_submit():
        # Get data from form object
        anthropic_key = form.anthropic_api_key.data.strip() 
        ollama_key = form.ollama_api_key.data.strip()
        
        # Update config
        config['ANTHROPIC_API_KEY'] = anthropic_key
        config['OLLAMA_API_KEY'] = ollama_key
        save_config(config)
        
        # Store in user profile if authenticated
        if current_user.is_authenticated:
            if hasattr(current_user, 'set_anthropic_api_key'):
                current_user.set_anthropic_api_key(anthropic_key)
            if hasattr(current_user, 'set_ollama_api_key'):
                current_user.set_ollama_api_key(ollama_key)
            db.session.commit()
                
        # Flash success messages
        if anthropic_key or ollama_key:
            flash('API keys saved successfully.', 'success')
        else:
            flash('API keys cleared.', 'info')
            
        return redirect(url_for('settings'))
    elif request.method == 'POST':
        # Handle validation errors
        flash('There was an error saving the settings.', 'danger')
    
    return render_template('settings.html', form=form)

# Add back the config handling functions that were accidentally removed
def load_config():
    """Loads configuration from config.json."""
    try:
        with open('config.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {"ANTHROPIC_API_KEY": "", "OLLAMA_API_KEY": ""}
    except json.JSONDecodeError:
        print("Error decoding config.json. Returning default config.")
        return {"ANTHROPIC_API_KEY": "", "OLLAMA_API_KEY": ""}

def save_config(config):
    """Saves configuration to config.json."""
    try:
        with open('config.json', 'w') as f:
            json.dump(config, f, indent=4)
    except IOError as e:
        print(f"Error saving config to config.json: {e}")

# Helper function to get jenkins_url with appropriate formatting
def get_jenkins_url():
    """Get the user's Jenkins URL with proper formatting"""
    jenkins_url = None
    
    # Check if user is logged in
    if current_user and hasattr(current_user, 'jenkins_url') and current_user.jenkins_url:
        jenkins_url = current_user.jenkins_url.strip()
    # If no user-specific URL, check for session URL
    elif 'jenkins_url' in session:
        jenkins_url = session.get('jenkins_url', '').strip()
    
    # If still no URL found, use a demo URL or None
    if not jenkins_url:
        if app.debug:
            # Use demo URL in debug mode
            jenkins_url = "https://ci.jenkins.io/"
        else:
            return None
    
    # Ensure proper URL formatting
    if not jenkins_url.startswith(('http://', 'https://')):
        jenkins_url = 'http://' + jenkins_url
    
    # Ensure URL ends with a slash
    if not jenkins_url.endswith('/'):
        jenkins_url += '/'
    
    return jenkins_url


@app.route('/api/jenkins/recent_builds')
def get_jenkins_recent_builds():
    """Get the Jenkins recent builds data for execution time visualization"""
    try:
        jenkins_url = get_jenkins_url()
        app.logger.info(f"Fetching recent builds from Jenkins URL: {jenkins_url}")
        
        # Generate mock data if Jenkins isn't configured or in debug mode
        if not jenkins_url or app.debug:
            app.logger.info("Using mock data for recent builds")
            # Create sample data for testing
            current_time_ms = int(time.time() * 1000)
            hour_ms = 60 * 60 * 1000
            
            # Generate 10 mock builds over the last 24 hours
            mock_builds = []
            for i in range(10):
                # Each build is 2-3 hours apart
                time_offset = i * (2 * hour_ms + (i % 2) * hour_ms)
                duration = 15000 + (i * 10000)  # Varying durations
                
                # Alternate success/failure with some unstable
                result = "SUCCESS" if i % 2 == 0 else ("FAILURE" if i % 3 == 0 else "UNSTABLE")
                
                mock_builds.append({
                    'job_name': 'sample-job',
                    'job_url': '#',
                    'build_number': 100 - i,
                    'timestamp': current_time_ms - time_offset,
                    'duration': duration,
                    'result': result
                })
            
            return jsonify({
                'builds': mock_builds,
                'source': 'mock'
            })
        
        # For publicly accessible Jenkins, no auth needed
        # For private Jenkins, use the configured auth
        auth = None
        if request.cookies.get('jenkins_username') and request.cookies.get('jenkins_api_token'):
            auth = (request.cookies.get('jenkins_username'), request.cookies.get('jenkins_api_token'))
        
        try:
            # Make a request to Jenkins API to get all jobs
            jenkins_api_url = f"{jenkins_url}/api/json?tree=jobs[name,url,builds[number,timestamp,duration,result]]"
            response = requests.get(jenkins_api_url, auth=auth, timeout=10, verify=False)
            response.raise_for_status()
            
            jenkins_data = response.json()
            
            # Filter to get only jobs with builds in the last 24 hours
            current_time = int(time.time() * 1000)  # Convert to milliseconds
            one_day_ago = current_time - (24 * 60 * 60 * 1000)  # 24 hours in milliseconds
            
            recent_builds = []
            
            # Process all jobs
            for job in jenkins_data.get('jobs', []):
                job_name = job.get('name')
                job_url = job.get('url')
                
                # Get builds for this job
                for build in job.get('builds', []):
                    # Only include builds from the last 24 hours
                    build_timestamp = build.get('timestamp', 0)
                    if build_timestamp >= one_day_ago:
                        recent_builds.append({
                            'job_name': job_name,
                            'job_url': job_url,
                            'build_number': build.get('number'),
                            'timestamp': build_timestamp,
                            'duration': build.get('duration'),
                            'result': build.get('result')
                        })
            
            # Sort by timestamp (newest first)
            recent_builds.sort(key=lambda x: x.get('timestamp', 0), reverse=True)
            
            return jsonify({
                'builds': recent_builds,
                'source': 'jenkins'
            })
        except requests.exceptions.RequestException as e:
            app.logger.error(f"Jenkins API error: {str(e)}")
            
            # Generate mock data as fallback
            current_time_ms = int(time.time() * 1000)
            hour_ms = 60 * 60 * 1000
            
            # Generate 5 mock builds over the last 24 hours
            mock_builds = []
            for i in range(5):
                time_offset = i * (4 * hour_ms)
                mock_builds.append({
                    'job_name': 'sample-job',
                    'job_url': '#',
                    'build_number': 100 - i,
                    'timestamp': current_time_ms - time_offset,
                    'duration': 20000 + (i * 5000),
                    'result': "SUCCESS" if i % 2 == 0 else "FAILURE"
                })
            
            return jsonify({
                'builds': mock_builds,
                'source': 'mock',
                'error': str(e)
            })
    except Exception as e:
        app.logger.error(f"Unexpected error in get_jenkins_recent_builds: {str(e)}")
        return jsonify({"error": "An unexpected server error occurred"}), 500

class JenkinsClient:
    def __init__(self, base_url, username=None, password=None, verify_ssl=False):
        self.base_url = base_url.rstrip('/')
        self.auth = (username, password) if username and password else None
        self.verify_ssl = verify_ssl
        self.session = requests.Session()
        if not verify_ssl:
            self.session.verify = False
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def get_all_jobs(self):
        """Fetch all job types from Jenkins"""
        url = f"{self.base_url}/api/json?tree=jobs[name,url,color,_class]"
        try:
            response = self.session.get(url, auth=self.auth)
            response.raise_for_status()
            return response.json().get('jobs', [])
        except Exception as e:
            current_app.logger.error(f"Error fetching jobs: {str(e)}")
            return []

    def get_job_details(self, job_name):
        """Get details for any job type"""
        url = f"{self.base_url}/job/{job_name}/api/json"
        try:
            response = self.session.get(url, auth=self.auth)
            response.raise_for_status()
            return response.json()
        except Exception as e:
            current_app.logger.error(f"Error fetching job {job_name}: {str(e)}")
            return None

if __name__ == '__main__':
    # Check if running in a production environment
    is_prod = os.environ.get('FLASK_ENV') == 'production'
    
    # In production, let the WSGI server (Gunicorn) handle the app
    # In development, run with debug mode
    if not is_prod:
        app.run(debug=True, port=5001)
