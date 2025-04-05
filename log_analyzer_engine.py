"""
Local Log Analyzer Engine that progressively improves through training
"""
import re
import json
import hashlib
from sqlalchemy import desc
import nltk
import datetime
from models import db, LogAnalysis
from collections import Counter, defaultdict

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)
    
try:
    nltk.data.find('stopwords')
except LookupError:
    nltk.download('stopwords', quiet=True)

from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords

class LogAnalyzerEngine:
    """
    Local log analyzer that learns from historical analyses
    """
    def __init__(self):
        self.error_patterns = self._load_error_patterns()
        self.stop_words = set(stopwords.words('english'))
        self.known_stage_patterns = self._load_stage_patterns()
        
    def _load_error_patterns(self):
        """Load known error patterns from database"""
        patterns = {}
        # Get error patterns from past analyses
        analyses = LogAnalysis.query.filter(
            LogAnalysis.error_patterns.isnot(None),
            LogAnalysis.use_for_training == True
        ).order_by(desc(LogAnalysis.feedback_rating)).limit(100).all()
        
        for analysis in analyses:
            try:
                if analysis.error_patterns:
                    for pattern in json.loads(analysis.error_patterns):
                        if 'pattern' in pattern and 'description' in pattern:
                            patterns[pattern['pattern']] = pattern['description']
            except:
                # Skip invalid patterns
                pass
                
        return patterns
    
    def _load_stage_patterns(self):
        """Load patterns for identifying build stages"""
        # Start with common patterns
        patterns = {
            r'git\s+clone|checkout': 'Source Code Checkout',
            r'npm\s+install|yarn\s+install': 'JavaScript Dependencies Installation',
            r'pip\s+install|requirements.txt': 'Python Dependencies Installation',
            r'mvn\s+|gradle\s+|ant\s+': 'Build Tool Execution',
            r'test|testing|junit|pytest': 'Running Tests',
            r'docker\s+build|docker-compose': 'Docker Build',
            r'deploy|deployment': 'Deployment',
            r'publish|uploading': 'Publishing Artifacts'
        }
        
        # Add patterns from highly-rated analyses
        analyses = LogAnalysis.query.filter(
            LogAnalysis.tags.ilike('%stage_identification%'),
            LogAnalysis.feedback_rating >= 4,
            LogAnalysis.use_for_training == True
        ).limit(50).all()
        
        for analysis in analyses:
            # Use tags to identify stage patterns
            if analysis.tags:
                tags = analysis.tags.split(',')
                for tag in tags:
                    if ':' in tag and tag.startswith('stage_pattern:'):
                        pattern, name = tag.replace('stage_pattern:', '').split(':', 1)
                        if pattern and name:
                            patterns[pattern.strip()] = name.strip()
        
        return patterns
    
    def _compute_log_hash(self, log_content):
        """Generate a hash to uniquely identify a log"""
        return hashlib.sha256(log_content.encode('utf-8')).hexdigest()
    
    def _extract_build_result(self, log_content):
        """Try to determine the build result from the log"""
        # Common result patterns
        result_patterns = {
            r'BUILD\s+SUCCESS': 'SUCCESS',
            r'BUILD\s+FAILURE': 'FAILURE',
            r'FAILED': 'FAILURE',
            r'ERROR': 'FAILURE',
            r'UNSTABLE': 'UNSTABLE',
            r'Finished: SUCCESS': 'SUCCESS',
            r'Finished: FAILURE': 'FAILURE',
            r'Finished: UNSTABLE': 'UNSTABLE',
            r'Tests .* PASSED': 'SUCCESS',
            r'Tests .* FAILED': 'FAILURE'
        }
        
        for pattern, result in result_patterns.items():
            if re.search(pattern, log_content, re.IGNORECASE):
                # Return the last matched result pattern found in the log
                # (assuming that's the final build status)
                return result
                
        return 'UNKNOWN'
    
    def _extract_error_patterns(self, log_content):
        """Extract error patterns from log content"""
        found_errors = []
        
        # Check for known error patterns
        for pattern, description in self.error_patterns.items():
            if re.search(pattern, log_content, re.IGNORECASE):
                found_errors.append({
                    'pattern': pattern,
                    'description': description
                })
        
        # Detect common error patterns
        common_errors = [
            (r'Exception in thread ".*"', 'Java Exception'),
            (r'Traceback \(most recent call last\)', 'Python Exception'),
            (r'npm ERR!', 'NPM Error'),
            (r'SyntaxError', 'Syntax Error'),
            (r'NameError', 'Name Error'),
            (r'ImportError', 'Import Error'),
            (r'error: ', 'General Error'),
            (r'FAILED', 'Test or Build Failure'),
            (r'Error:', 'General Error Message'),
            (r'Warning:', 'Warning Message'),
            (r'Cannot find module', 'Module Not Found'),
            (r'Out of memory', 'Memory Error'),
            (r'Permission denied', 'Permission Issue'),
            (r'No such file or directory', 'Missing File or Directory'),
            (r'Failed to connect', 'Connection Issue')
        ]
        
        for pattern, description in common_errors:
            if re.search(pattern, log_content, re.IGNORECASE):
                # Only add if not already found
                if not any(e['pattern'] == pattern for e in found_errors):
                    found_errors.append({
                        'pattern': pattern,
                        'description': description
                    })
        
        return found_errors
    
    def _identify_stages(self, log_content):
        """Identify build stages from log content"""
        stages = []
        lines = log_content.split('\n')
        line_count = len(lines)
        
        # Look for stage markers in Jenkins logs
        stage_markers = re.finditer(r'=+\s*\[([^\]]+)\]\s*=+', log_content)
        for match in stage_markers:
            stage_name = match.group(1).strip()
            if stage_name:
                stages.append(stage_name)
        
        # If no explicit stages found, infer from content using patterns
        if not stages:
            for pattern, name in self.known_stage_patterns.items():
                for i, line in enumerate(lines):
                    if re.search(pattern, line, re.IGNORECASE):
                        # Approximate stage position in the log
                        position = float(i) / line_count if line_count > 0 else 0
                        stages.append(f"{name} (pos: {position:.2f})")
                        break  # Found one instance of this stage
        
        return stages
    
    def _extract_important_keywords(self, log_content):
        """Extract important keywords that might indicate interesting events"""
        # Tokenize and clean
        words = word_tokenize(log_content.lower())
        words = [w for w in words if w.isalnum() and w not in self.stop_words]
        
        # Count word frequencies
        word_counts = Counter(words)
        
        # Get most common words excluding very common ones
        very_common = {'build', 'error', 'warning', 'info', 'debug', 'jenkins', 'stage'}
        keywords = [(word, count) for word, count in word_counts.most_common(20) 
                    if word not in very_common]
        
        return keywords
    
    def _generate_analysis(self, log_content, error_patterns, stages, keywords, build_result):
        """Generate a comprehensive log analysis"""
        analysis = []
        
        # Overview section
        analysis.append("# Build Overview")
        analysis.append(f"- Build Result: {build_result}")
        if stages:
            analysis.append(f"- Stages Identified: {len(stages)}")
            
        # Error analysis
        if error_patterns:
            analysis.append("\n# Error Analysis")
            analysis.append(f"Found {len(error_patterns)} error patterns:")
            for error in error_patterns:
                analysis.append(f"- {error['description']}")
        
        # Stage analysis
        if stages:
            analysis.append("\n# Build Stages")
            for stage in stages:
                analysis.append(f"- {stage}")
        
        # Keywords
        if keywords:
            analysis.append("\n# Significant Terms")
            analysis.append("Notable keywords found in the log:")
            for word, count in keywords[:10]:  # Only show top 10
                analysis.append(f"- {word} ({count} occurrences)")
        
        # Summary
        analysis.append("\n# Summary")
        if build_result == 'SUCCESS':
            analysis.append("The build completed successfully.")
        elif build_result == 'FAILURE':
            analysis.append("The build failed. Review the error analysis for potential causes.")
        elif build_result == 'UNSTABLE':
            analysis.append("The build is unstable. Tests may be failing or there are warnings.")
        else:
            analysis.append("The build status couldn't be determined from the log.")
        
        return "\n".join(analysis)
    
    def _check_similar_analyses(self, log_hash):
        """Check for similar previous analyses to learn from"""
        similar = LogAnalysis.query.filter_by(
            log_hash=log_hash, 
            use_for_training=True
        ).order_by(desc(LogAnalysis.feedback_rating)).first()
        
        return similar
        
    def analyze_log(self, log_content, job_name=None, build_number=None):
        """
        Analyze a Jenkins log and generate insights
        """
        # Handle empty log
        if not log_content:
            return {
                "analysis": "Log content is empty. Nothing to analyze.",
                "build_result": "UNKNOWN",
                "error_patterns": [],
                "stages": [],
                "log_hash": None
            }
        
        # Compute log hash for identifying duplicates
        log_hash = self._compute_log_hash(log_content)
        
        # Check if we've already analyzed a similar log
        similar = self._check_similar_analyses(log_hash)
        if similar and similar.feedback_rating and similar.feedback_rating >= 4:
            # If we have a highly-rated analysis for this log, reuse it
            return {
                "analysis": similar.analysis,
                "build_result": similar.build_result,
                "error_patterns": json.loads(similar.error_patterns) if similar.error_patterns else [],
                "stages": [], # We don't store stages in the DB
                "log_hash": log_hash
            }
        
        # Extract build result
        build_result = self._extract_build_result(log_content)
        
        # Extract error patterns
        error_patterns = self._extract_error_patterns(log_content)
        
        # Identify stages
        stages = self._identify_stages(log_content)
        
        # Extract keywords
        keywords = self._extract_important_keywords(log_content)
        
        # Generate analysis
        analysis = self._generate_analysis(
            log_content, error_patterns, stages, keywords, build_result
        )
        
        # Store the analysis for future training if we have job metadata
        if job_name and build_number:
            self.store_analysis(
                log_content, analysis, log_hash, job_name, 
                build_number, build_result, error_patterns
            )
        
        return {
            "analysis": analysis,
            "build_result": build_result,
            "error_patterns": error_patterns,
            "stages": stages,
            "log_hash": log_hash
        }
    
    def store_analysis(self, log_content, analysis, log_hash, job_name, 
                      build_number, build_result, error_patterns):
        """Store analysis for future learning"""
        # Create log snippet (first 1000 chars)
        log_snippet = log_content[:1000] if log_content else ""
        
        # Create new analysis entry
        log_analysis = LogAnalysis(
            log_hash=log_hash,
            job_name=job_name,
            build_number=build_number,
            build_result=build_result,
            log_snippet=log_snippet,
            analysis=analysis,
            error_patterns=json.dumps(error_patterns) if error_patterns else None,
            tags="auto_generated"
        )
        
        # Save to database
        try:
            db.session.add(log_analysis)
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"Error storing log analysis: {e}")
    
    def store_feedback(self, log_hash, feedback_rating, feedback_correction=None):
        """Store user feedback on an analysis"""
        if not log_hash:
            return False
            
        analysis = LogAnalysis.query.filter_by(log_hash=log_hash).first()
        if not analysis:
            return False
            
        analysis.feedback_rating = feedback_rating
        if feedback_correction:
            analysis.feedback_correction = feedback_correction
            
        # If feedback is positive (4-5), mark for training
        analysis.use_for_training = (feedback_rating >= 4)
        
        try:
            db.session.commit()
            return True
        except:
            db.session.rollback()
            return False
            
    def train_from_corrections(self):
        """Learn from user corrections to improve future analyses"""
        # Find analyses with corrections
        analyses = LogAnalysis.query.filter(
            LogAnalysis.feedback_correction.isnot(None),
            LogAnalysis.feedback_rating >= 4
        ).all()
        
        # For now, we just use corrections to build our patterns
        # This could be extended with more sophisticated ML approaches
        
        return len(analyses)
