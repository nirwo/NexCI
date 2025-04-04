// --- Timeline Functions ---

// Main function to display the timeline, called automatically after build info is fetched
async function fetchAndDisplayTimeline() {
    const timelineArea = getElement('timeline-area');
    const timelineContent = getElement('timeline-content');
    const timelineLoadingIndicator = getElement('timeline-loading-indicator'); // Assuming an indicator exists
    const timelineErrorOutput = getElement('timeline-error'); // Assuming an error element exists

    if (!timelineArea || !timelineContent || !timelineLoadingIndicator || !timelineErrorOutput) {
        console.error("Timeline UI elements (area, content, loader, error) not found.");
        return;
    }

    if (!latestBuildUrl) {
        console.warn('[Timeline] latestBuildUrl not set. Cannot fetch timeline data.');
        showError('Build URL not available for timeline.', 'timeline');
        timelineArea.style.display = 'none';
        return;
    }

    console.log('[DEBUG Timeline] Starting timeline generation.');
    timelineLoadingIndicator.style.display = 'inline-block';
    timelineErrorOutput.style.display = 'none';
    timelineContent.innerHTML = ''; // Clear previous content
    timelineArea.style.display = 'block'; // Show area with loader

    try {
        // Fetch log text specifically for the timeline
        // Use the backend proxy route
        const proxyLogUrl = `/api/proxy/log?build_url=${encodeURIComponent(latestBuildUrl)}`;
        console.log(`[DEBUG Timeline] Fetching log via proxy: ${proxyLogUrl}`);
        const response = await fetch(proxyLogUrl);

        if (!response.ok) {
            // Attempt to read error from proxy response
            let errorDetail = await response.text();
            try { // Check if it's JSON
                const errorJson = JSON.parse(errorDetail);
                if (errorJson.error) {
                    errorDetail = errorJson.error;
                }
            } catch (e) { /* Ignore if not JSON */ }

            throw new Error(`Failed to fetch log for timeline via proxy: ${response.status} ${response.statusText}. Detail: ${errorDetail}`);
        }
        const logText = await response.text();

        if (!logText) {
            throw new Error('Fetched log text is empty.');
        }

        console.log("[DEBUG Timeline] Generating timeline from fetched log content...");
        const timelineSteps = parsePipelineSteps(logText);
        console.log("[DEBUG Timeline] Parsed timeline steps:", timelineSteps);
        displayTimeline(timelineSteps);

    } catch (error) {
        console.error("Error generating timeline:", error);
        showError(`Failed to generate timeline: ${error.message}`, 'timeline');
        // Keep timeline area visible to show the error message
    } finally {
        timelineLoadingIndicator.style.display = 'none';
    }
}

// Extract timestamp from log line if available
function extractTimestamp(logLine) {
    // Common timestamp patterns in Jenkins logs
    const patterns = [
        /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d+Z)\]/, // ISO format
        /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/, // Common Jenkins format
        /^(\d{2}:\d{2}:\d{2})/, // Simple time format (HH:MM:SS)
        /(\d{2}:\d{2}:\d{2}\.\d+)/, // Time with milliseconds
        /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+)/ // Timestamp with comma separator
    ];

    for (const pattern of patterns) {
        const match = logLine.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

// Parse pipeline steps with more detailed timing information
function parsePipelineSteps(logContent) {
    const lines = logContent.split('\n');
    const steps = [];
    let currentStage = null;
    let currentStart = null;
    let currentStep = null;
    let stageStartTime = null;
    let lineIndex = 0;

    for (const line of lines) {
        lineIndex++;
        const timestamp = extractTimestamp(line) || `Line ${lineIndex}`;
        
        // Start of stage
        if (line.includes('[Pipeline]') && line.includes('stage')) {
            const stageMatch = line.match(/\[Pipeline\] stage \(?([^)]+)\)?/);
            
            if (stageMatch && stageMatch[1]) {
                // If we had a previous stage, close it
                if (currentStage) {
                    steps.push({
                        name: currentStage,
                        type: 'stage',
                        start: stageStartTime || 'unknown',
                        end: timestamp,
                        status: 'completed',
                        details: `Stage completed at ${timestamp}`
                    });
                }
                
                currentStage = stageMatch[1].trim();
                stageStartTime = timestamp;
                
                steps.push({
                    name: currentStage,
                    type: 'stage',
                    start: timestamp,
                    status: 'started',
                    details: `Stage started at ${timestamp}`
                });
            }
        }
        
        // Detect steps within stages
        if (line.includes('[Pipeline]') && !line.includes('stage')) {
            const stepMatch = line.match(/\[Pipeline\] ([^(]+)(\([^)]*\))?/);
            if (stepMatch && stepMatch[1]) {
                const stepName = stepMatch[1].trim();
                
                // If this is a new step, add it
                if (stepName !== currentStep) {
                    currentStep = stepName;
                    steps.push({
                        name: `${currentStage || 'Unknown'} - ${currentStep}`,
                        type: 'step',
                        start: timestamp,
                        parent: currentStage,
                        status: 'running',
                        details: `Step started at ${timestamp}`
                    });
                }
            }
        }
        
        // Detect errors
        if (line.includes('ERROR:') || line.includes('FAILED:') || line.includes('Finished: FAILURE')) {
            steps.push({
                name: currentStep ? `Error in ${currentStep}` : 'Build Error',
                type: 'error',
                time: timestamp,
                details: line.trim(),
                status: 'error'
            });
        }
        
        // Detect successful completion messages
        if (line.includes('Finished: SUCCESS') || line.includes('BUILD SUCCESS')) {
            steps.push({
                name: 'Build Completed',
                type: 'completion',
                time: timestamp,
                details: line.trim(),
                status: 'success'
            });
        }
    }
    
    return steps;
}

// Display the execution timeline with enhanced timing details
function displayTimeline(steps) {
    const timelineContainer = document.getElementById('timeline-content');
    if (!timelineContainer) {
        console.error('Timeline container not found');
        return;
    }
    
    // Sort steps by start time if available
    steps.sort((a, b) => {
        if (a.start && b.start) {
            return a.start.localeCompare(b.start);
        }
        return 0;
    });
    
    let html = '<div class="timeline">';
    
    steps.forEach((step, index) => {
        const statusClass = step.status === 'error' ? 'text-danger' : 
                           step.status === 'success' ? 'text-success' : 
                           'text-primary';
        
        const icon = step.status === 'error' ? 'fa-times-circle' : 
                    step.status === 'success' ? 'fa-check-circle' : 
                    step.type === 'stage' ? 'fa-play-circle' : 'fa-cog';
        
        html += `
            <div class="timeline-item">
                <div class="timeline-badge ${statusClass}">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="timeline-panel">
                    <div class="timeline-heading">
                        <h6 class="timeline-title ${statusClass}">${step.name}</h6>
                        <p class="text-muted">
                            <small>
                                <i class="fas fa-clock"></i> 
                                ${step.start ? `Started: ${step.start}` : ''}
                                ${step.end ? ` | Ended: ${step.end}` : ''}
                                ${step.time ? `Time: ${step.time}` : ''}
                            </small>
                        </p>
                    </div>
                    <div class="timeline-body">
                        <p>${step.details || ''}</p>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    timelineContainer.innerHTML = html;
}
