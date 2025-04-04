window.addEventListener('load', function() {
    // --- DOM Element References ---
    // Use functions to get elements when needed instead of storing references at load time
    // This prevents issues with elements not being available at script load
    function getElement(id) {
        return document.getElementById(id);
    }
    
    // --- State Variables ---
    let latestBuildUrl = null;
    let buildSuccessChartInstance = null;
    let durationTrendChartInstance = null;
    let executionTimeChartInstance = null;
    // --- Error Handling ---
    function showError(message, context) {
        // Clear all errors first
        const jobListError = getElement('job-list-error');
        const buildErrorOutput = getElement('build-error');
        const logErrorOutput = getElement('log-error');
        
        if (jobListError) jobListError.style.display = 'none';
        if (buildErrorOutput) buildErrorOutput.style.display = 'none';
        if (logErrorOutput) logErrorOutput.style.display = 'none';
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
    
    // Expose loadDashboard and fetchJobs to global scope
    window.loadDashboard = loadDashboard;
    window.fetchJobs = fetchJobs;
    // --- Job List Functions ---
    async function fetchJobs() {
        console.log("Fetching jobs...");
        const jobLoadingIndicator = getElement('job-loading-indicator');
        const jobListError = getElement('job-list-error');
        const jobList = getElement('job-list');
        
        if (jobLoadingIndicator) jobLoadingIndicator.style.display = 'inline-block';
        if (jobListError) jobListError.style.display = 'none';
        if (jobList) jobList.innerHTML = '';
        try {
            const response = await fetch('/api/jobs');
            
            if (!response.ok) {
                throw new Error(`HTTP Error: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.jobs && data.jobs.length > 0) {
                populateJobList(data.jobs);
            } else {
                const jobList = getElement('job-list');
                if (jobList) {
                    jobList.innerHTML = '<div class="list-group-item text-muted">No jobs found</div>';
                }
            }
        } catch (error) {
            console.error('Error fetching jobs:', error);
            showError(`Failed to load jobs: ${error.message}`, 'job-list');
        } finally {
            jobLoadingIndicator.style.display = 'none';
        }
    }
    function populateJobList(jobs) {
        const jobList = getElement('job-list');
        if (!jobList) {
            console.error('Job list element not found');
            return;
        }
        
        jobList.innerHTML = '';
        
        jobs.forEach(job => {
            const jobItem = document.createElement('a');
            jobItem.href = '#';
            jobItem.classList.add('list-group-item', 'list-group-item-action');
            jobItem.setAttribute('data-job-full-name', job.fullName);
            jobItem.textContent = job.name;
            jobList.appendChild(jobItem);
        });
    // --- Build Data Functions ---
    async function fetchLatestBuildInfo(jobFullName) {
        buildLoadingIndicator.style.display = 'inline-block';
        buildErrorOutput.style.display = 'none';
        fetchLogsBtn.disabled = true;
        viewTimelineBtn.disabled = true;
        if (buildSummaryBtn) {
            buildSummaryBtn.disabled = true;
        }
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
                if (buildSummaryBtn) {
                    buildSummaryBtn.disabled = false;
                }
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
            // Get a fresh reference to the canvas every time
            const buildSuccessChartCanvas = document.getElementById('buildSuccessChart');
            if (!buildSuccessChartCanvas) {
                console.error('Build success chart canvas element not found');
                return;
            }
            
            // Always destroy the previous chart instance to prevent "Canvas is already in use" errors
            if (buildSuccessChartInstance) {
                buildSuccessChartInstance.destroy();
                buildSuccessChartInstance = null;
            }
            
            // Clear the parent container and recreate the canvas
            const chartContainer = buildSuccessChartCanvas.parentNode;
            chartContainer.innerHTML = '';
            const newCanvas = document.createElement('canvas');
            newCanvas.id = 'buildSuccessChart';
            chartContainer.appendChild(newCanvas);
            
            // Get the fresh canvas reference
            const freshCanvas = document.getElementById('buildSuccessChart');
            const ctx = freshCanvas.getContext('2d');
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
            
            // --- Render 24-Hour Execution Graph ---
            create24HourExecutionGraph(dataToProcess.builds);
            
            // Show chart areas
            const buildChartsArea = document.getElementById('build-charts-area');
            if (buildChartsArea) {
                buildChartsArea.style.display = 'block';
            }
            
            const durationTrendArea = document.getElementById('duration-trend-area');
            if (durationTrendArea) {
                durationTrendArea.style.display = 'block';
            }
        } catch (error) {
            console.error('Error in fetchAndDisplayBuildInsights:', error);
            showError(error.message, 'build');
        }
    }
    function renderDurationTrendChart(builds) {
        if (!builds || builds.length === 0) return;
        
        // Destroy existing chart instance if it exists to prevent errors
        if (durationTrendChartInstance) {
            durationTrendChartInstance.destroy();
        }
        
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
        
        if (!durationTrendChartCanvas) {
            console.error('Duration trend chart canvas element not found');
            return;
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
        logDisplayArea.style.display = 'block';
        const timelineArea = document.getElementById('timeline-area');
        if (timelineArea) {
            timelineArea.style.display = 'none';
        }
        
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
        if (!logContent) return [];
        
        const timelineContent = document.getElementById('timeline-content');
        timelineContent.innerHTML = '';
        
        // Regular expressions to extract timestamps
        const isoDateRegex = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z)\]/;
        const simpleDateRegex = /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/;
        
        // Parse log into steps
        const steps = [];
        let currentStep = null;
        
        const lines = logContent.split('\n');
        let lastTimestamp = new Date(); 
        
        // Process each line in the log
        lines.forEach(line => {
            // Extract timestamp and process the line
            const timestamp = extractTimestamp(line, isoDateRegex, simpleDateRegex, lastTimestamp);
            
            if (timestamp) {
                lastTimestamp = timestamp;
                processLogLine(line, timestamp, steps, currentStep);
            }
        });
        
        // Close any unclosed step
        if (currentStep) {
            currentStep.endTime = lastTimestamp;
            currentStep.duration = currentStep.endTime - currentStep.startTime;
            steps.push(currentStep);
        }
        
        // If no steps were parsed, create fallback steps based on log patterns
        if (steps.length === 0) {
            createFallbackSteps(logContent, steps);
        }
        
        return steps;
    }
    
    function extractTimestamp(line, isoDateRegex, simpleDateRegex, lastTimestamp) {
        let timestampMatch = line.match(isoDateRegex);
        if (!timestampMatch) {
            timestampMatch = line.match(simpleDateRegex);
        }
        return timestampMatch ? new Date(timestampMatch[1]) : lastTimestamp;
    }
    
    function processLogLine(line, timestamp, steps, currentStep) {
        const startingStepRegex = /Starting (building|execution of|processing|checkout|fetching) (.*)/i;
        const completedStepRegex = /(Finished|Completed|Done): (.*) with result: (SUCCESS|FAILURE|UNSTABLE|ABORTED)/i;
        const buildStatusRegex = /Build (.*): (SUCCESS|FAILURE|UNSTABLE|ABORTED)/i;
        
        // Check for step start
        const startMatch = line.match(startingStepRegex);
        if (startMatch) {
            if (currentStep) {
                // Close previous step if it wasn't closed
                currentStep.endTime = timestamp;
                currentStep.duration = currentStep.endTime - currentStep.startTime;
                steps.push(currentStep);
            }
            
            currentStep = {
                type: startMatch[1],
                name: startMatch[2],
                startTime: timestamp,
                status: 'RUNNING',
                messages: [line]
            };
            return currentStep;
        }
        
        // Check for step completion
        const completedMatch = line.match(completedStepRegex);
        if (completedMatch && currentStep) {
            currentStep.endTime = timestamp;
            currentStep.duration = currentStep.endTime - currentStep.startTime;
            currentStep.status = completedMatch[3];
            currentStep.messages.push(line);
            steps.push(currentStep);
            return null; // Step is complete
        }
        
        // Check for build status update
        const buildStatusMatch = line.match(buildStatusRegex);
        if (buildStatusMatch) {
            steps.push({
                type: 'build',
                name: buildStatusMatch[1],
                startTime: timestamp,
                endTime: timestamp,
                duration: 0,
                status: buildStatusMatch[2],
                messages: [line]
            });
        }
        
        // Add message to current step if available
        if (currentStep && line.trim() !== '') {
            currentStep.messages.push(line);
        }
        
        return currentStep;
    }
    
    function createFallbackSteps(logContent, steps) {
        // Look for common Jenkins patterns
        const checkoutPattern = /Checking out Revision/i;
        const compilingPattern = /(compiling|building|running)/i;
        const testingPattern = /(test|testing|junit|testcase)/i;
        
        // Determine overall build status from log content
        let overallStatus = 'SUCCESS';
        if (/Finished: FAILURE|BUILD FAILURE|FATAL ERROR|failed|exception occurred/i.test(logContent)) {
            overallStatus = 'FAILURE';
        } else if (/Finished: UNSTABLE|warnings|test failures/i.test(logContent)) {
            overallStatus = 'UNSTABLE';
        } else if (/Finished: ABORTED|Build was aborted/i.test(logContent)) {
            overallStatus = 'ABORTED';
        }
        
        let lastTs = new Date(); 
        
        // Scan for key stages
        if (logContent.match(checkoutPattern)) {
            steps.push({
                type: 'checkout',
                name: 'Source Code Checkout',
                startTime: lastTs,
                endTime: new Date(lastTs.getTime() + 10000),
                duration: 10000,
                status: 'SUCCESS', // Checkout usually succeeds even in failed builds
                messages: ['Detected source code checkout']
            });
            lastTs = new Date(lastTs.getTime() + 15000);
        }
        
        if (logContent.match(compilingPattern)) {
            steps.push({
                type: 'building',
                name: 'Compilation',
                startTime: lastTs,
                endTime: new Date(lastTs.getTime() + 20000),
                duration: 20000,
                status: overallStatus,
                messages: ['Detected build compilation']
            });
            lastTs = new Date(lastTs.getTime() + 25000);
        }
        
        if (logContent.match(testingPattern)) {
            steps.push({
                type: 'testing',
                name: 'Running Tests',
                startTime: lastTs,
                endTime: new Date(lastTs.getTime() + 15000),
                duration: 15000,
                status: overallStatus,
                messages: ['Detected test execution']
            });
        }
        
        // Add final build result step
        steps.push({
            type: 'result',
            name: 'Build Result',
            startTime: new Date(lastTs.getTime() + 20000),
            endTime: new Date(lastTs.getTime() + 21000),
            duration: 1000,
            status: overallStatus,
            messages: [`Build finished with status: ${overallStatus}`]
        });
    }
    function displayTimeline() {
        logDisplayArea.style.display = 'none';
        const timelineArea = document.getElementById('timeline-area');
        if (timelineArea) {
            timelineArea.style.display = 'block';
        }
        const buildSummaryArea = document.getElementById('build-summary-area');
        if (buildSummaryArea) {
            buildSummaryArea.style.display = 'none';
        }
        // If we already have log content, parse it for timeline
        if (logContentElement.textContent) {
            renderTimelineFromLogs(logContentElement.textContent);
        } else {
            // Need to fetch logs first
            fetchAndDisplayLogs().then(() => {
                renderTimelineFromLogs(logContentElement.textContent);
            });
        }
    }
    
    function renderTimelineFromLogs(logContent) {
        const steps = parseLogForTimeline(logContent);
        const timelineContent = document.getElementById('timeline-content');
        
        // If no steps were found
        if (!steps || steps.length === 0) {
            timelineContent.innerHTML = '<div class="alert alert-info">No timeline data could be extracted from the log.</div>';
            return;
        }
        
        // Build the timeline HTML
        const timelineHtml = document.createElement('div');
        timelineHtml.className = 'timeline';
        
        // Sort steps by start time
        steps.sort((a, b) => a.startTime - b.startTime);
        
        // Add timeline header
        const headerRow = document.createElement('div');
        headerRow.className = 'timeline-header row align-items-center';
        headerRow.innerHTML = `
            <div class="col-1">#</div>
            <div class="col-3">Time</div>
            <div class="col-5">Step</div>
            <div class="col-2">Duration</div>
            <div class="col-1">Status</div>
        `;
        timelineHtml.appendChild(headerRow);
        
        // Add each step to the timeline
        steps.forEach((step, index) => {
            const stepRow = document.createElement('div');
            stepRow.className = 'timeline-item row align-items-center';
            stepRow.dataset.stepIndex = index;
            
            // Format duration
            let durationText = 'N/A';
            if (step.duration) {
                const seconds = Math.floor(step.duration / 1000);
                if (seconds < 60) {
                    durationText = `${seconds}s`;
                } else {
                    const minutes = Math.floor(seconds / 60);
                    durationText = `${minutes}m ${seconds % 60}s`;
                }
            }
            
            // Determine status badge color
            let statusBadgeClass = 'bg-secondary';
            if (step.status === 'SUCCESS') {
                statusBadgeClass = 'bg-success';
            } else if (step.status === 'FAILURE') {
                statusBadgeClass = 'bg-danger';
            } else if (step.status === 'UNSTABLE') {
                statusBadgeClass = 'bg-warning';
            } else if (step.status === 'RUNNING') {
                statusBadgeClass = 'bg-info';
            }
            
            // Format the row content
            stepRow.innerHTML = `
                <div class="col-1">${index + 1}</div>
                <div class="col-3">${step.startTime.toLocaleTimeString()}</div>
                <div class="col-5">${step.name}</div>
                <div class="col-2">${durationText}</div>
                <div class="col-1"><span class="badge ${statusBadgeClass}">${step.status}</span></div>
            `;
            
            // Add click handler to show details
            attachStepClickHandler(stepRow, index);
            
            timelineHtml.appendChild(stepRow);
            
            // Add detail panel for this step
            const detailsPanel = document.createElement('div');
            detailsPanel.className = 'timeline-details';
            detailsPanel.dataset.stepIndex = index;
            detailsPanel.style.display = 'none';
            
            // Show the log messages for this step
            detailsPanel.innerHTML = `
                <div class="card">
                    <div class="card-header bg-light">
                        Step Details: ${step.name}
                    </div>
                    <div class="card-body">
                        <div class="row">
                            <div class="col-md-6">
                                <p><strong>Start:</strong> ${step.startTime.toLocaleString()}</p>
                                <p><strong>End:</strong> ${step.endTime.toLocaleString()}</p>
                            </div>
                            <div class="col-md-6">
                                <p><strong>Duration:</strong> ${durationText}</p>
                                <p><strong>Status:</strong> <span class="badge ${statusBadgeClass}">${step.status}</span></p>
                            </div>
                        </div>
                        <h6 class="mt-3">Log Messages:</h6>
                        <pre class="bg-dark text-light p-2 rounded" style="max-height: 200px; overflow-y: auto;">${step.messages.join('\n')}</pre>
                    </div>
                </div>
            `;
            
            timelineHtml.appendChild(detailsPanel);
        });
        
        // Add summary statistics
        const summaryPanel = document.createElement('div');
        summaryPanel.className = 'card mt-3';
        
        // Calculate total duration
        const totalDuration = steps.reduce((total, step) => total + (step.duration || 0), 0);
        const totalDurationText = formatDuration(totalDuration);
        
        // Count statuses
        const statusCounts = steps.reduce((counts, step) => {
            counts[step.status] = (counts[step.status] || 0) + 1;
            return counts;
        }, {});
        
        // Create status badges
        const statusBadges = Object.entries(statusCounts).map(([status, count]) => {
            let badgeClass = 'bg-secondary';
            if (status === 'SUCCESS') badgeClass = 'bg-success';
            if (status === 'FAILURE') badgeClass = 'bg-danger';
            if (status === 'UNSTABLE') badgeClass = 'bg-warning';
            if (status === 'RUNNING') badgeClass = 'bg-info';
            
            return `<span class="badge ${badgeClass} me-2">${status}: ${count}</span>`;
        }).join('');
        
        summaryPanel.innerHTML = `
            <div class="card-header bg-primary text-white">
                Execution Summary
            </div>
            <div class="card-body">
                <div class="row">
                    <div class="col-md-4">
                        <p><strong>Total Steps:</strong> ${steps.length}</p>
                    </div>
                    <div class="col-md-4">
                        <p><strong>Total Duration:</strong> ${totalDurationText}</p>
                    </div>
                    <div class="col-md-4">
                        <p><strong>Status Distribution:</strong></p>
                        <div>${statusBadges}</div>
                    </div>
                </div>
            </div>
        `;
        
        // Add the timeline and summary to the page
        timelineContent.innerHTML = '';
        timelineContent.appendChild(timelineHtml);
        timelineContent.appendChild(summaryPanel);
        
        // Add CSS for timeline
        if (!document.getElementById('timeline-styles')) {
            const style = document.createElement('style');
            style.id = 'timeline-styles';
            style.textContent = `
                .timeline {
                    border: 1px solid #dee2e6;
                    border-radius: 0.25rem;
                    overflow: hidden;
                    margin-bottom: 1rem;
                }
                .timeline-header {
                    font-weight: bold;
                    background-color: #f8f9fa;
                    padding: 0.75rem;
                    border-bottom: 1px solid #dee2e6;
                }
                .timeline-item {
                    padding: 0.75rem;
                    border-bottom: 1px solid #dee2e6;
                    cursor: pointer;
                }
                .timeline-item:hover {
                    background-color: rgba(0,0,0,0.05);
                }
                .timeline-details {
                    padding: 0 0.75rem 0.75rem 0.75rem;
                    background-color: #f8f9fa;
                    border-bottom: 1px solid #dee2e6;
                }
            `;
            document.head.appendChild(style);
        }
    }
    function attachStepClickHandler(stepRow, index) {
        stepRow.addEventListener('click', () => {
            const detailsElement = document.querySelector(`.timeline-details[data-step-index="${index}"]`);
            const allDetails = document.querySelectorAll('.timeline-details');
            
            // Hide all other details
            allDetails.forEach(el => {
                if (el !== detailsElement) {
                    el.style.display = 'none';
                }
            });
            
            // Toggle this detail
            if (detailsElement) {
                detailsElement.style.display = detailsElement.style.display === 'none' ? 'block' : 'none';
            }
        });
    }
    // --- Event Listeners ---
    const refreshDashboardBtn = getElement('refresh-dashboard');
    if (refreshDashboardBtn) {
        refreshDashboardBtn.addEventListener('click', function() {
            loadDashboard();
        });
    }
    // Use event delegation for job list clicks
    document.addEventListener('click', (event) => {
        const jobList = getElement('job-list');
        const jobDetailsArea = getElement('job-details-area'); 
        const logDisplayArea = getElement('log-display'); 
        const selectedJobTitle = getElement('selected-job-title'); 

        if (!jobList || !jobDetailsArea || !logDisplayArea || !selectedJobTitle) {
            console.error("One or more required UI elements (job-list, job-details-area, log-display, selected-job-title) not found.");
            return; // Exit if essential elements are missing
        }
        
        // Check if the clicked element is a job item and is inside the job-list
        if (event.target && event.target.matches('.list-group-item') && 
            event.target.closest('#job-list')) {
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
                    const timelineArea = document.getElementById('timeline-area');
                    if (timelineArea) {
                        timelineArea.style.display = 'none';
                    }
                    
                    // Fetch the latest build info (which enables the log button on success)
                    fetchLatestBuildInfo(jobFullName);
                } else {
                    console.error("Clicked job item is missing the 'data-job-full-name' attribute.");
                    showError("Internal error: Could not identify the selected job.", 'job-list');
                }
            }
        });
    }
    
    const fetchLogsBtn = getElement('fetch-logs-btn');
    if (fetchLogsBtn) {
        fetchLogsBtn.addEventListener('click', () => {
            if (latestBuildUrl) {
                fetchAndDisplayLogs();
            } else {
                showError("Build information (including log URL) has not been loaded.", 'log');
            }
        });
    }
    const viewTimelineBtn = getElement('view-timeline-btn');
    if (viewTimelineBtn) {
        viewTimelineBtn.addEventListener('click', () => {
            if (latestBuildUrl) {
                displayTimeline();
            } else {
                showError("Build information has not been loaded.", 'build');
            }
        });
    }
    // Build Summary Button Event Listener
    const buildSummaryBtn = getElement('build-summary-btn');
    if (buildSummaryBtn) {
        buildSummaryBtn.addEventListener('click', () => {
            if (latestBuildUrl) {
                // This function is defined in buildSummary.js
                showBuildSummary();
            } else {
                showError("Build information has not been loaded.", 'build');
            }
        });
    }
    // Create 24-hour execution time graph with build status indicators
    function create24HourExecutionGraph(builds) {
        try {
            // Get canvas element
            const canvas = document.getElementById('executionTimeChart');
            if (!canvas) {
                console.error('Execution time chart canvas element not found');
                return;
            }
            
            // Destroy existing chart instance if it exists
            if (executionTimeChartInstance) {
                executionTimeChartInstance.destroy();
                executionTimeChartInstance = null;
            }
            
            // Recreate canvas to avoid chart reuse errors
            const chartContainer = canvas.parentNode;
            chartContainer.innerHTML = '';
            const newCanvas = document.createElement('canvas');
            newCanvas.id = 'executionTimeChart';
            chartContainer.appendChild(newCanvas);
            
            // Get fresh canvas reference
            const freshCanvas = document.getElementById('executionTimeChart');
        
        // Filter builds from the last 24 hours
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const recentBuilds = builds.filter(build => build.timestamp >= oneDayAgo);
        
        if (recentBuilds.length === 0) {
            const container = document.getElementById('execution-time-container');
            if (container) {
                container.innerHTML = '<div class="alert alert-info">No builds in the last 24 hours</div>';
            }
            return;
        }
        
            // Prepare data for the chart
            const data = recentBuilds.map(build => {
                return {
                    x: new Date(build.timestamp),
                    y: Math.floor(build.duration / 1000 / 60), // Convert to minutes
                    status: build.result || 'IN_PROGRESS'
                };
            });
            
            // Sort by timestamp
            data.sort((a, b) => a.x - b.x);
            
            // Create chart
            const ctx = freshCanvas.getContext('2d');
            executionTimeChartInstance = new Chart(ctx, {
                type: 'scatter',
                data: {
                    datasets: [{
                        label: 'Build Duration (minutes)',
                        data: data,
                        pointBackgroundColor: function(context) {
                            const status = context.raw?.status;
                            // Color code by build status
                            switch(status) {
                                case 'SUCCESS': return 'rgba(75, 192, 75, 1)'; // Green
                                case 'FAILURE': return 'rgba(255, 99, 132, 1)'; // Red
                                case 'UNSTABLE': return 'rgba(255, 205, 86, 1)'; // Yellow
                                case 'ABORTED': return 'rgba(201, 203, 207, 1)'; // Grey
                                default: return 'rgba(54, 162, 235, 1)'; // Blue (in progress)
                            }
                        },
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Build Execution Times (Last 24 Hours)',
                            font: {
                                size: 16
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const data = context.raw;
                                    const timeString = new Date(data.x).toLocaleTimeString();
                                    const duration = data.y;
                                    const status = data.status;
                                    return [
                                        `Time: ${timeString}`,
                                        `Duration: ${duration} minutes`,
                                        `Status: ${status}`
                                    ];
                                }
                            }
                        },
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            type: 'time',
                            time: {
                                unit: 'hour',
                                displayFormats: {
                                    hour: 'HH:mm'
                                }
                            },
                            title: {
                                display: true,
                                text: 'Time'
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Duration (minutes)'
                            },
                            beginAtZero: true
                        }
                    }
                }
            });
            
            // Add legend for status colors
            const container = document.getElementById('execution-time-container');
            if (container) {
                const legendHtml = `
                    <div class="status-legend">
                        <span class="badge bg-success">Success</span>
                        <span class="badge bg-danger">Failure</span>
                        <span class="badge bg-warning">Unstable</span>
                        <span class="badge bg-secondary">Aborted</span>
                        <span class="badge bg-primary">In Progress</span>
                    </div>
                `;
                
                // Check if legend already exists
                const existingLegend = container.querySelector('.status-legend');
                if (!existingLegend) {
                    const legendDiv = document.createElement('div');
                    legendDiv.innerHTML = legendHtml;
                    container.appendChild(legendDiv);
                }
            }
        } catch (error) {
            console.error('Error creating 24-hour execution graph:', error);
            const container = document.getElementById('execution-time-container');
            if (container) {
                container.innerHTML = '<div class="alert alert-danger">Error creating chart: ' + error.message + '</div>';
            }
        }
    }
    
    // --- Initialize ---
    function initializeApp() {
        console.log('[DEBUG] Initializing app...');
        
        // Check if we're on the dashboard page and load data
        const jobList = getElement('job-list');
        const jobListError = getElement('job-list-error');
        if (jobList && jobListError) {
            loadDashboard();
        }
        
        console.log('[DEBUG] App Initialized.');
    }
    // Start the app
    initializeApp();
}); // Close window.addEventListener('load')
