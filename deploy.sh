#!/bin/bash

# NeXCI Deployment Script
# This script deploys the application to a production environment

# Configuration
DEPLOY_DIR="/path/to/production"
BACKUP_DIR="/path/to/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup before deployment
echo "Creating backup..."
./backup.sh

# Stop the application service
echo "Stopping application service..."
sudo systemctl stop nexci

# Deploy new version
echo "Deploying new version..."
rsync -av --exclude 'venv' \
    --exclude '.git' \
    --exclude 'instance' \
    --exclude '*.pyc' \
    --exclude '__pycache__' \
    --exclude '.env' \
    ./ "$DEPLOY_DIR/"

# Copy environment file if it exists
if [ -f ".env" ]; then
    cp .env "$DEPLOY_DIR/"
fi

# Set up virtual environment
echo "Setting up virtual environment..."
cd "$DEPLOY_DIR"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start the application service
echo "Starting application service..."
sudo systemctl start nexci

# Check application health
echo "Checking application health..."
sleep 10
if curl -s -f "http://127.0.0.1:5003/health" > /dev/null; then
    echo "Deployment successful!"
else
    echo "Deployment failed: Application is not healthy"
    # Rollback to previous version
    echo "Rolling back..."
    sudo systemctl stop nexci
    tar -xzf "$BACKUP_DIR/nexci_backup_$(ls -t "$BACKUP_DIR"/nexci_backup_*.tar.gz | head -1)" -C "$DEPLOY_DIR"
    sudo systemctl start nexci
    exit 1
fi 