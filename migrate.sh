#!/bin/bash

# NeXCI Database Migration Script
# This script helps with database migrations

# Configuration
APP_DIR="/path/to/your/nexci"
BACKUP_DIR="/path/to/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Function to create backup
create_backup() {
    echo "Creating database backup..."
    ./backup.sh
}

# Function to run migrations
run_migrations() {
    echo "Running database migrations..."
    cd "$APP_DIR"
    source venv/bin/activate
    flask db upgrade
}

# Function to rollback
rollback() {
    echo "Rolling back to previous version..."
    cd "$APP_DIR"
    source venv/bin/activate
    flask db downgrade
}

# Main script
case "$1" in
    "backup")
        create_backup
        ;;
    "migrate")
        create_backup
        run_migrations
        ;;
    "rollback")
        rollback
        ;;
    *)
        echo "Usage: $0 {backup|migrate|rollback}"
        exit 1
        ;;
esac 