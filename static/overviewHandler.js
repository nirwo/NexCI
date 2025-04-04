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


// Function to fetch and display Jenkins overview data
async function fetchAndDisplayOverview() {
    console.log("[Overview] Fetching Jenkins overview data...");
    setDisplay('overview-executors-loading', 'inline-block');
    setDisplay('overview-jobs-loading', 'inline-block');
    setDisplay('overview-executors-error', 'none');
    setDisplay('overview-jobs-error', 'none');

    try {
        const response = await fetch('/api/jenkins/overview');
        const data = await response.json();

        if (!response.ok) {
            // Handle non-2xx responses (e.g., 400 if Jenkins not configured)
            const errorMsg = data.error || `Error fetching overview: ${response.status}`;
            console.error("[Overview] Error:", errorMsg);
            displayOverviewError('executors', errorMsg);
            displayOverviewError('jobs', errorMsg); // Show error in both cards for general fetch issues
            return;
        }

        // --- Update Executors Card ---
        if (data.executors) {
            updateText('executors-online', data.executors.online ?? 'N/A');
            updateText('executors-offline', data.executors.offline ?? 'N/A');
            updateText('executors-total', data.executors.total ?? 'N/A');
            setDisplay('overview-executors-loading', 'none');
        } else {
            displayOverviewError('executors', 'Executor data missing in response.');
        }

        // --- Update Jobs Card ---
        if (data.jobs) {
            updateText('jobs-count', data.jobs.count ?? 'N/A');
            setDisplay('overview-jobs-loading', 'none');
        } else {
             displayOverviewError('jobs', 'Job data missing in response.');
        }
        
        // --- Display specific API errors if any ---
        if (data.errors && data.errors.length > 0) {
             console.warn("[Overview] Partial data received with errors:", data.errors);
             // Optionally display these finer-grained errors
             // For now, let's assume the main data display is sufficient
             // Example: if (!data.executors) displayOverviewError('executors', data.errors.join('; '));
        }


    } catch (error) {
        console.error("[Overview] Failed to fetch or process overview data:", error);
        displayOverviewError('executors', 'Failed to load executor data.');
        displayOverviewError('jobs', 'Failed to load job data.');
    } finally {
        // Ensure loading indicators are hidden even if errors occurred before data processing
         setDisplay('overview-executors-loading', 'none');
         setDisplay('overview-jobs-loading', 'none');
    }
}

// Fetch overview data when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the dashboard page by looking for a dashboard-specific element
    // This prevents trying to load overview data on other pages like Settings
    if (getElement('job-selection-dropdown')) { 
        fetchAndDisplayOverview();
    } else {
        console.log("[Overview] Not on dashboard page, skipping overview fetch.");
    }
});
