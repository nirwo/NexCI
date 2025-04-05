from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from cryptography.fernet import Fernet, InvalidToken
import os
import base64
import hashlib

db = SQLAlchemy()

# Generate a key for encryption
def generate_key():
    return base64.urlsafe_b64encode(os.urandom(32))

# For encrypting sensitive data like API tokens
class Encryption:
    _key = None
    _cipher = None
    
    @classmethod
    def initialize(cls, app):
        """Initializes the encryption cipher using a key derived from Flask's SECRET_KEY."""
        # Use Flask's SECRET_KEY for Fernet encryption. Ensure SECRET_KEY is set!
        if 'SECRET_KEY' not in app.config or not app.config['SECRET_KEY']:
            raise ValueError("Flask SECRET_KEY must be set for encryption.")
        
        # Derive a 32-byte key from the SECRET_KEY using SHA256
        # Then encode it using URL-safe base64 for Fernet
        secret_key = app.config['SECRET_KEY']
        hashed_key = hashlib.sha256(secret_key.encode('utf-8')).digest() # 32 bytes
        cls._key = base64.urlsafe_b64encode(hashed_key) # URL-safe base64 encoded
        
        cls._cipher = Fernet(cls._key)
    
    @classmethod
    def encrypt(cls, data):
        if not cls._cipher:
            raise ValueError("Encryption not initialized")
        return cls._cipher.encrypt(data.encode()).decode()
    
    @classmethod
    def decrypt(cls, encrypted_data):
        if not cls._cipher:
            raise ValueError("Encryption not initialized")
        return cls._cipher.decrypt(encrypted_data.encode()).decode()

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    
    # Jenkins credentials (encrypted)
    jenkins_url = db.Column(db.String(255))
    jenkins_username = db.Column(db.String(100))
    jenkins_api_token_encrypted = db.Column(db.Text)
    
    # Anthropic API Key (encrypted)
    anthropic_api_key_encrypted = db.Column(db.Text)
    
    # Ollama API Key (encrypted)
    ollama_api_key_encrypted = db.Column(db.Text)
 
    # Dashboard preferences
    dashboard_settings = db.Column(db.Text) # JSON string for flexibility
    
    def set_password(self, password):
        # Explicitly use pbkdf2:sha256 to avoid scrypt issues with older OpenSSL
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def set_jenkins_token(self, token):
        if token:
            self.jenkins_api_token_encrypted = Encryption.encrypt(token)
    
    def get_jenkins_token(self):
        """Decrypts and returns the user's Jenkins API token."""
        if not self.jenkins_api_token_encrypted:
            return None
        try:
            return Encryption.decrypt(self.jenkins_api_token_encrypted)
        except InvalidToken:
            # Handle error: maybe log it, maybe return None or raise specific exception
            print(f"Error decrypting token for user {self.id}") # Simple logging
            return None # Or raise an exception
    
    def set_anthropic_api_key(self, api_key):
        """Encrypts and stores the Anthropic API key."""
        if api_key:
            self.anthropic_api_key_encrypted = Encryption.encrypt(api_key)
        else:
            self.anthropic_api_key_encrypted = None
            
    def get_decrypted_anthropic_api_key(self):
        """Decrypts and returns the user's Anthropic API key."""
        if not self.anthropic_api_key_encrypted:
            return None
        try:
            return Encryption.decrypt(self.anthropic_api_key_encrypted)
        except InvalidToken as e:
            print(f"Error decrypting Anthropic API key for user {self.id}: {e}") 
            return None
            
    def set_ollama_api_key(self, api_key):
        """Encrypts and stores the Ollama API key."""
        if api_key:
            self.ollama_api_key_encrypted = Encryption.encrypt(api_key)
        else:
            self.ollama_api_key_encrypted = None
            
    def get_decrypted_ollama_api_key(self):
        """Decrypts and returns the user's Ollama API key."""
        if not self.ollama_api_key_encrypted:
            return None
        try:
            return Encryption.decrypt(self.ollama_api_key_encrypted)
        except InvalidToken as e:
            print(f"Error decrypting Ollama API key for user {self.id}: {e}") 
            return None
            
    def get_decrypted_jenkins_token(self):
        """Alias for get_jenkins_token() - returns the decrypted Jenkins API token."""
        return self.get_jenkins_token()
    
    def is_jenkins_configured(self):
        """Checks if the user has Jenkins URL, username, and token configured."""
        return bool(self.jenkins_url and self.jenkins_username and self.jenkins_api_token_encrypted)
    
    def __repr__(self):
        return f'<User {self.username}>'

# Dashboard saved views
class DashboardView(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    config = db.Column(db.Text, nullable=False)  # JSON configuration
    is_default = db.Column(db.Boolean, default=False)
    
    user = db.relationship('User', backref=db.backref('dashboard_views', lazy=True))
