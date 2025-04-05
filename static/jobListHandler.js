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
  
  // Add loading state to dropdown
  if (jobDropdown) {
    jobDropdown.disabled = true;
    const loadingOption = document.createElement('option');
    loadingOption.textContent = 'Loading jobs...';
    
    // Keep track of current selection
    const currentSelection = jobDropdown.value;
    
    // Clear dropdown except for the placeholder
    while (jobDropdown.options.length > 1) {
      jobDropdown.remove(1);
    }
    // Add the loading indicator
    jobDropdown.appendChild(loadingOption);
  } else {
    console.error("Job dropdown element not found");
    jobsFetchInProgress = false;
    return; // Exit early if we can't find it
  }

  try {
    // Fetch both jobs and recent builds (for latest job)
    const [jobsResponse, recentBuildsResponse] = await Promise.all([
      fetch("/api/jobs"),
      fetch("/api/jenkins/recent_builds")
    ]);

    if (!jobsResponse.ok) {
      // Try to get more specific error message from the response body
      let errorMsg = `HTTP Error: ${jobsResponse.status}`; 
      try {
        const errorData = await jobsResponse.json();
        errorMsg += `: ${errorData.error || 'Unknown API error'}`;
      } catch (e) { /* Ignore if response is not JSON */ }
      throw new Error(errorMsg);
    }
    
    const data = await jobsResponse.json();
    let latestJob = null;
    
    // Process recent builds to find the latest job if possible
    if (recentBuildsResponse.ok) {
      const recentBuildsData = await recentBuildsResponse.json();
      if (recentBuildsData.builds && recentBuildsData.builds.length > 0) {
        // Sort by timestamp (newest first)
        const sortedBuilds = recentBuildsData.builds.sort((a, b) => b.timestamp - a.timestamp);
        if (sortedBuilds[0] && sortedBuilds[0].job) {
          latestJob = sortedBuilds[0].job;
        }
      }
    }

    if (data.jobs && data.jobs.length > 0) {
      populateJobDropdown(data.jobs, latestJob);
    } else {
      const noJobsOption = document.createElement('option');
      noJobsOption.textContent = 'No jobs found';
      noJobsOption.disabled = true;
      jobDropdown.appendChild(noJobsOption);
      jobDropdown.disabled = false;
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
function populateJobDropdown(jobs, latestJob = null) {
  const jobDropdown = getElement("job-dropdown");
  
  if (!jobDropdown) {
    console.error("Job dropdown element not found");
    return;
  }
  
  // Re-enable the dropdown in case it was disabled during loading
  jobDropdown.disabled = false;

  // Group jobs by folder structure
  const jobGroups = {};
  
  jobs.forEach((job) => {
    const fullName = job.fullName || "";
    const parts = fullName.split('/');
    
    // If the job is in a folder
    if (parts.length > 1) {
      const folder = parts.slice(0, -1).join('/');
      if (!jobGroups[folder]) {
        jobGroups[folder] = [];
      }
      jobGroups[folder].push(job);
    } else {
      // Root level jobs
      if (!jobGroups["Root"]) {
        jobGroups["Root"] = [];
      }
      jobGroups["Root"].push(job);
    }
  });
  
  // Sort groups alphabetically
  const sortedGroups = Object.keys(jobGroups).sort((a, b) => {
    // Move Root to the top
    if (a === "Root") return -1;
    if (b === "Root") return 1;
    return a.localeCompare(b);
  });
  
  // Create optgroups for each folder
  sortedGroups.forEach((group) => {
    // Skip creating optgroup for "Root" if it's the only group
    const isRoot = group === "Root";
    let optgroup = null;
    
    if (!isRoot || sortedGroups.length > 1) {
      optgroup = document.createElement("optgroup");
      optgroup.label = isRoot ? "Root Jobs" : group;
      jobDropdown.appendChild(optgroup);
    }
    
    // Sort jobs within each group
    jobGroups[group].sort((a, b) => {
      const nameA = a.fullName || "";
      const nameB = b.fullName || "";
      return nameA.localeCompare(nameB);
    });
    
    // Add job options
    jobGroups[group].forEach((job) => {
      const option = document.createElement("option");
      option.value = job.fullName;
      
      // For jobs in folders, only show the job name, not the full path
      const parts = job.fullName.split('/');
      option.textContent = isRoot ? job.fullName : parts[parts.length - 1];
      
      // Store the full path as a data attribute
      option.setAttribute('data-url', job.url);
      option.setAttribute('title', job.fullName); // Add tooltip with full name
      
      if (optgroup) {
        optgroup.appendChild(option);
      } else {
        jobDropdown.appendChild(option);
      }
    });
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
  
  // Auto-select the latest job if provided
  if (latestJob) {
    // Find the option with the matching value
    const option = Array.from(jobDropdown.options).find(opt => 
      opt.value === latestJob
    );
    
    if (option) {
      console.log(`Auto-selecting latest job: ${latestJob}`);
      // Set the dropdown value
      jobDropdown.value = latestJob;
      
      // Create and dispatch change event
      const changeEvent = new Event('change', { bubbles: true });
      jobDropdown.dispatchEvent(changeEvent);
    }
  }
}

// Handle job selection - separate function to avoid duplicate listeners
function handleJobSelection() {
  const selectedJobFullName = this.value;
  console.log("Job selected:", selectedJobFullName);
  
  if (selectedJobFullName) {
    // Dispatch a custom event that both old and new components can listen to
    const jobSelectedEvent = new CustomEvent('jobSelected', {
      detail: {
        jobFullName: selectedJobFullName
      }
    });
    document.dispatchEvent(jobSelectedEvent);
    
    // For backward compatibility, call the existing displayJobDetails function
    if (typeof displayJobDetails === 'function') {
      displayJobDetails(selectedJobFullName);
    } else {
      console.log("displayJobDetails function not found, but event was dispatched");
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
    
    // Set up main refresh button
    refreshBtn.addEventListener("click", function() {
      console.log("Refresh button clicked");
      fetchJobs();
    });
    
    // Set up the jobs-specific refresh button
    const refreshJobsBtn = document.querySelector('.refresh-jobs-btn');
    if (refreshJobsBtn) {
      refreshJobsBtn.addEventListener('click', function() {
        console.log("Jobs refresh button clicked");
        fetchJobs();
      });
    }
    
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
