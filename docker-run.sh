#!/bin/bash
# Docker helper script for NeXCI

# Function to display help
show_help() {
    echo "NeXCI Docker Helper Script"
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  build       - Build the Docker image"
    echo "  start       - Start the Docker container"
    echo "  stop        - Stop the Docker container"
    echo "  restart     - Restart the Docker container"
    echo "  logs        - Show container logs"
    echo "  shell       - Open a shell in the container"
    echo "  db-init     - Initialize the database"
    echo "  help        - Show this help message"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Process commands
case "$1" in
    "build")
        echo "Building Docker image..."
        docker-compose build
        ;;
    "start")
        echo "Starting Docker container..."
        docker-compose up -d
        ;;
    "stop")
        echo "Stopping Docker container..."
        docker-compose down
        ;;
    "restart")
        echo "Restarting Docker container..."
        docker-compose restart
        ;;
    "logs")
        echo "Showing container logs..."
        docker-compose logs -f
        ;;
    "shell")
        echo "Opening shell in container..."
        docker-compose exec nexci /bin/bash
        ;;
    "db-init")
        echo "Initializing database..."
        docker-compose exec nexci python -m flask db init
        docker-compose exec nexci python -m flask db migrate -m "Initial migration"
        docker-compose exec nexci python -m flask db upgrade
        ;;
    "help"|"")
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac 