#!/bin/bash

# NeXCI Production Setup Script
# This script sets up and runs the NeXCI application in production mode

echo "Setting up NeXCI application for production..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Installing..."
    sudo apt update
    sudo apt install -y python3 python3-pip python3-venv
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -r requirements.txt

# Check if gunicorn is installed
if ! command -v gunicorn &> /dev/null; then
    echo "Installing gunicorn..."
    pip install gunicorn
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file from example..."
    cp .env.example .env
    echo "Please update the .env file with your configuration."
fi

# Run the application with gunicorn
echo "Starting the application in production mode..."
echo "The application will be available at http://127.0.0.1:5003"
gunicorn --bind 0.0.0.0:5003 app:app 