#!/bin/bash

# NeXCI Monitoring Script
# This script checks the health of the NeXCI application

# Configuration
APP_URL="http://127.0.0.1:5003"
LOG_FILE="monitor.log"
ALERT_EMAIL="admin@example.com"

# Function to log messages
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Function to send alert
send_alert() {
    echo "Alert: $1" | mail -s "NeXCI Alert" "$ALERT_EMAIL"
}

# Check if the application is responding
check_app() {
    if curl -s -f "$APP_URL/health" > /dev/null; then
        log_message "Application is healthy"
        return 0
    else
        log_message "Application is not responding"
        send_alert "Application is not responding at $APP_URL"
        return 1
    fi
}

# Check system resources
check_resources() {
    # Check CPU usage
    cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}')
    if (( $(echo "$cpu_usage > 80" | bc -l) )); then
        log_message "High CPU usage: $cpu_usage%"
        send_alert "High CPU usage: $cpu_usage%"
    fi

    # Check memory usage
    memory_usage=$(free | grep Mem | awk '{print $3/$2 * 100.0}')
    if (( $(echo "$memory_usage > 80" | bc -l) )); then
        log_message "High memory usage: $memory_usage%"
        send_alert "High memory usage: $memory_usage%"
    fi

    # Check disk usage
    disk_usage=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 80 ]; then
        log_message "High disk usage: $disk_usage%"
        send_alert "High disk usage: $disk_usage%"
    fi
}

# Main monitoring loop
log_message "Starting monitoring"
while true; do
    check_app
    check_resources
    sleep 300  # Check every 5 minutes
done 