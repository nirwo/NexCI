// --- Job List Functions ---

// Fetch the list of jobs from the API
async function fetchJobs() {
  console.log("Fetching jobs...");
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
    console.error("Job dropdown element not found");
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
  jobDropdown.addEventListener('change', function() {
    const selectedJobFullName = this.value;
    if (selectedJobFullName) {
      // Call the existing displayJobDetails function with the selected job
      displayJobDetails(selectedJobFullName);
    }
  });
}

// Initialize event listeners when page loads
document.addEventListener("DOMContentLoaded", function () {
  // Fetch jobs on initial load
  fetchJobs();

  // Set up refresh button
  const refreshBtn = document.getElementById("refresh-dashboard");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", fetchJobs);
  }
});
