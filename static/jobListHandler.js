// --- Job List Functions ---

// Fetch the list of jobs from the API
async function fetchJobs() {
  console.log("Fetching jobs...");
  const jobLoadingIndicator = getElement("job-loading-indicator");
  const jobListError = getElement("job-list-error");
  const jobList = getElement("job-list");

  // Ensure UI elements exist before proceeding
  if (!jobList || !jobListError || !jobLoadingIndicator) {
      console.error('Required job list UI elements not found.');
      // Optionally display a more prominent error to the user
      return; 
  }

  jobLoadingIndicator.style.display = "inline-block";
  jobListError.style.display = "none";
  jobList.innerHTML = ''; // Clear previous list

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
      populateJobList(data.jobs);
    } else {
       jobList.innerHTML =
          '<div class="list-group-item text-muted text-center py-3">No jobs found</div>';
    }
  } catch (error) {
    console.error("Error fetching jobs:", error);
    // Use the showError utility function (ensure utils.js is loaded first)
    showError(`Failed to load jobs: ${error.message}`, "job-list");
  } finally {
    jobLoadingIndicator.style.display = "none";
  }
}

// Populate the job list UI from the fetched data
function populateJobList(jobs) {
  const jobList = getElement("job-list");
  if (!jobList) {
    console.error("Job list element not found for population");
    return;
  }

  jobList.innerHTML = ""; // Clear previous list or loading indicator

  jobs.forEach((job) => {
    const jobItem = document.createElement("a");
    jobItem.href = "#"; // Prevent page jump
    jobItem.classList.add("list-group-item", "list-group-item-action");
    
    // *** IMPORTANT: Use job.fullName or a unique identifier ***
    // Jenkins typically uses fullName (path/to/job) which is more unique than just 'name'
    // Ensure the API returns 'fullName' or adjust accordingly.
    if (job.fullName) { 
        jobItem.setAttribute("data-job-full-name", job.fullName);
    } else {
        console.warn(`Job '${job.name}' is missing a 'fullName'. Using 'name' as fallback ID, but this might cause issues.`);
        jobItem.setAttribute("data-job-full-name", job.name); // Fallback, less reliable
    }
    
    jobItem.textContent = job.name; // Display the shorter name
    jobList.appendChild(jobItem);
  });
  console.log("[DEBUG] Job list populated.");
}
