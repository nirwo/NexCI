@echo off
REM NeXCI Migration Script for Windows
REM This script runs the database migrations for the NeXCI application

echo Running NeXCI database migrations...

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

REM Check if migrations directory exists
if not exist migrations (
    echo Initializing migrations...
    python -m flask db init
)

REM Run the migrations
echo Running migrations...
python -m flask db migrate -m "Initial migration"
python -m flask db upgrade

echo Migrations completed. 