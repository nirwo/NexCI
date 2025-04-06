@echo off
REM NeXCI Development Setup Script for Windows
REM This script sets up and runs the NeXCI application in development mode

echo Setting up NeXCI application for development...

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

REM Create .env file if it doesn't exist
if not exist .env (
    echo Creating .env file from example...
    copy .env.example .env
    echo Please update the .env file with your configuration.
)

REM Run the application
echo Starting the application in development mode...
echo The application will be available at http://127.0.0.1:5001
python app.py 