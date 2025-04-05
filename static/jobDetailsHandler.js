// --- Job Details, Build Stats, and Build Info Functions ---

let selectedJobFullName = null; // Store the currently selected job's full name
// let latestBuildUrl = null; // Moved to logHandler.js as it's mainly used there

// Helper functions that should be in script.js but defined here to ensure they're available
function hideLoadingIndicator(loadingIndicatorId, errorElementId, errorMessage = null) {
    const loadingIndicator = document.getElementById(loadingIndicatorId);
    const errorElement = document.getElementById(errorElementId);

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (errorMessage && errorElement) {
        errorElement.textContent = errorMessage;
        errorElement.style.display = 'block';
    }
}

// Main function called when a job is clicked in the list - defined globally
async function displayJobDetails(jobFullName) {
    console.log(`[DEBUG] Displaying details for job: ${jobFullName}`);
    selectedJobFullName = jobFullName;

    const jobDetailsArea = getElement('job-details-area');
    const logDisplayArea = getElement('log-display-area');
    const timelineArea = getElement('timeline-area');
    const timelineDisplayArea = getElement('timeline-display-area'); // Get the new timeline area
    const buildChartsArea = getElement('build-charts-area');
    const buildSummaryArea = getElement('build-summary-area');
    const buildErrorOutput = getElement('build-error'); // Specific error display for build info
    const fetchLogsBtn = getElement('fetch-logs-btn');
    const viewTimelineBtn = getElement('view-timeline-btn');
    const buildSummaryBtn = getElement('build-summary-btn'); // Get the summary button

    // Basic validation
    if (!jobDetailsArea || !buildErrorOutput || !fetchLogsBtn || !viewTimelineBtn || !buildSummaryBtn) {
        console.error("Required UI elements for job details are missing.");
        return;
    }

    // Reset/hide areas
    jobDetailsArea.style.display = 'block';
    if (logDisplayArea) logDisplayArea.style.display = 'none';
    if (timelineArea) timelineArea.style.display = 'none';
    if (timelineDisplayArea) timelineDisplayArea.style.display = 'none'; // Hide timeline area initially
    if (buildChartsArea) buildChartsArea.style.display = 'none';
    if (buildSummaryArea) buildSummaryArea.style.display = 'none'; // Hide summary initially
    buildErrorOutput.style.display = 'none';
    buildErrorOutput.textContent = '';

    // Disable action buttons until build info is loaded
    fetchLogsBtn.disabled = true;
    viewTimelineBtn.disabled = true;
    buildSummaryBtn.disabled = true;

    // Fetch latest build info which includes stats and enables buttons
    const buildInfoFetched = await fetchLatestBuildInfo(jobFullName);

    // Fetch and render charts (don't wait for this to finish before showing details)
    renderBuildCharts(jobFullName); // Assumes renderBuildCharts is available (chartUtils.js)

    // Fetch and display the build summary (don't wait)
    if (typeof fetchAndDisplayBuildSummary === 'function') {
        fetchAndDisplayBuildSummary(); // Call the correct function from buildSummary.js
    } else {
        console.error('fetchAndDisplayBuildSummary function not found.');
        // Optionally show an error in the summary area
    }

    // If build info (including URL) was fetched, automatically load logs and timeline
    if (buildInfoFetched) {
        fetchLogsBtn.disabled = false;
        viewTimelineBtn.disabled = false;
        buildSummaryBtn.disabled = false;

        // Automatically load logs and timeline
        if (typeof fetchAndDisplayLogs === 'function') {
            fetchAndDisplayLogs();
        } else {
            console.error('fetchAndDisplayLogs function not found.');
        }

        if (typeof fetchAndDisplayTimeline === 'function') {
            fetchAndDisplayTimeline(jobFullName);
        } else {
            console.error('fetchAndDisplayTimeline function not found.');
        }
    }
}

// Fetch latest build info and update stats/buttons
async function fetchLatestBuildInfo(jobFullName) {
    console.log(`[DEBUG] Fetching latest build info for ${jobFullName}`);
    const buildLoadingIndicator = getElement('build-loading-indicator');
    const buildErrorOutput = getElement('build-error');

    if (buildLoadingIndicator) buildLoadingIndicator.style.display = 'inline-block';
    if (buildErrorOutput) buildErrorOutput.style.display = 'none';

    let success = false; // Track if we successfully get build info

    try {
        // API call expects job_full_name
        const response = await fetch(`/api/builds?job_full_name=${encodeURIComponent(jobFullName)}`);
        if (!response.ok) {
            let errorMsg = `Error fetching builds: ${response.status}`;
            try {
                 const errData = await response.json();
                 errorMsg += `: ${errData.error || 'Unknown API error'}`;
            } catch(e){/* ignore */}
            throw new Error(errorMsg);
        }
        const data = await response.json();

        if (data.builds && data.builds.length > 0) {
             // Store the URL for the absolute latest build (index 0)
             // This state is now managed in logHandler.js
            if (typeof setLatestBuildUrl === 'function') { // Check if function exists
                 setLatestBuildUrl(data.builds[0].url); 
             } else {
                 console.warn('setLatestBuildUrl function not found in logHandler. This might break log/timeline functionality.');
                 // Fallback or alternative handling if needed
             }
             
            console.log(`[DEBUG] Latest build URL set to: ${data.builds[0].url}`);
            success = true; // Mark as successful

            // Update the build stats display
            updateBuildStats(data.builds);

        } else {
            showError("No builds found for this job.", "build");
             // Reset stats if no builds
             updateBuildStats([]); 
        }
    } catch (error) {
        console.error("Error fetching build info:", error);
        showError(error.message, "build");
         // Reset stats on error
         updateBuildStats([]); 
    } finally {
        hideLoadingIndicator('build-loading-indicator', 'build-error');
    }
    return success; // Return success status
}

// Update the build stat cards in the UI
function updateBuildStats(builds) {
    const successRateEl = getElement('stat-success-rate');
    const lastBuildEl = getElement('stat-last-build');
    const avgDurationEl = getElement('stat-avg-duration');
    const buildTrendEl = getElement('stat-build-trend');

    // Ensure all elements exist
    if (!successRateEl || !lastBuildEl || !avgDurationEl || !buildTrendEl) {
        console.error("One or more build stat elements not found.");
        return;
    }

    // Reset stats if no builds data
    if (!builds || builds.length === 0) {
        successRateEl.textContent = '--';
        lastBuildEl.textContent = '--';
        avgDurationEl.textContent = '--';
        buildTrendEl.textContent = '--';
         // Reset background colors
         lastBuildEl.closest('.card')?.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-primary');
         buildTrendEl.closest('.card')?.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-primary');
        return;
    }

    // Calculate success rate
    const totalBuilds = builds.length;
    const successfulBuilds = builds.filter(b => b.result === 'SUCCESS').length;
    const successRate = totalBuilds > 0 ? ((successfulBuilds / totalBuilds) * 100).toFixed(0) : 0;
    successRateEl.textContent = `${successRate}%`;

    // Last build status
    const lastBuild = builds[0]; // Assumes builds are sorted newest first
    const lastBuildStatus = lastBuild.result || 'RUNNING'; // Default to RUNNING if result is null
    lastBuildEl.textContent = `#${lastBuild.number}`;
    const lastBuildCard = lastBuildEl.closest('.card');
    if (lastBuildCard) {
        lastBuildCard.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-primary'); // Reset
        if (lastBuildStatus === 'SUCCESS') lastBuildCard.classList.add('bg-success');
        else if (lastBuildStatus === 'FAILURE') lastBuildCard.classList.add('bg-danger');
        else lastBuildCard.classList.add('bg-warning'); // UNSTABLE, ABORTED, RUNNING etc.
    }

    // Calculate average duration
    const buildsWithDuration = builds.filter(b => typeof b.duration === 'number' && b.duration >= 0);
    if (buildsWithDuration.length > 0) {
        const totalDuration = buildsWithDuration.reduce((sum, b) => sum + b.duration, 0);
        const avgDurationMs = totalDuration / buildsWithDuration.length;
        avgDurationEl.textContent = formatDuration(avgDurationMs); // Use util function
    } else {
        avgDurationEl.textContent = '--';
    }

    // Build trend (simple check based on last 3 builds)
    const trendCard = buildTrendEl.closest('.card');
     if (trendCard) {
         trendCard.classList.remove('bg-success', 'bg-danger', 'bg-warning', 'bg-primary'); // Reset
         let trendIcon = '→'; // Neutral
         let trendClass = 'bg-warning'; // Neutral

         if (builds.length >= 3) {
             const results = builds.slice(0, 3).map(b => b.result);
             if (results[0] === 'SUCCESS' && results[2] !== 'SUCCESS') { // Improving
                 trendIcon = '↑';
                 trendClass = 'bg-success';
             } else if (results[0] !== 'SUCCESS' && results[2] === 'SUCCESS') { // Deteriorating
                 trendIcon = '↓';
                 trendClass = 'bg-danger';
             }
         }
         buildTrendEl.textContent = trendIcon;
         trendCard.classList.add(trendClass);
    }
}

// Function to set up event listeners for action buttons
function setupActionButtons() {
    // Define IDs for reusable access
    const logAreaId = 'log-display-area';
    const timelineAreaId = 'timeline-display-area';
    const summaryAreaId = 'build-summary-area';

    const fetchLogsBtn = getElement('fetch-logs-btn');
    const viewTimelineBtn = getElement('view-timeline-btn');
    const buildSummaryBtn = getElement('build-summary-btn');

    if (fetchLogsBtn) {
        fetchLogsBtn.addEventListener('click', () => {
            console.log("[JobDetails] Fetch Logs button clicked.");
            hideElement(timelineAreaId); // Hide other sections
            hideElement(summaryAreaId);
            if (typeof fetchAndDisplayLogs === 'function') {
                // fetchAndDisplayLogs should call showLoadingSection(logAreaId, ...)
                fetchAndDisplayLogs();
            } else {
                console.error('fetchAndDisplayLogs function not found.');
            }
        });
    }

    if (viewTimelineBtn) {
        viewTimelineBtn.addEventListener('click', () => {
            console.log("[JobDetails] View Timeline button clicked.");
            hideElement(logAreaId); // Hide other sections
            hideElement(summaryAreaId);
            if (typeof fetchAndDisplayTimeline === 'function') {
                // fetchAndDisplayTimeline should call showLoadingSection(timelineAreaId, ...)
                fetchAndDisplayTimeline();
            } else {
                console.error('fetchAndDisplayTimeline function not found.');
            }
        });
    }

    if (buildSummaryBtn) {
        buildSummaryBtn.addEventListener('click', () => {
            console.log("[JobDetails] Build Summary button clicked.");
            hideElement(logAreaId); // Hide other sections
            hideElement(timelineAreaId);
            if (typeof fetchAndDisplayBuildSummary === 'function') {
                // fetchAndDisplayBuildSummary should call showLoadingSection(summaryAreaId, ...)
                fetchAndDisplayBuildSummary();
            } else {
                console.error('fetchAndDisplayBuildSummary function not found.');
            }
        });
    }
}

// Helper function to hide an element by ID
function hideElement(elementId) {
    const element = getElement(elementId);
    if (element) {
        element.style.display = 'none';
    }
}

// Wrap event listener setup in DOMContentLoaded
document.addEventListener('DOMContentLoaded', (event) => {
    console.log("DOM fully loaded and parsed. Initializing jobDetailsHandler event listeners.");

    setupActionButtons();
});

// Helper to show build details fetched from backend
function showBuildDetails(builds) {
    // ... (no changes)
}

// Shared utility to get element by ID and log error if not found
function getElement(id) {
    return document.getElementById(id);
}

// Helper function to format duration in milliseconds to a human-readable format
function formatDuration(durationMs) {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// Helper function to show an error message
function showError(message, type) {
    const errorElement = getElement(`error-${type}`); // e.g., error-build, error-logs
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    } else {
        console.error(`Error display element for type '${type}' not found.`);
        // Fallback: Show a generic alert
        alert(`Error: ${message}`);
    }
}
