document.addEventListener('DOMContentLoaded', function() {
    // --- DOM Element References ---
    const jobList = document.getElementById('job-list');
    const jobListError = document.getElementById('job-list-error');
    const jobDetailsArea = document.getElementById('job-details-area');
    const selectedJobTitle = document.getElementById('selected-job-title');
    const buildLoadingIndicator = document.getElementById('build-loading-indicator');
    const buildErrorOutput = document.getElementById('build-error');
    const fetchLogsBtn = document.getElementById('fetch-logs-btn');
    const viewTimelineBtn = document.getElementById('view-timeline-btn');
    const buildChartsArea = document.getElementById('build-charts-area');
    const durationTrendArea = document.getElementById('duration-trend-area');
    const buildSuccessChartCanvas = document.getElementById('buildSuccessChart');
    const durationTrendChartCanvas = document.getElementById('durationTrendChart');
    const logDisplayArea = document.getElementById('log-display-area');
    const timelineDisplayArea = document.getElementById('timeline-display-area');
    const logContentElement = document.getElementById('log-content');
    const logLoadingIndicator = document.getElementById('log-loading-indicator');
    const logErrorOutput = document.getElementById('log-error');
    const refreshDashboardBtn = document.getElementById('refresh-dashboard');
    const jobLoadingIndicator = document.getElementById('job-loading-indicator');

    // --- State Variables ---
    let latestBuildUrl = null;
    let buildSuccessChartInstance = null;
    let durationTrendChartInstance = null;

    // --- Error Handling ---
    function showError(message, context) {
        // Clear all errors first
        jobListError.style.display = 'none';
        buildErrorOutput.style.display = 'none';
        logErrorOutput.style.display = 'none';

        let errorDiv = null;
        switch (context) {
            case 'job-list':   errorDiv = jobListError; break;
            case 'build':      errorDiv = buildErrorOutput; break;
            case 'log':        errorDiv = logErrorOutput; break;
        }
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    // --- Dashboard Data Loading ---
    function loadDashboard() {
        fetchJobs();
    }

    // --- Job List Functions ---
    async function fetchJobs() {
        console.log("Fetching jobs...");
        jobLoadingIndicator.style.display = 'inline-block';
        jobListError.style.display = 'none';
        jobList.innerHTML = '';

        try {
            const response = await fetch('/api/jobs');
            
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = await response.json();
            
            if (data.jobs && data.jobs.length > 0) {
                populateJobList(data.jobs);
            } else {
                jobList.innerHTML = '<div class="list-group-item text-muted">No jobs found</div>';
            }
        } catch (error) {
            console.error('Error fetching jobs:', error);
            showError(`Failed to load jobs: ${error.message}`, 'job-list');
        } finally {
            jobLoadingIndicator.style.display = 'none';
        }
    }

    function populateJobList(jobs) {
        jobList.innerHTML = '';
        
        jobs.forEach(job => {
            const jobItem = document.createElement('a');
            jobItem.href = '#';
            jobItem.classList.add('list-group-item', 'list-group-item-action');
            jobItem.setAttribute('data-job-full-name', job.fullName);
            jobItem.textContent = job.name;
            jobList.appendChild(jobItem);
        });
    }

    // --- Build Data Functions ---
    async function fetchLatestBuildInfo(jobFullName) {
        buildLoadingIndicator.style.display = 'inline-block';
        buildErrorOutput.style.display = 'none';
        fetchLogsBtn.disabled = true;
        viewTimelineBtn.disabled = true;
        latestBuildUrl = null;

        try {
            const response = await fetch(`/api/builds?job_full_name=${encodeURIComponent(jobFullName)}`);

            if (!response.ok) {
                throw new Error(`Error fetching builds: ${response.status}`);
            }

            const data = await response.json();

            if (data.builds && data.builds.length > 0) {
                latestBuildUrl = data.builds[0].url;
                console.log(`Latest build URL found: ${latestBuildUrl}`);
                fetchLogsBtn.disabled = false;
                viewTimelineBtn.disabled = false;

                // Update the build stats
                updateBuildStats(data.builds);

                // Show build visualizations
                await fetchAndDisplayBuildInsights(jobFullName, data.builds);
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

    function updateBuildStats(builds) {
        if (!builds || builds.length === 0) return;

        // Calculate success rate
        const totalBuilds = builds.length;
        const successfulBuilds = builds.filter(b => b.result === 'SUCCESS').length;
        const successRate = (successfulBuilds / totalBuilds * 100).toFixed(0);
        document.getElementById('stat-success-rate').textContent = `${successRate}%`;

        // Last build status
        const lastBuild = builds[0];
        const lastBuildStatus = lastBuild.result || 'IN PROGRESS';
        document.getElementById('stat-last-build').textContent = `#${lastBuild.number}`;
        document.getElementById('stat-last-build').parentElement.parentElement.classList.remove('bg-success', 'bg-danger', 'bg-warning');
        
        if (lastBuildStatus === 'SUCCESS') {
            document.getElementById('stat-last-build').parentElement.parentElement.classList.add('bg-success');
        } else if (lastBuildStatus === 'FAILURE') {
            document.getElementById('stat-last-build').parentElement.parentElement.classList.add('bg-danger');
        } else {
            document.getElementById('stat-last-build').parentElement.parentElement.classList.add('bg-warning');
        }

        // Calculate average duration
        const buildsWithDuration = builds.filter(b => b.duration);
        if (buildsWithDuration.length > 0) {
            const totalDuration = buildsWithDuration.reduce((sum, b) => sum + b.duration, 0);
            const avgDuration = totalDuration / buildsWithDuration.length;
            document.getElementById('stat-avg-duration').textContent = formatDuration(avgDuration);
        } else {
            document.getElementById('stat-avg-duration').textContent = '--';
        }

        // Build trend
        const recentBuilds = builds.slice(0, 5);
        let trend = '';
        let improving = false;
        let deteriorating = false;

        if (recentBuilds.length >= 3) {
            const recentResults = recentBuilds.map(b => b.result === 'SUCCESS');
            if (recentResults[0] && !recentResults[2]) {
                improving = true;
            } else if (!recentResults[0] && recentResults[2]) {
                deteriorating = true;
            }
        }

        if (improving) {
            trend = '↑';
            document.getElementById('stat-build-trend').parentElement.parentElement.classList.remove('bg-warning', 'bg-danger');
            document.getElementById('stat-build-trend').parentElement.parentElement.classList.add('bg-success');
        } else if (deteriorating) {
            trend = '↓';
            document.getElementById('stat-build-trend').parentElement.parentElement.classList.remove('bg-warning', 'bg-success');
            document.getElementById('stat-build-trend').parentElement.parentElement.classList.add('bg-danger');
        } else {
            trend = '→';
            document.getElementById('stat-build-trend').parentElement.parentElement.classList.remove('bg-success', 'bg-danger');
            document.getElementById('stat-build-trend').parentElement.parentElement.classList.add('bg-warning');
        }
        document.getElementById('stat-build-trend').textContent = trend;
    }

    function formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    // --- Build Insights ---
    async function fetchAndDisplayBuildInsights(jobFullName, buildsData = null) {
        buildErrorOutput.style.display = 'none';

        // Check if we need to fetch or use provided data
        let dataToProcess;
        if (buildsData) {
            console.log("Using provided builds data for chart.");
            dataToProcess = { builds: buildsData };
        } else {
            console.log("Fetching new builds data for chart...");
            buildLoadingIndicator.style.display = 'inline-block';
            try {
                const response = await fetch(`/api/builds?job_full_name=${encodeURIComponent(jobFullName)}`);
                if (!response.ok) {
                    throw new Error(`Error fetching builds for chart: ${response.status}`);
                }
                dataToProcess = await response.json();
            } catch (error) {
                console.error('Error fetching build data for insights:', error);
                showError(error.message, 'build');
                buildLoadingIndicator.style.display = 'none';
                return;
            } finally {
                buildLoadingIndicator.style.display = 'none';
            }
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

            // --- Render Success Rate Chart ---
            if (buildSuccessChartInstance) {
                buildSuccessChartInstance.destroy();
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
                            'rgba(75, 192, 192, 0.7)',  // Greenish
                            'rgba(255, 99, 132, 0.7)',  // Reddish
                            'rgba(201, 203, 207, 0.7)'  // Greyish
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
                    maintainAspectRatio: false,
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

            // --- Render Duration Trend Chart ---
            renderDurationTrendChart(buildsToAnalyze.slice(0, 10).reverse());
            
            // Show chart areas
            buildChartsArea.style.display = 'block';
            durationTrendArea.style.display = 'block';
        } catch (error) {
            console.error('Error in fetchAndDisplayBuildInsights:', error);
            showError(error.message, 'build');
        }
    }

    function renderDurationTrendChart(builds) {
        if (!builds || builds.length === 0) return;
        
        // Extract data for the chart
        const labels = builds.map(b => `#${b.number}`);
        const durations = builds.map(b => b.duration ? b.duration / 1000 / 60 : 0); // Convert to minutes
        
        // Determine color based on result
        const backgroundColors = builds.map(b => {
            if (b.result === 'SUCCESS') {
                return 'rgba(75, 192, 192, 0.5)'; // Success - green
            } else if (b.result === 'FAILURE') {
                return 'rgba(255, 99, 132, 0.5)'; // Failure - red
            } else {
                return 'rgba(201, 203, 207, 0.5)'; // Other - gray
            }
        });
        
        // Create or update chart
        if (durationTrendChartInstance) {
            durationTrendChartInstance.destroy();
        }
        
        const ctx = durationTrendChartCanvas.getContext('2d');
        durationTrendChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Build Duration (minutes)',
                    data: durations,
                    backgroundColor: backgroundColors,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Minutes'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Build Number'
                        }
                    }
                }
            }
        });
    }

    // --- Log Handling ---
    async function fetchAndDisplayLogs() {
        if (!latestBuildUrl) {
            showError("Build URL is missing.", 'log');
            return;
        }

        // Hide timeline, show logs
        timelineDisplayArea.style.display = 'none';
        logDisplayArea.style.display = 'block';
        
        logLoadingIndicator.style.display = 'block';
        logErrorOutput.style.display = 'none';
        logContentElement.textContent = '';

        try {
            const response = await fetch(`/api/log?build_url=${encodeURIComponent(latestBuildUrl)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }

            const data = await response.json();
            logContentElement.textContent = data.log_content || 'Log content is empty.';
            
            // Parse log for timeline data
            parseLogForTimeline(data.log_content);
        } catch (error) {
            console.error('Error fetching logs:', error);
            showError(`Failed to load logs: ${error.message}`, 'log');
        } finally {
            logLoadingIndicator.style.display = 'none';
        }
    }

    function parseLogForTimeline(logContent) {
        // This will be implemented for the timeline feature
    }

    function displayTimeline() {
        logDisplayArea.style.display = 'none';
        timelineDisplayArea.style.display = 'block';
        
        // This will be expanded for the timeline feature
    }

    // --- Event Listeners ---
    if (refreshDashboardBtn) {
        refreshDashboardBtn.addEventListener('click', loadDashboard);
    }

    if (jobList) {
        jobList.addEventListener('click', (event) => {
            // Check if the clicked element is a job item (<a> tag)
            if (event.target && event.target.matches('.list-group-item')) {
                event.preventDefault();

                // Remove active state from previously selected item
                const previouslySelectedItem = jobList.querySelector('.active');
                if (previouslySelectedItem) {
                    previouslySelectedItem.classList.remove('active');
                }
                
                // Add active state to the clicked item
                event.target.classList.add('active');

                // Get the job's full name from the data attribute
                const jobFullName = event.target.getAttribute('data-job-full-name');
                const jobDisplayName = event.target.textContent;

                if (jobFullName) {
                    selectedJobTitle.textContent = `Details for: ${jobDisplayName}`;
                    jobDetailsArea.style.display = 'block';

                    // Hide previous log/chart/error messages in the details area
                    logDisplayArea.style.display = 'none';
                    timelineDisplayArea.style.display = 'none';
                    
                    // Fetch the latest build info (which enables the log button on success)
                    fetchLatestBuildInfo(jobFullName);
                } else {
                    console.error("Clicked job item is missing the 'data-job-full-name' attribute.");
                    showError("Internal error: Could not identify the selected job.", 'job-list');
                }
            }
        });
    }

    if (fetchLogsBtn) {
        fetchLogsBtn.addEventListener('click', () => {
            if (latestBuildUrl) {
                fetchAndDisplayLogs();
            } else {
                showError("Build information (including log URL) has not been loaded.", 'log');
            }
        });
    }

    if (viewTimelineBtn) {
        viewTimelineBtn.addEventListener('click', () => {
            if (latestBuildUrl) {
                displayTimeline();
            } else {
                showError("Build information has not been loaded.", 'build');
            }
        });
    }

    // --- Initialize ---
    function initializeApp() {
        console.log('[DEBUG] Initializing app...');
        
        // Check if we're on the dashboard page and load data
        if (jobList && jobListError) {
            loadDashboard();
        }
        
        console.log('[DEBUG] App Initialized.');
    }

    // Start the app
    initializeApp();
});
