// --- Dashboard Initialization and Event Listeners ---

// Initial setup function
function initializeApp() {
    console.log('[DEBUG] Initializing app via dashboardLoader.js...');

    // Check if we are on a page that requires dashboard functionality
    const jobDropdown = getElement('job-dropdown'); // Updated to check for dropdown
    const jobListError = getElement('job-list-error');

    if (jobDropdown && jobListError) {
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

    // We don't need job list delegation anymore since we're using a dropdown
    // The dropdown change event is handled in jobListHandler.js
}

// --- Initialize the App --- 
// Run initializeApp after the DOM is fully loaded and parsed
document.addEventListener('DOMContentLoaded', initializeApp);
