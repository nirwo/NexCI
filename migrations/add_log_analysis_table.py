"""
Migration script to add LogAnalysis table to the database
"""
import sqlite3
import os
import sys

# Add parent directory to path to import app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def run_migration():
    """Run the migration to add the LogAnalysis table"""
    # Get the database path from the main application
    from app import app
    
    # Get database path from app configuration
    with app.app_context():
        db_path = app.config['SQLALCHEMY_DATABASE_URI'].replace('sqlite:///', '')
    
    print(f"Running migration on database: {db_path}")
    
    # Connect to SQLite database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if table already exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='log_analysis'")
    if cursor.fetchone():
        print("LogAnalysis table already exists, skipping migration.")
        conn.close()
        return
    
    # Create log_analysis table
    cursor.execute('''
    CREATE TABLE log_analysis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        log_hash VARCHAR(64),
        job_name VARCHAR(255),
        build_number VARCHAR(50),
        build_result VARCHAR(50),
        log_snippet TEXT,
        analysis TEXT,
        feedback_rating INTEGER,
        feedback_correction TEXT,
        error_patterns TEXT,
        tags VARCHAR(255),
        use_for_training BOOLEAN DEFAULT 1,
        user_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES user(id)
    )
    ''')
    
    # Create index on log_hash for faster lookups
    cursor.execute('CREATE INDEX idx_log_hash ON log_analysis(log_hash)')
    
    # Commit changes and close connection
    conn.commit()
    conn.close()
    
    print("Successfully created LogAnalysis table")

if __name__ == "__main__":
    run_migration()
