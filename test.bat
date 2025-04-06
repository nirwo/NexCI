@echo off
REM NeXCI Test Script for Windows
REM This script runs the tests for the NeXCI application

echo Running NeXCI tests...

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

REM Install test dependencies if not already installed
pip install pytest pytest-cov pytest-mock >nul 2>&1

REM Run the tests
echo Running tests...
python -m pytest tests/ -v --cov=app --cov=log_analyzer_engine --cov=models --cov=forms

echo Tests completed. 