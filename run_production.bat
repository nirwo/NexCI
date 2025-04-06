@echo off
REM NeXCI Production Setup Script for Windows
REM This script sets up and runs the NeXCI application in production mode

echo Setting up NeXCI application for production...

REM Check if Python is installed
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Python is not installed or not in PATH. Please install Python 3.
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt

REM Check if gunicorn is installed
pip show gunicorn >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Installing gunicorn...
    pip install gunicorn
)

REM Create .env file if it doesn't exist
if not exist .env (
    echo Creating .env file from example...
    copy .env.example .env
    echo Please update the .env file with your configuration.
)

REM Run the application with gunicorn
echo Starting the application in production mode...
echo The application will be available at http://127.0.0.1:5001
python run_production.py 