from flask import Flask, render_template, request, jsonify, redirect, url_for, flash, session
import requests
import re
import os
import json
from urllib.parse import quote, urljoin
import html
from datetime import timedelta
from collections import Counter

# Import auth-related modules
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, User, Encryption, DashboardView
from forms import LoginForm, RegistrationForm, JenkinsConfigForm

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

# Initialize encryption
with app.app_context():
    Encryption.initialize(app)

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Create database tables
with app.app_context():
    db.create_all()

# --- Helper Functions ---

def get_jenkins_api_data(api_url, username, api_token):
    """Helper function to make authenticated GET requests to Jenkins API."""
    auth = None
    if username and api_token:
        auth = (username, api_token)
    try:
        response = requests.get(api_url, auth=auth, timeout=30, headers={'Accept': 'application/json'})
        response.raise_for_status()
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
    
    return render_template('dashboard.html', 
                          title='Jenkins Dashboard',
                          jenkins_url=current_user.jenkins_url)

# --- API Routes ---
# Update API endpoints to use current_user's Jenkins credentials

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

    # --- Flatten the potentially nested job list --- 
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
    api_data, error_response = get_jenkins_api_data(api_url, current_user.jenkins_username, current_user.get_jenkins_token())

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

@app.route('/get_logs', methods=['POST'])
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

    auth = (current_user.jenkins_username, current_user.get_jenkins_token())

    try:
        # Use a session for potential keep-alive benefits
        session = requests.Session()
        if auth:
            session.auth = auth

        # Make the request for console log text
        response = session.get(log_url, timeout=60) # Longer timeout for logs
        response.raise_for_status() # Check for HTTP errors
        raw_log = response.text

        # Clean ANSI escape codes
        ansi_escape_pattern = re.compile(r'\x1b\[[0-9;]*[mK]')
        cleaned_log = ansi_escape_pattern.sub('', raw_log)

    except requests.exceptions.RequestException as e:
        error_message = f"Error fetching logs from {log_url}: {e}"
        status_code = 500
        if hasattr(e, 'response') and e.response is not None:
            status_code = e.response.status_code
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
                 if 'application/json' in e.response.headers.get('Content-Type', ''):
                     error_message += f" Details: {response_text[:500]}" # Limit length
                 elif '<title>Error</title>' in response_text: # Jenkins error page
                     error_message += " Jenkins returned an error page."
            except Exception:
                 pass # Ignore errors trying to get more details

        app.logger.error(error_message)
        return jsonify({'error': error_message}), status_code
    except Exception as e:
        app.logger.error(f"Unexpected error fetching logs: {e}")
        return jsonify({'error': 'An unexpected server error occurred while fetching logs.'}), 500

    # Return the cleaned log content
    return jsonify({'log': cleaned_log})

@app.route('/api/log', methods=['POST', 'GET'])
@login_required
def get_log():
    """API endpoint to fetch console logs for a build."""
    # Similar pattern for using current_user credentials
    data = request.json
    jenkins_url_base = current_user.jenkins_url # Base URL needed for potential relative path resolution (though build_url should be absolute)
    build_url = data.get('build_url') # Expecting the full URL to the specific build

    if not all([jenkins_url_base, build_url]):
        app.logger.error("Missing data for log request: %s", data)
        return jsonify({'error': 'Missing Jenkins URL or build URL'}), 400

    # Construct the URL for the console text API endpoint
    # It's usually the build URL + "/consoleText"
    log_api_url = urljoin(build_url, 'consoleText') # Use urljoin for robustness
    app.logger.info(f"Attempting to fetch log from: {log_api_url}")

    try:
        response = requests.get(
            log_api_url,
            auth=(current_user.jenkins_username, current_user.get_jenkins_token()),
            timeout=30 # Add a timeout
        )
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        # Check content type, Jenkins usually sends plain text
        content_type = response.headers.get('Content-Type', '')
        if 'text/plain' not in content_type.lower():
             app.logger.warning(f"Unexpected content type for log: {content_type}")
             # Still try to return the text, but log a warning
        
        log_content = response.text
        app.logger.info(f"Successfully fetched log for build URL: {build_url} (Content length: {len(log_content)})")
        return jsonify({'log_content': log_content})

    except requests.exceptions.HTTPError as http_err:
        app.logger.error(f"HTTP error occurred while fetching log: {http_err} - Status: {response.status_code} - Response: {response.text[:500]}")
        error_message = f"Jenkins API error: {response.status_code}"
        try:
            # Try to get a more specific error from Jenkins HTML response if possible
            if 'text/html' in response.headers.get('Content-Type', '').lower() and 'Authentication required' in response.text:
                error_message = "Authentication failed. Check username/API token."
            elif response.status_code == 404:
                error_message = "Build log not found (404)."
            else:
                # Try parsing if it's JSON (less likely for consoleText error)
                error_detail = response.json().get('message', response.text[:100]) # Limit error text length
                error_message = f"Jenkins API error: {response.status_code} - {error_detail}"
        except Exception: # Catch JSON decode errors or other issues
             pass # Keep the basic status code error message
        return jsonify({'error': error_message}), response.status_code
    except requests.exceptions.RequestException as req_err:
        app.logger.error(f"Request error occurred while fetching log: {req_err}")
        return jsonify({'error': f"Failed to connect to Jenkins log endpoint: {req_err}"}), 500
    except Exception as e:
        app.logger.error(f"An unexpected error occurred while fetching log: {e}", exc_info=True)
        return jsonify({'error': 'An internal server error occurred'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
