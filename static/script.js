document.addEventListener('DOMContentLoaded', () => {
    // Cache DOM elements
    const jenkinsUrlInput = document.getElementById('jenkins_url');
    const usernameInput = document.getElementById('username');
    const apiTokenInput = document.getElementById('api_token');
    const fetchJobsBtn = document.getElementById('fetch-jobs-btn');
    const connectionErrorDiv = document.getElementById('connection-error'); // Keep for connection issues
    const jobList = document.getElementById('job-list');
    const jobListError = document.getElementById('job-list-error');
    const logErrorOutput = document.getElementById('log-error');
    const buildErrorOutput = document.getElementById('build-error');
    const jobDetailsArea = document.getElementById('job-details-area');
    const selectedJobTitle = document.getElementById('selected-job-title');
    const buildLoadingIndicator = document.getElementById('build-loading-indicator');
    const fetchLogsBtn = document.getElementById('fetch-logs-btn');
    const buildChartsArea = document.getElementById('build-charts-area'); // Added
    const buildSuccessChartCanvas = document.getElementById('buildSuccessChart'); // Added - get canvas element
    const logDisplayArea = document.getElementById('log-display-area');
    const logContentElement = document.getElementById('log-content');
    const logLoadingIndicator = document.getElementById('log-loading-indicator');

    // --- State Variables ---
    let latestBuildUrl = null; // Added: Store the URL for the latest build
    let buildSuccessChartInstance = null; // Added: Store the Chart.js instance

    // --- Helper Functions ---
    function showError(message, area) {
        // Clear all errors first
        connectionErrorDiv.style.display = 'none';
        jobListError.style.display = 'none';
        buildErrorOutput.style.display = 'none';
        logErrorOutput.style.display = 'none'; // Use renamed variable

        let errorDiv = null;
        switch(area) {
            case 'connection': errorDiv = connectionErrorDiv; break;
            case 'job-list':   errorDiv = jobListError; break;
            case 'build':      errorDiv = buildErrorOutput; break; // Errors during build fetch/chart render
            case 'log':        errorDiv = logErrorOutput; break; // Errors during log fetch
        }
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    function showJobDetailSection(sectionToShow) {
        // Hide all detail sections first
        buildChartsArea.style.display = 'none';
        logDisplayArea.style.display = 'none';

        if (sectionToShow === 'log') {
            logDisplayArea.style.display = 'block';
        } else if (sectionToShow === 'chart') {
            buildChartsArea.style.display = 'block';
        } // Add other sections like 'kpi' if needed later
    }

    // Save connection info to localStorage
    function saveConnectionInfo() {
        localStorage.setItem('jenkinsUrl', jenkinsUrlInput.value.trim());
        localStorage.setItem('username', usernameInput.value.trim());
        localStorage.setItem('apiToken', apiTokenInput.value.trim()); // Save the token
        console.log("Jenkins URL, Username, and API Token saved to localStorage.");
    }

    // Populate Job List
    function populateJobList(jobs) {
        console.log("Populating job list...");
        jobList.innerHTML = ''; // Clear previous list
        if (jobs.length === 0) {
            jobList.innerHTML = '<p class="text-muted">No jobs found on the server.</p>';
            return;
        }
        jobs.forEach(job => {
            const jobItem = document.createElement('a');
            jobItem.href = '#'; // Prevent page jump
            jobItem.classList.add('list-group-item', 'list-group-item-action');
            // Add data attribute to store the full name needed for API calls
            jobItem.setAttribute('data-job-full-name', job.full_name);
            jobItem.textContent = job.name; // Display the simple name

            // Optional: Add extra info like last build status if available directly from /api/jobs
            jobList.appendChild(jobItem);
        });
        console.log("Job list populated.");
    }

    // --- Function to fetch build details (including latest build URL) ---
    async function fetchLatestBuildInfo(jobFullName) {
        console.log(`Fetching latest build info for: ${jobFullName}`);
        buildLoadingIndicator.style.display = 'inline-block';
        buildErrorOutput.style.display = 'none';
        fetchLogsBtn.disabled = true; // Disable log button until we have the URL
        latestBuildUrl = null; // Reset latest build URL

        const jenkinsUrl = localStorage.getItem('jenkinsUrl');
        const username = localStorage.getItem('username');
        const apiToken = localStorage.getItem('apiToken');

        if (!jenkinsUrl || !username || !apiToken) {
            showError('Missing Jenkins connection details.', 'build');
            buildLoadingIndicator.style.display = 'none';
            return;
        }

        try {
            const response = await fetch('/api/builds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    job_full_name: jobFullName,
                    jenkins_url: jenkinsUrl,
                    username: username,
                    api_token: apiToken
                })
            });

            if (!response.ok) {
                let errorMsg = `Error fetching builds: ${response.status}`;
                try { const errData = await response.json(); errorMsg += ` - ${errData.error || 'Unknown'}`; } catch (e) { /* Ignore */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.builds && data.builds.length > 0) {
                // Jenkins API usually returns builds newest first
                latestBuildUrl = data.builds[0].url; // Store the URL
                console.log(`Latest build URL found: ${latestBuildUrl}`);
                fetchLogsBtn.disabled = false; // Enable log button NOW

                // Optionally trigger chart update here as well
                await fetchAndDisplayBuildInsights(jobFullName, data.builds); // Pass builds data
            } else {
                showError('No builds found for this job.', 'build');
            }

        } catch (error) {
            console.error('Error fetching build info:', error);
            showError(error.message, 'build');
        } finally {
            buildLoadingIndicator.style.display = 'none';
        }
    }

    // Function to fetch and display Build Insights (Chart)
    // Modified to accept builds data directly if available
    async function fetchAndDisplayBuildInsights(jobFullName, buildsData = null) {
        console.log(`Fetching insights for job: ${jobFullName}`);
        buildErrorOutput.style.display = 'none'; // Hide previous errors

        const jenkinsUrl = localStorage.getItem('jenkinsUrl');
        const username = localStorage.getItem('username');
        const apiToken = localStorage.getItem('apiToken');

        // Check if we need to fetch or use provided data
        let dataToProcess;
        if (buildsData) {
            console.log("Using provided builds data for chart.");
            dataToProcess = { builds: buildsData }; // Use passed data
            buildLoadingIndicator.style.display = 'none'; // No need to show loading if data is here
        } else if (jenkinsUrl && (username || apiToken)) {
            console.log("Fetching new builds data for chart...");
            buildLoadingIndicator.style.display = 'inline-block'; // Show loading indicator
            try {
                const response = await fetch('/api/builds', { // Fetching needed
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        job_full_name: jobFullName,
                        jenkins_url: jenkinsUrl,
                        username: username,
                        api_token: apiToken
                    })
                });
                if (!response.ok) {
                    let errorMsg = `Error fetching builds for chart: ${response.status}`;
                    try { const errData = await response.json(); errorMsg += ` - ${errData.error || 'Unknown'}`; } catch (e) { /* Ignore */ }
                    throw new Error(errorMsg);
                }
                dataToProcess = await response.json();
            } catch (error) {
                console.error('Error fetching build data for insights:', error);
                showError(error.message, 'build');
                buildLoadingIndicator.style.display = 'none';
                return; // Stop if fetch fails
            } finally {
                buildLoadingIndicator.style.display = 'none';
            }
        } else {
            showError('Missing Jenkins connection details.', 'build');
            buildLoadingIndicator.style.display = 'none';
            return;
        }

        try {
            // Process the data (either provided or fetched)
            if (!dataToProcess || !dataToProcess.builds || dataToProcess.builds.length === 0) {
                showError('No build data available to display insights.', 'build');
                return;
            }

            // --- Calculate Stats ---
            let successCount = 0;
            let failureCount = 0;
            let otherCount = 0; // (e.g., ABORTED, UNSTABLE, RUNNING)
            const buildsToAnalyze = dataToProcess.builds.slice(0, 20); // Analyze up to last 20 builds

            buildsToAnalyze.forEach(build => {
                if (build.result === 'SUCCESS') {
                    successCount++;
                } else if (build.result === 'FAILURE') {
                    failureCount++;
                } else {
                    otherCount++;
                }
            });

            // --- Render Chart ---
            if (buildSuccessChartInstance) { // Destroy existing chart instance
                buildSuccessChartInstance.destroy();
                buildSuccessChartInstance = null;
            }
            const ctx = buildSuccessChartCanvas.getContext('2d');
            buildSuccessChartInstance = new Chart(ctx, {
                type: 'pie',
                data: {
                    labels: ['Success', 'Failure', 'Other'],
                    datasets: [{
                        label: 'Recent Build Statuses',
                        data: [successCount, failureCount, otherCount],
                        backgroundColor: [
                            'rgba(75, 192, 192, 0.7)', // Greenish
                            'rgba(255, 99, 132, 0.7)',  // Reddish
                            'rgba(201, 203, 207, 0.7)' // Greyish
                        ],
                        borderColor: [
                            'rgba(75, 192, 192, 1)',
                            'rgba(255, 99, 132, 1)',
                            'rgba(201, 203, 207, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // Allow chart to resize better
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: true,
                            text: `Build Status (Last ${buildsToAnalyze.length})`
                        }
                    }
                }
            });

            buildChartsArea.style.display = 'block'; // Ensure chart area is visible
        } catch (error) {
            console.error('Error in fetchAndDisplayBuildInsights:', error);
            showError(error.message, 'build');
        } finally {
        }
    }

    // Function to fetch and display Build Logs
    async function fetchAndDisplayLogs() {
        if (!latestBuildUrl) {
            console.error("No latest build URL available to fetch logs.");
            showError("Cannot fetch logs: Latest build information is missing.", 'log');
            return;
        }
        console.log(`Fetching Logs for latest build: ${latestBuildUrl}`);
        showJobDetailSection('log'); // Show the Log section, hide chart
        logLoadingIndicator.style.display = 'block';
        logErrorOutput.style.display = 'none'; // Clear previous log errors
        logContentElement.textContent = ''; // Clear previous logs

        const jenkinsUrl = localStorage.getItem('jenkinsUrl');
        const username = localStorage.getItem('username');
        const apiToken = localStorage.getItem('apiToken');

        if (!jenkinsUrl || !username || !apiToken) {
            showError('Missing Jenkins connection details in localStorage.', 'log');
            logLoadingIndicator.style.display = 'none';
            return;
        }

        try {
            const response = await fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    build_url: latestBuildUrl, // Send the full build URL
                    jenkins_url: jenkinsUrl,   // Needed for auth on backend
                    username: username,
                    api_token: apiToken
                })
            });

            if (!response.ok) {
                let errorMsg = `Error fetching log: ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMsg += ` - ${errorData.error || 'Unknown error'}`;
                } catch (e) { /* Ignore if response isn't JSON */ }
                throw new Error(errorMsg);
            }

            const data = await response.json();
            logContentElement.textContent = data.log_content || 'Log content is empty.';
        } catch (error) {
            console.error('Error fetching logs:', error);
            showError(`Failed to load logs: ${error.message}`, 'log');
        } finally {
            logLoadingIndicator.style.display = 'none';
        }
    }

    // --- API Call Functions ---
    async function fetchJobs() { // Define function here
        console.log("Fetch Jobs function started!");
        // Try getting the element directly inside the function
        const localJobLoadingIndicator = document.getElementById('job-loading-indicator');
        console.log("Checking localJobLoadingIndicator inside fetchJobs:", localJobLoadingIndicator);

        try {
            // Check the locally fetched element
            if (!localJobLoadingIndicator) {
                console.error("CRITICAL: jobLoadingIndicator element NOT FOUND inside fetchJobs!");
                showError("Internal error: UI component missing (JL).", 'connection');
                return; // Stop execution
            }

            localJobLoadingIndicator.style.display = 'inline-block'; // Use the locally fetched element
            jobListError.style.display = 'none';
            connectionErrorDiv.style.display = 'none';
            jobList.innerHTML = '';
            fetchJobsBtn.disabled = true;
            fetchJobsBtn.textContent = 'Fetching...';

            const jenkinsUrl = jenkinsUrlInput.value.trim();
            const username = usernameInput.value.trim();
            const apiToken = apiTokenInput.value.trim();
            saveConnectionInfo();

            // --- Validation ---
            if (!jenkinsUrl) {
                showError('Jenkins URL is required.', 'connection');
                localJobLoadingIndicator.style.display = 'none'; // Use local var
                fetchJobsBtn.disabled = false;
                fetchJobsBtn.textContent = 'Fetch Jobs';
                return;
            }
            if (!username && !apiToken) {
                showError('Username or API Token is required.', 'connection');
                localJobLoadingIndicator.style.display = 'none'; // Use local var
                fetchJobsBtn.disabled = false;
                fetchJobsBtn.textContent = 'Fetch Jobs';
                return;
            }

            // --- API Call ---
            console.log("Making API call to /api/jobs");
            const response = await fetch('/api/jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jenkins_url: jenkinsUrl,
                    username: username,
                    api_token: apiToken
                })
            });
            console.log(`API Response Status: ${response.status}`);

            if (!response.ok) {
                let errorMsg = `Error fetching jobs: ${response.status}`;
                let errorData = null;
                try {
                    errorData = await response.json();
                    errorMsg += ` - ${errorData.error || 'Unknown error'}`;
                } catch (e) { /* Ignore */ }
                console.error("API Error Response:", errorData);
                throw new Error(errorMsg);
            }

            const data = await response.json();
            console.log("API Response Data:", data);

            if (data.jobs && data.jobs.length > 0) {
                console.log("Calling populateJobList");
                populateJobList(data.jobs);
            } else {
                showError('No jobs found or an unexpected response received.', 'job-list');
                console.log("No jobs found in response or unexpected data structure.");
            }
        } catch (error) {
            console.error('Error in fetchJobs:', error);
            // Ensure loading indicator is hidden even on error, *if it exists*
            if (localJobLoadingIndicator) localJobLoadingIndicator.style.display = 'none'; // Use local var
            showError(error.message, 'job-list');
        } finally {
            console.log("Fetch Jobs finally block reached.");
            // Ensure loading indicator is hidden and button is re-enabled *if they exist*
            if (localJobLoadingIndicator) localJobLoadingIndicator.style.display = 'none'; // Use local var
            if (fetchJobsBtn) {
                fetchJobsBtn.disabled = false;
                fetchJobsBtn.textContent = 'Fetch Jobs';
            }
        }
    } // End of fetchJobs function definition

    // --- Event Listeners ---
    console.log("Adding Fetch Jobs listener");
    // Attach the function defined above
    fetchJobsBtn.addEventListener('click', fetchJobs);

    fetchLogsBtn.addEventListener('click', () => {
        if (latestBuildUrl) { // Only need the URL now
            fetchAndDisplayLogs(); // Uses the stored latestBuildUrl
        } else {
            showError("Build information (including log URL) has not been loaded for the selected job.", 'log');
        }
    });

    // Add listener for clicks within the job list container
    jobList.addEventListener('click', (event) => {
        // Check if the clicked element is a job item (<a> tag)
        if (event.target && event.target.matches('.list-group-item')) {
            event.preventDefault(); // Prevent default anchor behavior

            // Remove active state from previously selected item
            const previouslySelectedItem = jobList.querySelector('.active');
            if (previouslySelectedItem) {
                previouslySelectedItem.classList.remove('active');
            }
            // Add active state to the clicked item
            event.target.classList.add('active');

            // Get the job's full name from the data attribute
            const jobFullName = event.target.getAttribute('data-job-full-name');
            const jobDisplayName = event.target.textContent; // Get the name shown to the user

            if (jobFullName) {
                selectedJobTitle.textContent = `Details for: ${jobDisplayName}`; // Update title
                jobDetailsArea.style.display = 'block'; // Show the details area

                // Hide previous log/chart/error messages in the details area
                logDisplayArea.style.display = 'none';
                buildChartsArea.style.display = 'none';
                buildErrorOutput.style.display = 'none';
                logErrorOutput.style.display = 'none';

                // Fetch the latest build info (which enables the log button on success)
                fetchLatestBuildInfo(jobFullName);
            } else {
                console.error("Clicked job item is missing the 'data-job-full-name' attribute.");
                showError("Internal error: Could not identify the selected job.", 'job-list');
            }
        }
    });

    // Initial load - try to get connection info and fetch jobs if available
    async function initializeApp() {
        console.log('[DEBUG] Initializing app...');
        // Load saved credentials
        const savedUrl = localStorage.getItem('jenkinsUrl') || '';
        const savedUser = localStorage.getItem('username') || '';
        const savedToken = localStorage.getItem('apiToken') || '';

        jenkinsUrlInput.value = savedUrl;
        usernameInput.value = savedUser;
        apiTokenInput.value = savedToken;

        // If credentials exist, keep connection accordion collapsed, otherwise expand it.
        if (savedUrl && (savedUser || savedToken)) { // Require URL and at least one auth detail
            console.log('[DEBUG] Credentials found, keeping connection collapsed.');
            // Ensure it's collapsed (Bootstrap default state is collapsed if 'show' class is absent)
            const connectionCollapseElement = document.getElementById('collapseConnection');
            if (connectionCollapseElement && connectionCollapseElement.classList.contains('show')) {
                const bsCollapse = bootstrap.Collapse.getInstance(connectionCollapseElement);
                if (bsCollapse) {
                    bsCollapse.hide();
                }
            }
        } else {
            console.log('[DEBUG] No complete credentials found, expanding connection.');
            // Expand the accordion
            const connectionCollapseElement = document.getElementById('collapseConnection');
            if (connectionCollapseElement) {
                connectionCollapseElement.classList.add('show');
            }
        }

        // Hide job details area initially
        jobDetailsArea.style.display = 'none';
        showJobDetailSection(null); // Hide KPI and Log areas initially

        console.log('[DEBUG] App Initialized.');
    }

    // Initialize the app on page load
    initializeApp(); 

    // Add a small delay and then check if the first step is still visible
    setTimeout(() => {
        const firstStepCheck = document.getElementById('step-connect');
        if (firstStepCheck) {
            console.log("[DEBUG] After init & delay, step-connect display is:", firstStepCheck.style.display);
            console.log("[DEBUG] After init & delay, step-connect classes:", firstStepCheck.className);
        }
    }, 100); // 100ms delay
});
