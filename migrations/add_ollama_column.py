import sqlite3
import os

def main():
    # Get the path to the SQLite database file - it's in the instance directory
    db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'instance', 'jenkins_monitor.db')
    
    if not os.path.exists(db_path):
        print(f"Database file not found at {db_path}")
        return
    
    print(f"Found database at {db_path}")
    
    # Connect to the database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Check if the column already exists
        cursor.execute("PRAGMA table_info(user)")
        columns = cursor.fetchall()
        column_names = [column[1] for column in columns]
        
        if 'ollama_api_key_encrypted' in column_names:
            print("Column 'ollama_api_key_encrypted' already exists. No changes needed.")
            return
        
        # Add the column to the user table
        print("Adding 'ollama_api_key_encrypted' column to the user table...")
        cursor.execute("ALTER TABLE user ADD COLUMN ollama_api_key_encrypted TEXT")
        
        # Commit the changes
        conn.commit()
        print("Column added successfully!")
    
    except Exception as e:
        print(f"Error: {e}")
        conn.rollback()
    
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()
