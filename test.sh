#!/bin/bash

# NeXCI Test Script
# This script helps with running tests

# Configuration
APP_DIR="/path/to/your/nexci"
COVERAGE_DIR="coverage"
TEST_DIR="tests"

# Function to run tests
run_tests() {
    echo "Running tests..."
    cd "$APP_DIR"
    source venv/bin/activate
    python -m pytest "$TEST_DIR" -v
}

# Function to run tests with coverage
run_coverage() {
    echo "Running tests with coverage..."
    cd "$APP_DIR"
    source venv/bin/activate
    python -m pytest "$TEST_DIR" --cov=app --cov-report=html -v
}

# Function to run specific test
run_specific_test() {
    echo "Running specific test: $1"
    cd "$APP_DIR"
    source venv/bin/activate
    python -m pytest "$TEST_DIR/$1" -v
}

# Main script
case "$1" in
    "test")
        run_tests
        ;;
    "coverage")
        run_coverage
        ;;
    "specific")
        if [ -z "$2" ]; then
            echo "Please specify a test file"
            exit 1
        fi
        run_specific_test "$2"
        ;;
    *)
        echo "Usage: $0 {test|coverage|specific <test_file>}"
        exit 1
        ;;
esac 