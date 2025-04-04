// --- Job List Functions ---

// Global variable to track if initialization has been completed
let jobDropdownInitialized = false;

// Fetch the list of jobs from the API
async function fetchJobs() {
  console.log("Fetching jobs...");
  
  // Ensure the dropdown exists or create it if it doesn't
  await ensureJobDropdownExists();
  
  const jobLoadingIndicator = getElement("job-loading-indicator");
  const jobListError = getElement("job-list-error");
  const jobDropdown = getElement("job-dropdown");

  // Show loading indicator if it exists
  if (jobLoadingIndicator) {
    jobLoadingIndicator.style.display = "inline-block";
  }
  
  // Hide error message if it exists
  if (jobListError) {
    jobListError.style.display = "none";
  }
  
  // Clear dropdown if it exists
  if (jobDropdown) {
    // Clear dropdown except for the placeholder
    while (jobDropdown.options.length > 1) {
      jobDropdown.remove(1);
    }
  } else {
    console.error("Job dropdown element not found even after initialization attempt");
    return; // Exit early if we still can't find it
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
      if (jobDropdown) {
        populateJobDropdown(data.jobs);
      } else {
        console.error("Cannot populate jobs: dropdown element not found");
      }
    } else {
      if (jobDropdown) {
        const noJobsOption = document.createElement('option');
        noJobsOption.textContent = 'No jobs found';
        noJobsOption.disabled = true;
        jobDropdown.appendChild(noJobsOption);
      }
    }
  } catch (error) {
    console.error("Error fetching jobs:", error);
    // Use the showError utility function
    showError(`Failed to load jobs: ${error.message}`, "job-list");
  } finally {
    if (jobLoadingIndicator) {
      jobLoadingIndicator.style.display = "none";
    }
  }
}

// Ensure the job dropdown exists, create it if it doesn't
async function ensureJobDropdownExists() {
  return new Promise(resolve => {
    // Check if dropdown already exists
    let jobDropdown = getElement("job-dropdown");
    if (jobDropdown) {
      console.log("Job dropdown found, no need to create");
      resolve(true);
      return;
    }
    
    console.log("Job dropdown not found, checking if we need to create it");
    
    // Find the container where the dropdown should be
    const dropdownContainer = document.querySelector('.card-body');
    if (!dropdownContainer) {
      console.error("Cannot find container for dropdown");
      resolve(false);
      return;
    }
    
    // Create the dropdown if it doesn't exist
    if (!jobDropdown) {
      console.log("Creating job dropdown");
      jobDropdown = document.createElement('select');
      jobDropdown.id = 'job-dropdown';
      jobDropdown.className = 'form-select form-select-lg';
      
      // Add placeholder option
      const placeholderOption = document.createElement('option');
      placeholderOption.value = '';
      placeholderOption.textContent = 'Choose a Jenkins job...';
      placeholderOption.selected = true;
      placeholderOption.disabled = true;
      jobDropdown.appendChild(placeholderOption);
      
      // Find the first element in the container
      const firstElement = dropdownContainer.firstChild;
      if (firstElement) {
        dropdownContainer.insertBefore(jobDropdown, firstElement);
      } else {
        dropdownContainer.appendChild(jobDropdown);
      }
      
      console.log("Job dropdown created");
    }
    
    // Set our global flag
    jobDropdownInitialized = true;
    resolve(true);
  });
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

  // Set up event listener for dropdown selection
  // Only add once to prevent duplicates
  if (!jobDropdownInitialized) {
    jobDropdown.addEventListener('change', function() {
      const selectedJobFullName = this.value;
      if (selectedJobFullName) {
        // Call the existing displayJobDetails function with the selected job
        displayJobDetails(selectedJobFullName);
      }
    });
    jobDropdownInitialized = true;
  }
}

// Initialize event listeners - using a retry mechanism to ensure elements are available
function initializeWithRetry(maxRetries = 3, delayMs = 500) {
  let retries = 0;
  
  function attemptInitialize() {
    // Check if we're on the dashboard page by looking for key elements
    const refreshBtn = document.getElementById("refresh-dashboard");
    
    if (refreshBtn) {
      console.log("Dashboard found, initializing...");
      // Set up refresh button
      refreshBtn.addEventListener("click", fetchJobs);
      // Fetch jobs on initial load
      fetchJobs();
    } else if (retries < maxRetries) {
      console.log(`Dashboard elements not found yet, retrying... (${retries + 1}/${maxRetries})`);
      retries++;
      setTimeout(attemptInitialize, delayMs);
    } else {
      console.log("Max retries reached, dashboard elements not found");
    }
  }
  
  // Start the initialization process
  attemptInitialize();
}

// Initialize when DOM is fully loaded
document.addEventListener("DOMContentLoaded", function() {
  console.log("DOMContentLoaded triggered in jobListHandler.js");
  initializeWithRetry();
});
