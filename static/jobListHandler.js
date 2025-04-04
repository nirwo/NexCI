// --- Job List Functions ---

// Global variable to track initialization state
let jobDropdownInitialized = false;
let jobsFetchInProgress = false;

// Fetch the list of jobs from the API
async function fetchJobs() {
  // Prevent multiple concurrent fetches
  if (jobsFetchInProgress) {
    console.log("Job fetch already in progress, skipping duplicate call");
    return;
  }
  
  jobsFetchInProgress = true;
  console.log("Fetching jobs...");
  
  // No longer need job-loading-indicator since we removed it from the template
  const jobListError = getElement("job-list-error");
  const jobDropdown = getElement("job-dropdown");
  
  // Hide error message if it exists
  if (jobListError) {
    jobListError.style.display = "none";
  }
  
  // Clear dropdown if it exists
  if (jobDropdown) {
    // Keep track of current selection
    const currentSelection = jobDropdown.value;
    
    // Clear dropdown except for the placeholder
    while (jobDropdown.options.length > 1) {
      jobDropdown.remove(1);
    }
  } else {
    console.error("Job dropdown element not found");
    jobsFetchInProgress = false;
    return; // Exit early if we can't find it
  }

  try {
    const response = await fetch("/api/jobs");

    if (!response.ok) {
      // Try to get more specific error message from the response body
      let errorMsg = `HTTP Error: ${response.status}`; 
      try {
        const errorData = await response.json();
        errorMsg += `: ${errorData.error || 'Unknown API error'}`;
      } catch (e) { /* Ignore if response is not JSON */ }
      throw new Error(errorMsg);
    }
    
    const data = await response.json();

    if (data.jobs && data.jobs.length > 0) {
      populateJobDropdown(data.jobs);
    } else {
      const noJobsOption = document.createElement('option');
      noJobsOption.textContent = 'No jobs found';
      noJobsOption.disabled = true;
      jobDropdown.appendChild(noJobsOption);
    }
  } catch (error) {
    console.error("Error fetching jobs:", error);
    // Use the showError utility function
    showError(`Failed to load jobs: ${error.message}`, "job-list");
  } finally {
    jobsFetchInProgress = false;
  }
}

// Populate the job dropdown from the fetched data
function populateJobDropdown(jobs) {
  const jobDropdown = getElement("job-dropdown");
  
  if (!jobDropdown) {
    console.error("Job dropdown element not found");
    return;
  }

  // Sort jobs alphabetically
  jobs.sort((a, b) => {
    // Handle undefined/null values
    const nameA = a.fullName || "";
    const nameB = b.fullName || "";
    return nameA.localeCompare(nameB);
  });

  // Populate dropdown with options
  jobs.forEach((job) => {
    const option = document.createElement("option");
    option.value = job.fullName;
    option.textContent = job.fullName;
    option.setAttribute('data-url', job.url);
    jobDropdown.appendChild(option);
  });

  // Make sure only one event listener is added
  if (!jobDropdownInitialized) {
    console.log("Adding change event listener to job dropdown");
    
    // Remove any existing listeners first (safety measure)
    jobDropdown.removeEventListener('change', handleJobSelection);
    
    // Add the event listener
    jobDropdown.addEventListener('change', handleJobSelection);
    
    jobDropdownInitialized = true;
  }
}

// Handle job selection - separate function to avoid duplicate listeners
function handleJobSelection() {
  const selectedJobFullName = this.value;
  console.log("Job selected:", selectedJobFullName);
  
  if (selectedJobFullName) {
    // Call the existing displayJobDetails function with the selected job
    if (typeof displayJobDetails === 'function') {
      displayJobDetails(selectedJobFullName);
    } else {
      console.error("displayJobDetails function not found");
    }
  }
}

// Initialize the dashboard when page loads
document.addEventListener("DOMContentLoaded", function() {
  console.log("DOMContentLoaded triggered in jobListHandler.js");
  
  // Initialize only on the dashboard page
  const refreshBtn = document.getElementById("refresh-dashboard");
  if (refreshBtn) {
    console.log("Dashboard found, initializing...");
    
    // Set up refresh button
    refreshBtn.addEventListener("click", function() {
      console.log("Refresh button clicked");
      fetchJobs();
    });
    
    // Make sure our dropdown exists
    const jobDropdown = document.getElementById("job-dropdown");
    if (!jobDropdown) {
      console.log("Creating dropdown as it doesn't exist yet");
      const cardBody = document.querySelector('.card-body');
      if (cardBody) {
        const newDropdown = document.createElement('select');
        newDropdown.id = 'job-dropdown';
        newDropdown.className = 'form-select form-select-lg';
        
        // Add placeholder option
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = 'Choose a Jenkins job...';
        placeholderOption.selected = true;
        placeholderOption.disabled = true;
        
        newDropdown.appendChild(placeholderOption);
        cardBody.insertBefore(newDropdown, cardBody.firstChild);
      }
    }
    
    // Clean up any remaining spinners or loading indicators
    cleanupSpinners();
    
    // Initial fetch only if not already done
    if (!jobsFetchInProgress) {
      fetchJobs();
    }
  }
});

// Function to clean up any spinners or loading states
function cleanupSpinners() {
  // Find and remove any remaining spinner elements
  const spinners = document.querySelectorAll('.spinner-border');
  spinners.forEach(spinner => {
    if (spinner.parentNode) {
      // If parent is a loading container, remove the whole thing
      if (spinner.parentNode.classList.contains('text-center') && 
          spinner.parentNode.querySelector('p') &&
          spinner.parentNode.querySelector('p').textContent.includes('Loading')) {
        spinner.parentNode.remove();
      } else {
        // Otherwise just hide the spinner
        spinner.style.display = 'none';
      }
    }
  });
  
  // Also look for any elements with "Loading" text
  const loadingTexts = Array.from(document.querySelectorAll('p, span, div'))
    .filter(el => el.textContent.includes('Loading'));
  
  loadingTexts.forEach(el => {
    if (el.parentNode && el.parentNode.classList.contains('text-center')) {
      el.parentNode.remove();
    }
  });
}
