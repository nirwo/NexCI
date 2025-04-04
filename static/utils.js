// --- Utility Functions ---

// Helper to get element by ID and handle potential null
function getElement(id) {
  const element = document.getElementById(id);
  if (!element) {
    // console.warn(`Element with ID '${id}' not found.`); // Optional: Warn if element is missing
  }
  return element;
}

// Display error messages in specified area (job list, build, log)
function showError(message, areaPrefix) {
  console.error(`Error in ${areaPrefix}: ${message}`);
  const errorElement = getElement(`${areaPrefix}-error`);
  const loadingIndicator = getElement(`${areaPrefix}-loading-indicator`); // Assumes loading indicator ID follows pattern

  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
  if (loadingIndicator) {
    loadingIndicator.style.display = 'none'; // Hide loading indicator on error
  }

  // Special handling for job list error to clear the list
  if (areaPrefix === 'job-list') {
    const jobList = getElement('job-list');
    if (jobList) {
      jobList.innerHTML = ''; // Clear the list area
    }
  }
}


// Format duration from milliseconds to a readable string (e.g., 1m 30s)
function formatDuration(ms) {
  if (ms === null || ms === undefined || ms < 0) {
    return '--';
  }
  if (ms === 0) {
    return '0s';
  }
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  let durationString = '';
  if (minutes > 0) {
    durationString += `${minutes}m `;
  }
  if (remainingSeconds > 0 || minutes === 0) {
    durationString += `${remainingSeconds}s`;
  }
  return durationString.trim();
}
