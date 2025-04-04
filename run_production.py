#!/usr/bin/env python3
import os
import sys
import subprocess

def run_production_server():
    """Run the application in production mode with gunicorn"""
    
    # Check if email_validator is installed
    try:
        import email_validator
        print("✓ email_validator is installed")
    except ImportError:
        print("Installing email_validator...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "email_validator"])
    
    # Check if forms.py has been updated
    with open('forms.py', 'r') as f:
        forms_content = f.read()
    
    if "Email()" in forms_content:
        print("Updating forms.py to use Regexp validator...")
        forms_content = forms_content.replace(
            "from wtforms.validators import DataRequired, Email,", 
            "from wtforms.validators import DataRequired, Regexp,"
        )
        forms_content = forms_content.replace(
            "validators=[DataRequired(), Email()]", 
            "validators=[DataRequired(), Regexp(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', message='Invalid email address')]"
        )
        
        with open('forms.py', 'w') as f:
            f.write(forms_content)
        print("✓ forms.py updated")
    
    # Set environment variables
    os.environ["FLASK_ENV"] = "production"
    
    # Start the server
    print("Starting production server on port 5001...")
    subprocess.call([
        sys.executable, "-m", "gunicorn", 
        "--bind", "0.0.0.0:5001", 
        "wsgi:app"
    ])

if __name__ == "__main__":
    run_production_server()
