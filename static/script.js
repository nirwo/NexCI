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
    
    // Initialize Jenkins Stats Dashboard
    initJenkinsStatsDashboard();
    
    // Set up refresh stats button
    const refreshStatsBtn = getElement('refresh-stats-btn');
    if (refreshStatsBtn) {
        refreshStatsBtn.addEventListener('click', fetchJenkinsStats);
    }
});

// --- Jenkins Stats Dashboard Functions ---

function initJenkinsStatsDashboard() {
    console.log("Initializing Jenkins Stats Dashboard...");
    
    // Immediately fetch stats
    fetchJenkinsStats();
    
    // Set up automatic refresh (every 60 seconds)
    setInterval(fetchJenkinsStats, 60000);
    
    // Also look for latest running build to auto-display
    setTimeout(autoDisplayLatestBuild, 3000);
}

async function fetchJenkinsStats() {
    console.log("Fetching Jenkins stats...");
    
    // Get Jenkins URL from input field or user settings
    const jenkinsUrl = document.getElementById('jenkins_url')?.value;
    if (!jenkinsUrl) {
        updateStatsUI({
            error: "Jenkins URL not configured"
        });
        return;
    }
    
    try {
        // Show loading state
        updateStatsUI({ loading: true });
        
        // Fetch stats from our backend
        const response = await fetch('/api/jenkins_stats?url=' + encodeURIComponent(jenkinsUrl));
        
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        // Update UI with fetched stats
        updateStatsUI(data);
        
        // Update last updated timestamp
        const lastUpdatedElement = getElement('stats-last-updated');
        if (lastUpdatedElement) {
            const now = new Date();
            lastUpdatedElement.textContent = `Last Updated: ${now.toLocaleTimeString()}`;
        }
        
    } catch (error) {
        console.error("Error fetching Jenkins stats:", error);
        updateStatsUI({
            error: error.message || "Failed to fetch Jenkins stats"
        });
    }
}

function updateStatsUI(data) {
    // Handle loading state
    if (data.loading) {
        document.querySelectorAll('#jenkins-stats-dashboard .fw-bold').forEach(el => {
            if (!el.dataset.originalText) {
                el.dataset.originalText = el.textContent;
            }
            el.textContent = 'Loading...';
        });
        return;
    }
    
    // Handle error state
    if (data.error) {
        document.querySelectorAll('#jenkins-stats-dashboard .fw-bold').forEach(el => {
            el.textContent = '--';
        });
        // Maybe show error message somewhere
        console.error("Jenkins stats error:", data.error);
        return;
    }
    
    // Update executor stats
    setElementText('executors-online', data.executors?.online || '0');
    setElementText('executors-offline', data.executors?.offline || '0');
    setElementText('executors-total', data.executors?.total || '0');
    
    // Update job stats
    setElementText('jobs-total', data.jobs?.total || '0');
    setElementText('jobs-running', data.jobs?.running || '0');
    setElementText('jobs-queued', data.jobs?.queued || '0');
    
    // Update build activity stats
    setElementText('builds-last-24h', data.builds?.last24Hours || '0');
    setElementText('builds-success-rate', (data.builds?.successRate || '0') + '%');
    
    // Update latest build info
    if (data.latestBuild) {
        const buildInfo = `${data.latestBuild.job}: #${data.latestBuild.number}`;
        setElementText('latest-build-info', buildInfo);
        
        // Store latest build info for auto-display
        window.latestBuildInfo = data.latestBuild;
    } else {
        setElementText('latest-build-info', 'None');
    }
}

// Helper function to set element text safely
function setElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = text;
    }
}

// Auto-display latest running build if available
async function autoDisplayLatestBuild() {
    // Check if we have latest build info from stats
    if (window.latestBuildInfo && window.latestBuildInfo.job) {
        console.log(`Auto-displaying latest build: ${window.latestBuildInfo.job} #${window.latestBuildInfo.number}`);
        
        // Find the job in the job list and trigger a click if it exists
        const jobLinks = document.querySelectorAll('#job-list .list-group-item');
        for (const link of jobLinks) {
            if (link.dataset.jobName === window.latestBuildInfo.job || 
                link.textContent.trim() === window.latestBuildInfo.job) {
                // Simulate click to display this job
                link.click();
                return;
            }
        }
        
        // If job not found in current list, try to fetch it directly
        try {
            if (typeof displayJobDetails === 'function') {
                await displayJobDetails(window.latestBuildInfo.job);
                console.log("Auto-displayed latest build details");
            } else {
                console.warn("displayJobDetails function not available for auto-display");
            }
        } catch (err) {
            console.error("Failed to auto-display latest build:", err);
        }
    } else {
        console.log("No latest build info available for auto-display");
    }
}
