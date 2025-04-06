#!/usr/bin/env python3
"""
Setup script for NLTK data
This script downloads the required NLTK data packages for the log analyzer.
Run this after installing requirements.txt
"""

import nltk
import sys

def download_nltk_data():
    """Download required NLTK data packages"""
    print("Downloading required NLTK data packages...")
    
    # List of required NLTK packages
    packages = [
        'punkt',      # For tokenization
        'stopwords',  # For filtering common words
        'averaged_perceptron_tagger',  # For part-of-speech tagging
        'wordnet'     # For word relationships
    ]
    
    for package in packages:
        try:
            print(f"Downloading {package}...")
            nltk.download(package, quiet=True)
            print(f"Successfully downloaded {package}")
        except Exception as e:
            print(f"Error downloading {package}: {str(e)}")
            return False
    
    print("All NLTK data packages downloaded successfully!")
    return True

if __name__ == "__main__":
    try:
        import nltk
    except ImportError:
        print("Error: NLTK is not installed. Please run 'pip install -r requirements.txt' first.")
        sys.exit(1)
    
    success = download_nltk_data()
    if not success:
        print("Some NLTK packages failed to download. Please check your internet connection and try again.")
        sys.exit(1) 