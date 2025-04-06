#!/bin/bash

# NeXCI Linting Script
# This script helps with code linting

# Configuration
APP_DIR="/path/to/your/nexci"

# Function to run flake8
run_flake8() {
    echo "Running flake8..."
    cd "$APP_DIR"
    source venv/bin/activate
    flake8 .
}

# Function to run black
run_black() {
    echo "Running black..."
    cd "$APP_DIR"
    source venv/bin/activate
    black .
}

# Function to run isort
run_isort() {
    echo "Running isort..."
    cd "$APP_DIR"
    source venv/bin/activate
    isort .
}

# Function to run all linters
run_all() {
    echo "Running all linters..."
    run_black
    run_isort
    run_flake8
}

# Main script
case "$1" in
    "flake8")
        run_flake8
        ;;
    "black")
        run_black
        ;;
    "isort")
        run_isort
        ;;
    "all")
        run_all
        ;;
    *)
        echo "Usage: $0 {flake8|black|isort|all}"
        exit 1
        ;;
esac 