#!/bin/bash

# NeXCI Backup Script
# This script creates a backup of the application data

# Configuration
BACKUP_DIR="/path/to/backups"
APP_DIR="/path/to/your/nexci"
DB_FILE="$APP_DIR/instance/nexci.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="nexci_backup_$TIMESTAMP"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create backup
echo "Creating backup..."
tar -czf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" \
    -C "$APP_DIR" \
    instance/ \
    .env \
    logs/

# Keep only the last 5 backups
echo "Cleaning up old backups..."
ls -t "$BACKUP_DIR"/nexci_backup_*.tar.gz | tail -n +6 | xargs -r rm

echo "Backup completed: $BACKUP_NAME.tar.gz" 