import os
import sys
import subprocess

def prepare_for_deployment():
    """Prepare the application for deployment by installing dependencies"""
    print("Starting deployment preparation...")
    
    try:
        # Install required packages
        packages = [
            "flask==2.3.3",
            "flask-login==0.6.2",
            "flask-sqlalchemy==3.0.5",
            "flask-wtf==1.2.1",
            "cryptography==42.0.4",
            "gunicorn==22.0.0",
            "requests==2.32.3",
            "python-dotenv==1.0.0",
            "sqlalchemy==2.0.27",
            "werkzeug==2.3.8",
            "wtforms==3.0.1",
            "Jinja2==3.1.3",
            "email_validator==2.1.0"
        ]
        
        for package in packages:
            print(f"Installing {package}...")
            subprocess.check_call([sys.executable, "-m", "pip", "install", package])
        
        print("All dependencies installed successfully.")
        
        # Test forms.py to make sure it works
        print("Testing forms.py...")
        with open('forms.py', 'r') as f:
            forms_content = f.read()
        
        if "Email()" in forms_content:
            print("WARNING: forms.py still contains Email() validator!")
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
            print("forms.py updated successfully.")
        else:
            print("forms.py already updated with Regexp validator. Good!")
        
        print("Deployment preparation completed successfully.")
        return True
    
    except Exception as e:
        print(f"ERROR during deployment preparation: {str(e)}")
        return False

if __name__ == "__main__":
    prepare_for_deployment()
