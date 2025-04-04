# Jenkins Log Viewer

A simple web application to fetch, clean, and display Jenkins build console logs for easier analysis.

## Features

- Fetch logs from a Jenkins job URL.
- Clean and format logs for readability.
- Highlight errors and warnings (future enhancement).

## Setup

1. Clone the repository.
2. Install dependencies: `pip install -r requirements.txt`
3. Run the application: `python app.py`
4. Access the app at `http://127.0.0.1:5000`

## Deployment

### Heroku
```
heroku create
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
