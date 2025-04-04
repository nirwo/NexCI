from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, BooleanField, SubmitField
from wtforms.validators import DataRequired, EqualTo, ValidationError, URL, Optional, Regexp
from models import User

class LoginForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    password = PasswordField('Password', validators=[DataRequired()])
    remember_me = BooleanField('Remember Me')
    submit = SubmitField('Sign In')

class RegistrationForm(FlaskForm):
    username = StringField('Username', validators=[DataRequired()])
    email = StringField('Email', validators=[DataRequired(), 
                       Regexp(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
                              message='Invalid email address')])
    password = PasswordField('Password', validators=[DataRequired()])
    password2 = PasswordField(
        'Repeat Password', validators=[DataRequired(), EqualTo('password')])
    submit = SubmitField('Register')

    def validate_username(self, username):
        user = User.query.filter_by(username=username.data).first()
        if user is not None:
            raise ValidationError('Please use a different username.')

    def validate_email(self, email):
        user = User.query.filter_by(email=email.data).first()
        if user is not None:
            raise ValidationError('Please use a different email address.')

class JenkinsConfigForm(FlaskForm):
    jenkins_url = StringField('Jenkins URL', validators=[DataRequired(), URL()])
    jenkins_username = StringField('Jenkins Username', validators=[DataRequired()])
    jenkins_api_token = PasswordField('Jenkins API Token', validators=[DataRequired()])
    submit = SubmitField('Save Jenkins Configuration')

# Form for Application Settings (like API keys)
class SettingsForm(FlaskForm):
    anthropic_api_key = StringField('Anthropic API Key', validators=[Optional()])
    submit = SubmitField('Save Settings')
