#!/bin/bash
# Setup script for Ubuntu

echo "Setting up NeXCI environment on Ubuntu..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is not installed. Installing Python 3..."
    sudo apt-get update
    sudo apt-get install -y python3 python3-pip python3-venv
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install requirements
echo "Installing Python requirements..."
pip install -r requirements.txt

# Run NLTK setup script
echo "Setting up NLTK data..."
python setup_nltk.py

# Make the app.py executable
chmod +x app.py

echo "Setup complete! You can now run the application with:"
echo "source venv/bin/activate"
echo "python app.py" 