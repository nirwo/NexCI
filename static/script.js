// This file is intentionally left mostly empty.
// Initialization and core logic have been moved to separate modules:
// - utils.js
// - chartUtils.js
// - timelineHandler.js
// - logHandler.js
// - jobListHandler.js
// - jobDetailsHandler.js
// - buildSummary.js
// - dashboardLoader.js

// Any remaining global setup or specific page logic (not dashboard-related)
// could potentially go here, but currently, it's handled by dashboardLoader.js

console.log("[DEBUG] script.js loaded (now mostly empty after refactor)");

// --- Generic Helper Functions ---

// Helper function to show a generic section and its loading indicator
function showLoadingSection(sectionId, loadingIndicatorId, errorElementId) {
    const section = getElement(sectionId); // Assumes getElement is globally available or defined here
    const loadingIndicator = getElement(loadingIndicatorId);
    const errorElement = getElement(errorElementId);

    if (section) section.style.display = 'block';
    if (errorElement) {
        errorElement.style.display = 'none'; // Hide previous errors
        errorElement.textContent = ''; // Clear previous message
    }
    if (loadingIndicator) loadingIndicator.style.display = 'inline-block'; // Show loading
}

// Helper function to hide a loading indicator and potentially show an error
function hideLoadingIndicator(loadingIndicatorId, errorElementId, errorMessage = null) {
    const loadingIndicator = getElement(loadingIndicatorId);
    const errorElement = getElement(errorElementId);

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (errorMessage && errorElement) {
        errorElement.textContent = errorMessage;
        errorElement.style.display = 'block';
    } else if (errorElement) {
        // Optionally hide error element if no message
        // errorElement.style.display = 'none'; 
    }
}

// Helper function to get an element by ID (if not already global)
// Ensure this is defined if not already present from other scripts
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with ID '${id}' not found.`);
    }
    return element;
}

// Helper function to hide an element by ID
function hideElement(elementId) {
    const element = getElement(elementId);
    if (element) {
        element.style.display = 'none';
    }
}

// Jenkins status monitoring functions
function updateJenkinsStatusBanner(isConnected, message = null) {
    const banner = getElement('jenkins-status-banner');
    const statusText = getElement('jenkins-status-text');
    
    if (!banner || !statusText) return;
    
    // Set appearance based on status
    if (isConnected) {
        banner.className = 'alert alert-success mb-3';
        statusText.textContent = message || 'Connected';
    } else {
        banner.className = 'alert alert-danger mb-3';
        statusText.textContent = message || 'Disconnected';
    }
    
    // Show the banner
    banner.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        banner.style.opacity = '1';
        // Fade out effect
        banner.style.transition = 'opacity 1s';
        banner.style.opacity = '0';
        // Hide completely after fade
        setTimeout(() => { banner.style.display = 'none'; }, 1000);
    }, 5000);
}

// Check Jenkins connection and update banner
function checkJenkinsStatus() {
    // Get Jenkins URL from user settings or input field
    const jenkinsUrl = document.getElementById('jenkins_url')?.value;
    
    if (!jenkinsUrl) {
        updateJenkinsStatusBanner(false, 'Jenkins URL not configured');
        return;
    }
    
    fetch('/api/check_jenkins?url=' + encodeURIComponent(jenkinsUrl))
        .then(response => response.json())
        .then(data => {
            updateJenkinsStatusBanner(data.connected, data.message);
        })
        .catch(error => {
            updateJenkinsStatusBanner(false, 'Error checking Jenkins status');
            console.error('Jenkins status check failed:', error);
        });
}

// Initialize status checking when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Add some minimal styling for banner transitions
    const style = document.createElement('style');
    style.textContent = `
        #jenkins-status-banner {
            transition: opacity 1s;
            opacity: 1;
        }
    `;
    document.head.appendChild(style);
    
    // Run first check after a slight delay
    setTimeout(checkJenkinsStatus, 2000);
    
    // Set up periodic checks (every 5 minutes)
    setInterval(checkJenkinsStatus, 300000);
});
