@echo off
REM NeXCI Lint Script for Windows
REM This script runs the linters for the NeXCI application

echo Running NeXCI linters...

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Python is not installed or not in PATH. Please install Python 3.
    exit /b 1
)

REM Activate virtual environment if it exists
if exist venv (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
) else (
    echo Virtual environment not found. Creating one...
    python -m venv venv
    call venv\Scripts\activate.bat
    echo Installing dependencies...
    pip install -r requirements.txt
)

REM Install linting dependencies if not already installed
pip install flake8 black isort >nul 2>&1

REM Run the linters
echo Running flake8...
python -m flake8 app.py log_analyzer_engine.py models.py forms.py

echo Running black...
python -m black app.py log_analyzer_engine.py models.py forms.py

echo Running isort...
python -m isort app.py log_analyzer_engine.py models.py forms.py

echo Linting completed. 