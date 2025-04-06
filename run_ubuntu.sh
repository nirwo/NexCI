#!/bin/bash

# NeXCI Ubuntu Setup Script
# This script sets up and runs the NeXCI application on Ubuntu

echo "Setting up NeXCI application..."

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

# Run the application
echo "Starting the application..."
echo "The application will be available at http://127.0.0.1:5003"
python app.py 