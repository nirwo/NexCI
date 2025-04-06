# Jenkins Log Viewer

A simple web application to fetch, clean, and display Jenkins build console logs for easier analysis.

## Features

- Fetch logs from a Jenkins job URL.
- Clean and format logs for readability.
- Highlight errors and warnings.
- View test results and build timelines.
- Analyze build execution times.

## Setup

1. Clone the repository.
2. Install dependencies: `pip install -r requirements.txt`
3. Run the application: `python app.py`
4. Access the app at `http://127.0.0.1:5001`

## Ubuntu Setup

1. Install Python 3.8 or higher:
   ```
   sudo apt update
   sudo apt install python3 python3-pip python3-venv
   ```

2. Create a virtual environment:
   ```
   python3 -m venv venv
   source venv/bin/activate
   ```

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Run the application:
   ```
   python app.py
   ```

5. Access the app at `http://127.0.0.1:5001`

## Windows Setup

1. Install Python 3.8 or higher from [python.org](https://www.python.org/downloads/).

2. Create a virtual environment:
   ```
   python -m venv venv
   venv\Scripts\activate
   ```

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Run the application:
   ```
   python app.py
   ```
   
   Alternatively, you can use the provided batch file:
   ```
   run.bat
   ```

5. Access the app at `http://127.0.0.1:5001`

## Development Tools

### Running Tests

On Ubuntu:
```
./test.sh
```

On Windows:
```
test.bat
```

### Running Linters

On Ubuntu:
```
./lint.sh
```

On Windows:
```
lint.bat
```

### Running Database Migrations

On Ubuntu:
```
./migrate.sh
```

On Windows:
```
migrate.bat
```

### Running in Production Mode

On Ubuntu:
```
./run_production.sh
```

On Windows:
```
run_production.bat
```

## Deployment

### Heroku
```heroku create
git push heroku main
```

### PythonAnywhere
1. Create a PythonAnywhere account
2. Set up a web app with WSGI configuration:
```python
import sys
path = '/home/yourusername/yourappname'
if path not in sys.path:
    sys.path.append(path)
from app import app as application
```

### Render
1. Create new Web Service
2. Connect to your GitHub repository
3. Use build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`

### Deployment Script

The application includes a deployment script that:
- Creates a backup before deployment
- Deploys the new version
- Sets up the virtual environment
- Checks application health
- Rolls back on failure

To use the deployment script:

1. Update the configuration in `deploy.sh`:
   - Set the correct `DEPLOY_DIR`
   - Set the correct `BACKUP_DIR`

2. Run the deployment script:
   ```bash
   ./deploy.sh
   ```

The script will:
- Create a backup of the current version
- Stop the application service
- Deploy the new version
- Set up the virtual environment
- Start the application service
- Check the application health
- Roll back if the deployment fails

## Production Deployment

To run the application in production mode:

1. Make sure you have all the required dependencies installed:
   ```bash
   pip install -r requirements.txt
   ```

2. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

3. Update the `.env` file with your configuration settings.

4. Run the production script:
   ```bash
   ./run_production.sh
   ```

The application will be available at http://127.0.0.1:5003

Note: For production deployments, it's recommended to:
- Use a reverse proxy like Nginx
- Set up SSL/TLS certificates
- Configure proper logging
- Use environment variables for sensitive information
- Set up monitoring and error tracking

### Nginx Configuration

For production deployments with Nginx:

1. Install Nginx:
   ```bash
   sudo apt update
   sudo apt install nginx
   ```

2. Copy the Nginx configuration:
   ```bash
   sudo cp nginx.conf /etc/nginx/sites-available/nexci
   sudo ln -s /etc/nginx/sites-available/nexci /etc/nginx/sites-enabled/
   ```

3. Test the configuration:
   ```bash
   sudo nginx -t
   ```

4. Restart Nginx:
   ```bash
   sudo systemctl restart nginx
   ```

Make sure to:
- Update the `server_name` directive with your domain
- Configure SSL/TLS certificates
- Update the static files path in the configuration
- Set up proper logging

### Running as a Systemd Service

To run the application as a systemd service:

1. Create a system user for the application:
   ```bash
   sudo useradd -r -s /bin/false nexci
   ```

2. Copy the service file:
   ```bash
   sudo cp nexci.service /etc/systemd/system/
   ```

3. Update the paths in the service file to match your installation.

4. Start and enable the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable nexci
   sudo systemctl start nexci
   ```

5. Check the service status:
   ```bash
   sudo systemctl status nexci
   ```

The service will automatically start on boot and restart if it crashes.

### Monitoring

The application includes a monitoring script that checks:
- Application health
- CPU usage
- Memory usage
- Disk usage

To use the monitoring script:

1. Update the configuration in `monitor.sh`:
   - Set the correct `APP_URL`
   - Configure the `ALERT_EMAIL`

2. Run the monitoring script:
   ```bash
   ./monitor.sh
   ```

3. To run the script in the background:
   ```bash
   nohup ./monitor.sh &
   ```

The script will:
- Log all checks to `monitor.log`
- Send email alerts when issues are detected
- Check the application every 5 minutes

### Backup

The application includes a backup script that:
- Creates compressed backups of the application data
- Includes the database, environment file, and logs
- Maintains a rolling backup of the last 5 backups

To use the backup script:

1. Update the configuration in `backup.sh`:
   - Set the correct `BACKUP_DIR`
   - Set the correct `APP_DIR`

2. Run the backup script:
   ```bash
   ./backup.sh
   ```

3. To automate backups, add a cron job:
   ```bash
   # Run backup daily at 2 AM
   0 2 * * * /path/to/your/nexci/backup.sh
   ```

The backups are stored in the specified backup directory with timestamps.

### Logging

The application uses a comprehensive logging system with:
- Application logs (`logs/app.log`)
- Access logs (`logs/access.log`)
- Error logs (`logs/error.log`)

The logging configuration is defined in `logging.conf` and includes:
- Console output for development
- Rotating file handlers (10MB per file, 5 backups)
- Different log levels for different components
- Formatted timestamps and log messages

Log files are automatically created in the `logs` directory when the application starts.

To view logs:
```bash
# Application logs
tail -f logs/app.log

# Access logs
tail -f logs/access.log

# Error logs
tail -f logs/error.log
```

### Database Migrations

The application includes a migration script to help with database changes:

1. Create a backup of the database:
   ```bash
   ./migrate.sh backup
   ```

2. Run database migrations:
   ```bash
   ./migrate.sh migrate
   ```

3. Rollback to the previous version:
   ```bash
   ./migrate.sh rollback
   ```

The migration script will:
- Create a backup before running migrations
- Use Flask-Migrate to handle database changes
- Provide rollback functionality if needed

Make sure to:
- Update the `APP_DIR` and `BACKUP_DIR` in the script
- Test migrations in a development environment first
- Keep backups of your database

### Testing

The application includes a test script to help with running tests:

1. Run all tests:
   ```bash
   ./test.sh test
   ```

2. Run tests with coverage:
   ```bash
   ./test.sh coverage
   ```

3. Run a specific test:
   ```bash
   ./test.sh specific test_file.py
   ```

The test script will:
- Run tests using pytest
- Generate coverage reports
- Support running specific test files

Make sure to:
- Update the `APP_DIR` in the script
- Install test dependencies: `pip install pytest pytest-cov`
- Write tests in the `tests` directory

### Code Quality

The application includes tools to maintain code quality:

1. Run flake8 (code style checker):
   ```bash
   ./lint.sh flake8
   ```

2. Run black (code formatter):
   ```bash
   ./lint.sh black
   ```

3. Run isort (import sorter):
   ```bash
   ./lint.sh isort
   ```

4. Run all linters:
   ```bash
   ./lint.sh all
   ```

The linting tools will:
- Check code style with flake8
- Format code with black
- Sort imports with isort

Make sure to:
- Update the `APP_DIR` in the script
- Install linting dependencies: `pip install flake8 black isort`
- Run linters before committing code
