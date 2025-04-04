// --- Dashboard Initialization and Event Listeners ---

// Initial setup function
function initializeApp() {
    console.log('[DEBUG] Initializing app via dashboardLoader.js...');

    // Check if we are on a page that requires dashboard functionality
    const jobList = getElement('job-list'); // Use utility function
    const jobListError = getElement('job-list-error');

    if (jobList && jobListError) {
        console.log('[DEBUG] Dashboard elements found, loading dashboard data...');
        loadDashboard();
    } else {
        console.log('[DEBUG] Not on dashboard page or elements missing, skipping dashboard load.');
    }

    // Setup common event listeners regardless of initial load
    setupEventListeners();

    console.log('[DEBUG] App initialization complete.');
}

// Function to load/refresh dashboard data
function loadDashboard() {
    console.log('>>> loadDashboard called via dashboardLoader.js');
    // Call fetchJobs from jobListHandler.js (ensure it's loaded first)
    if (typeof fetchJobs === 'function') {
        fetchJobs();
    } else {
        console.error('ERROR: fetchJobs function not found. Is jobListHandler.js loaded?');
        showError('Initialization Error: Cannot load job list.', 'job-list');
    }
}

// Setup all top-level event listeners
function setupEventListeners() {
    console.log('[DEBUG] Setting up event listeners...');

    // Refresh button
    const refreshDashboardBtn = getElement('refresh-dashboard');
    if (refreshDashboardBtn) {
        refreshDashboardBtn.addEventListener('click', loadDashboard);
    }

    // Job list click delegation
    document.addEventListener('click', (event) => {
        const jobList = getElement('job-list');

        // Ensure the click is on a job item within the job list
        if (jobList && event.target && event.target.matches('#job-list .list-group-item')) {
            event.preventDefault();
            console.log('[DEBUG] Job item clicked:', event.target);

            // Get the job's full name (ensure attribute exists)
            const jobFullName = event.target.getAttribute('data-job-full-name');
            const selectedJobTitle = getElement('selected-job-title');

            if (!jobFullName) {
                console.error('Clicked job item is missing data-job-full-name attribute.');
                showError('Could not identify the selected job.', 'build');
                return;
            }

             if (!selectedJobTitle) {
                 console.error('UI element 'selected-job-title' not found.');
                 // Continue without updating title if non-critical
             } else {
                 selectedJobTitle.textContent = event.target.textContent; // Update UI title
             }

            // Remove active state from previously selected item
            const previouslySelectedItem = jobList.querySelector('.active');
            if (previouslySelectedItem) {
                previouslySelectedItem.classList.remove('active');
            }
            // Add active state to the clicked item
            event.target.classList.add('active');

            // Call displayJobDetails from jobDetailsHandler.js
            if (typeof displayJobDetails === 'function') {
                displayJobDetails(jobFullName);
            } else {
                console.error('ERROR: displayJobDetails function not found. Is jobDetailsHandler.js loaded?');
                showError('UI Error: Cannot display job details.', 'build');
            }
        }
    });

    // Fetch Logs button
    const fetchLogsBtn = getElement('fetch-logs-btn');
    if (fetchLogsBtn) {
        fetchLogsBtn.addEventListener('click', () => {
            // Call fetchAndDisplayLogs from logHandler.js
            if (typeof fetchAndDisplayLogs === 'function') {
                 fetchAndDisplayLogs();
            } else {
                 console.error('ERROR: fetchAndDisplayLogs function not found. Is logHandler.js loaded?');
                 showError('UI Error: Cannot fetch logs.', 'log');
            }
        });
    }

    // View Timeline button
    const viewTimelineBtn = getElement('view-timeline-btn');
    if (viewTimelineBtn) {
        viewTimelineBtn.addEventListener('click', () => {
            // Call displayTimeline from timelineHandler.js
            if (typeof displayTimeline === 'function') {
                displayTimeline();
             } else {
                 console.error('ERROR: displayTimeline function not found. Is timelineHandler.js loaded?');
                 showError('UI Error: Cannot display timeline.', 'timeline'); // Assuming timeline-error element
             }
        });
    }
    
    // View Build Summary button
    const buildSummaryBtn = getElement('build-summary-btn');
    if (buildSummaryBtn) {
        buildSummaryBtn.addEventListener('click', () => {
             // Assumes selectedJobFullName is accessible or passed appropriately
             if (!selectedJobFullName) {
                 console.warn('No job selected for build summary.');
                 showError('Please select a job first to view the summary.', 'build'); // Use build error area
                 return;
             }
             // Call displayBuildSummary from buildSummary.js (ensure it's loaded)
             if (typeof displayBuildSummary === 'function') {
                 displayBuildSummary(selectedJobFullName);
             } else {
                  console.error('ERROR: displayBuildSummary function not found. Is buildSummary.js loaded?');
                  showError('UI Error: Cannot display build summary.', 'build'); // Use build error area
             }
        });
    }

    console.log('[DEBUG] Event listeners setup complete.');
}

// --- Initialize the App --- 
// Run initializeApp after the DOM is fully loaded and parsed
document.addEventListener('DOMContentLoaded', initializeApp);
