import os
import sys

# Install email_validator directly in the wsgi file
try:
    import email_validator
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "email_validator"])

# Now import the app
from app import app

if __name__ == "__main__":
    app.run()
