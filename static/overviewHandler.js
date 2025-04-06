// static/overviewHandler.js

// Helper function to update text content of an element
function updateText(elementId, text) {
    const element = getElement(elementId); // Using getElement from utils.js
    if (element) {
        element.textContent = text;
    } else {
        console.warn(`Element with ID ${elementId} not found for overview update.`);
    }
}

// Helper function to show/hide elements
function setDisplay(elementId, displayStyle) {
    const element = getElement(elementId);
    if (element) {
        element.style.display = displayStyle;
    }
}

// Function to display errors in the overview cards
function displayOverviewError(section, message) {
    const errorElementId = `overview-${section}-error`;
    const errorElement = getElement(errorElementId);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
     // Hide loading indicator for this section
    setDisplay(`overview-${section}-loading`, 'none');
}


// Function to initialize daily activity chart
function initDailyActivityChart(data) {
    const canvas = document.getElementById('daily-activity-chart');
    if (!canvas) {
        console.warn("[Overview] Activity chart canvas not found");
        return;
    }
    
    // Generate sample data if real data is not available
    const chartData = data || generateSampleActivityData();
    
    // Ensure Chart.js is available
    if (typeof Chart === 'undefined') {
        console.warn("[Overview] Chart.js not available");
        displayOverviewError('activity', 'Chart.js library is required.');
        return;
    }
    
    try {
        // Destroy existing chart if it exists
        if (window.dailyActivityChart) {
            window.dailyActivityChart.destroy();
        }
        
        // Create the chart
        window.dailyActivityChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: chartData.labels,
                datasets: [
                    {
                        label: 'Successful Builds',
                        data: chartData.successful,
                        backgroundColor: 'rgba(40, 167, 69, 0.7)',
                        borderColor: 'rgba(40, 167, 69, 0.9)',
                        borderWidth: 1
                    },
                    {
                        label: 'Failed Builds',
                        data: chartData.failed,
                        backgroundColor: 'rgba(220, 53, 69, 0.7)',
                        borderColor: 'rgba(220, 53, 69, 0.9)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            boxWidth: 12,
                            padding: 10
                        }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                }
            }
        });
        
        console.log("[Overview] Daily activity chart created");
    } catch (error) {
        console.error("[Overview] Error creating activity chart:", error);
        displayOverviewError('activity', 'Failed to create chart: ' + error.message);
    }
}

// Generate sample data for the activity chart
function generateSampleActivityData() {
    const today = new Date();
    const labels = [];
    const successful = [];
    const failed = [];
    
    // Generate data for the last 7 days
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        
        labels.push(dayName);
        
        // Generate random values for demo purposes
        const successCount = Math.floor(Math.random() * 8) + 1; // 1-8 successful builds
        const failCount = Math.floor(Math.random() * 3); // 0-2 failed builds
        
        successful.push(successCount);
        failed.push(failCount);
    }
    
    return { labels, successful, failed };
}

// Function to fetch and display Jenkins overview data
async function fetchAndDisplayOverview() {
    // Show loading state
    const overviewContainer = document.getElementById('overview-container');
    if (overviewContainer) {
        overviewContainer.innerHTML = `
            <div class="text-center p-3">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <div class="mt-2">Loading Jenkins overview...</div>
            </div>
        `;
    }

    try {
        const response = await fetch('/api/jenkins/overview', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            credentials: 'same-origin'
        });

        // Get the content type before trying to read the body
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');
        
        // Check if response is OK
        if (!response.ok) {
            if (isJson) {
                // If it's JSON, parse it
                const errorData = await response.json();
                throw new Error(errorData.error || `Server returned ${response.status}: ${response.statusText}`);
            } else {
                // If not JSON, get the text content
                const textContent = await response.text();
                console.error('[Overview] Non-JSON error response:', textContent.substring(0, 200));
                
                if (response.status === 404) {
                    displayError('Jenkins overview endpoint not found. Please check if the server is running and the endpoint is properly configured.');
                } else {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}. The server might be down or not properly configured.`);
                }
                return;
            }
        }

        // If we get here, response is OK
        if (!isJson) {
            const textContent = await response.text();
            console.error('[Overview] Non-JSON response:', textContent.substring(0, 200));
            throw new Error('Server returned non-JSON response. Please check your Jenkins configuration.');
        }

        const data = await response.json();
        
        // Handle different status cases
        switch (data.status) {
            case 'not_configured':
                displayError('Jenkins is not configured. Please configure Jenkins in settings first.');
                break;
            
            case 'error':
                displayError(data.error || 'An error occurred while fetching Jenkins overview');
                break;
            
            case 'mock':
                displayWarning('Using mock data because Jenkins is not accessible. Please check your Jenkins configuration.');
                updateOverviewStats(data);
                updateRecentBuilds(data.recent_builds);
                break;
            
            case 'success':
                updateOverviewStats(data);
                updateRecentBuilds(data.recent_builds);
                break;
            
            default:
                displayError('Unknown response status from server');
        }
    } catch (error) {
        console.error('[Overview] Error fetching overview:', error);
        displayError(error.message || 'Failed to fetch Jenkins overview');
    }
}

// Helper function to display errors
function displayError(message) {
    const overviewContainer = document.getElementById('overview-container');
    if (overviewContainer) {
        overviewContainer.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <h4 class="alert-heading">Error</h4>
                <p>${message}</p>
            </div>
        `;
    }
}

// Helper function to display warnings
function displayWarning(message) {
    const overviewContainer = document.getElementById('overview-container');
    if (overviewContainer) {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'alert alert-warning alert-dismissible fade show';
        warningDiv.innerHTML = `
            <strong>Warning:</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        overviewContainer.insertBefore(warningDiv, overviewContainer.firstChild);
    }
}

// Helper function to update overview statistics
function updateOverviewStats(data) {
    updateText('total-jobs', data.total_jobs || 0);
    updateText('running-jobs', data.running_jobs || 0);
    updateText('failed-jobs', data.failed_jobs || 0);
}

// Helper function to update recent builds
function updateRecentBuilds(builds) {
    const buildsContainer = document.getElementById('recent-builds');
    if (!buildsContainer) return;

    if (!builds || builds.length === 0) {
        buildsContainer.innerHTML = '<p class="text-muted">No recent builds found</p>';
        return;
    }

    const buildsList = builds.map(build => `
        <div class="build-item">
            <div class="build-info">
                <span class="build-name">${build.job_name}</span>
                <span class="build-number">#${build.build_number}</span>
            </div>
            <div class="build-status">
                <span class="badge ${getStatusBadgeClass(build.status)}">${build.status}</span>
                <span class="build-time">${formatTimestamp(build.timestamp)}</span>
            </div>
        </div>
    `).join('');

    buildsContainer.innerHTML = buildsList;
}

// Helper function to get status badge class
function getStatusBadgeClass(status) {
    switch (status.toUpperCase()) {
        case 'SUCCESS':
            return 'bg-success';
        case 'FAILURE':
            return 'bg-danger';
        case 'UNSTABLE':
            return 'bg-warning';
        case 'ABORTED':
            return 'bg-secondary';
        default:
            return 'bg-info';
    }
}

// Helper function to format timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return 'Unknown';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// Fetch overview data when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the dashboard page by looking for a dashboard-specific element
    // This prevents trying to load overview data on other pages like Settings
    if (getElement('job-dropdown')) { 
        console.log("[Overview] Dashboard page detected, fetching overview data");
        fetchAndDisplayOverview();
    } else {
        console.log("[Overview] Not on dashboard page, skipping overview fetch.");
    }
});

// Retry if there's a failure - some components might load asynchronously
setTimeout(() => {
    if (getElement('executors-total')?.textContent === '--') {
        console.log("[Overview] Retrying overview data fetch after timeout");
        fetchAndDisplayOverview();
    }
}, 2000);
