from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from cryptography.fernet import Fernet
import os
import base64

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
        # Get or generate encryption key
        if 'ENCRYPTION_KEY' not in app.config:
            app.config['ENCRYPTION_KEY'] = generate_key()
        
        cls._key = app.config['ENCRYPTION_KEY']
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
    
    # Dashboard preferences
    dashboard_settings = db.Column(db.Text) # JSON string for flexibility
    
    def set_password(self, password):
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        return check_password_hash(self.password_hash, password)
    
    def set_jenkins_token(self, token):
        if token:
            self.jenkins_api_token_encrypted = Encryption.encrypt(token)
    
    def get_jenkins_token(self):
        if self.jenkins_api_token_encrypted:
            return Encryption.decrypt(self.jenkins_api_token_encrypted)
        return None
    
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
