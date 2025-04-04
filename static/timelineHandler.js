// --- Timeline Functions ---

// Function to fetch and display the execution timeline
async function fetchAndDisplayTimeline() {
    const timelineArea = getElement('timeline-area');
    const timelineLoadingIndicator = getElement('timeline-loading-indicator');
    const timelineError = getElement('timeline-error');

    if (!timelineArea || !timelineLoadingIndicator || !timelineError) {
        console.error("Required timeline UI elements not found.");
        return;
    }

    // Set loading state
    timelineArea.style.display = 'block';
    timelineLoadingIndicator.style.display = 'inline-block';
    timelineError.style.display = 'none';

    if (!latestBuildUrl) {
        showError("No build selected or latest build URL is missing.", 'timeline');
        timelineLoadingIndicator.style.display = 'none';
        return;
    }

    try {
        // Use the proxy route to get build log content
        const proxyLogUrl = `/api/proxy/log?build_url=${encodeURIComponent(latestBuildUrl)}`;
        console.log(`[DEBUG Timeline] Fetching log for timeline via proxy: ${proxyLogUrl}`);
        const response = await fetch(proxyLogUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
        }

        const logText = await response.text();
        if (!logText || logText.length === 0) {
            showError("Log content is empty. Cannot generate timeline.", 'timeline');
            timelineLoadingIndicator.style.display = 'none';
            return;
        }

        console.log("[DEBUG Timeline] Generating timeline from fetched log content...");
        const timelineSteps = await enhancedParsePipelineSteps(logText);
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
        /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+)/, // Timestamp with comma separator
        /(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/ // Date with slashes format
    ];

    for (const pattern of patterns) {
        const match = logLine.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

// Enhanced pipeline step parsing with LLM-like techniques
async function enhancedParsePipelineSteps(logContent) {
    // First get basic steps with our existing parser
    const basicSteps = parsePipelineSteps(logContent);
    
    // Apply heuristic enhancement to interpret unknown steps
    const enhancedSteps = improveTimelineSteps(basicSteps, logContent);
    
    return enhancedSteps;
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

// Apply LLM-like heuristics to improve the timeline steps
function improveTimelineSteps(steps, logContent) {
    if (!steps || !steps.length) {
        console.log("No steps to enhance");
        return [];
    }

    const enhancedSteps = [...steps]; // Make a copy to not modify the original
    const lines = logContent ? logContent.split('\n') : [];
    
    // Patterns that help identify build actions
    const actionPatterns = [
        { regex: /Executing (.+) task/i, type: 'task' },
        { regex: /Running command: (.+)/i, type: 'command' },
        { regex: /Cloning repository (.+)/i, type: 'git' },
        { regex: /Checking out (.+)/i, type: 'git' },
        { regex: /Installing (.+)/i, type: 'installation' },
        { regex: /Downloading (.+)/i, type: 'download' },
        { regex: /maven|gradle|npm|yarn|pip/i, type: 'build-tool' },
        { regex: /test|junit|pytest|mocha/i, type: 'testing' },
        { regex: /deploy|publish|upload/i, type: 'deployment' }
    ];
    
    // Find stages with 'Unknown' in their name and try to improve them
    for (let i = 0; i < enhancedSteps.length; i++) {
        const step = enhancedSteps[i];
        
        // If step name includes 'Unknown', try to infer better name
        if (step && step.name && typeof step.name === 'string' && 
            (step.name.includes('Unknown') || 
             !step.details || 
             (step.details && typeof step.details === 'string' && step.details.includes('unknown')))) {
            
            // Find the line index of the timestamp in the log
            let relevantLines = [];
            const timestampIndex = getLineIndexByTimestamp(lines, step.start);
            
            if (timestampIndex !== -1) {
                // Get a context of lines before and after the timestamp
                const contextSize = 5;
                const startIdx = Math.max(0, timestampIndex - contextSize);
                const endIdx = Math.min(lines.length, timestampIndex + contextSize);
                relevantLines = lines.slice(startIdx, endIdx);
                
                // Try to extract meaningful information from the context
                let inferredInfo = inferStepInformation(relevantLines, actionPatterns);
                
                if (inferredInfo) {
                    // Update the step with inferred information
                    if (step.name.includes('Unknown') && inferredInfo.name) {
                        step.name = step.name.replace('Unknown', inferredInfo.name);
                    }
                    
                    if ((!step.details || (step.details && typeof step.details === 'string' && step.details.includes('unknown'))) && inferredInfo.details) {
                        step.details = inferredInfo.details;
                    }
                    
                    // Add the inferred type if we have one
                    if (inferredInfo.type) {
                        step.actionType = inferredInfo.type;
                    }
                }
            }
        }
    }
    
    // Add missing timestamps where possible by interpolation
    interpolateTimestamps(enhancedSteps);
    
    return enhancedSteps;
}

// Get the line index in the log that corresponds to a timestamp
function getLineIndexByTimestamp(lines, timestamp) {
    if (!timestamp || (typeof timestamp === 'string' && timestamp.includes('Line'))) {
        // If timestamp is already a line index (like "Line 123")
        if (typeof timestamp === 'string') {
            const lineMatch = timestamp.match(/Line (\d+)/);
            if (lineMatch && lineMatch[1]) {
                return parseInt(lineMatch[1], 10) - 1; // Convert to 0-based index
            }
        }
        return -1;
    }
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i] && typeof lines[i] === 'string' && lines[i].includes(timestamp)) {
            return i;
        }
    }
    return -1;
}

// Infer information about a step from relevant log lines
function inferStepInformation(lines, patterns) {
    if (!lines || !lines.length) return null;
    
    // Join lines to analyze as a single text
    const text = lines.join(' ');
    
    // Try each pattern to see if we can extract information
    for (const pattern of patterns) {
        const match = text.match(pattern.regex);
        if (match) {
            return {
                name: match[1] ? cleanupName(match[1]) : pattern.type.charAt(0).toUpperCase() + pattern.type.slice(1),
                details: match[0],
                type: pattern.type
            };
        }
    }
    
    // If no specific pattern matched, try to extract command or step name
    const commandMatch = text.match(/\b(npm|yarn|gradle|mvn|python|java|docker|git|sh)\b.*?(?=\n|$)/i);
    if (commandMatch) {
        return {
            name: commandMatch[1].charAt(0).toUpperCase() + commandMatch[1].slice(1),
            details: commandMatch[0],
            type: 'command'
        };
    }
    
    // Check for common build actions
    if (text.includes('test')) {
        return { name: 'Testing', details: 'Running tests', type: 'testing' };
    }
    if (text.includes('build')) {
        return { name: 'Build', details: 'Building application', type: 'build' };
    }
    if (text.includes('deploy')) {
        return { name: 'Deployment', details: 'Deploying application', type: 'deployment' };
    }
    
    return null;
}

// Clean up extracted names to make them more readable
function cleanupName(name) {
    // Truncate if too long
    if (name.length > 30) {
        name = name.substring(0, 27) + '...';
    }
    
    // Capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
}

// Interpolate missing timestamps between steps
function interpolateTimestamps(steps) {
    if (!steps || !steps.length) return steps;
    
    for (let i = 0; i < steps.length; i++) {
        // If this step has an unknown timestamp but surrounding steps have valid ones
        if (steps[i] && steps[i].start && 
            ((typeof steps[i].start === 'string' && 
             (steps[i].start === 'unknown' || steps[i].start.includes('Line'))) && 
             i > 0 && i < steps.length - 1)) {
            
            // Find the previous and next steps with valid timestamps
            let prevStep = null;
            let nextStep = null;
            
            for (let j = i - 1; j >= 0; j--) {
                if (steps[j] && steps[j].start && 
                    typeof steps[j].start === 'string' && 
                    !steps[j].start.includes('unknown') && 
                    !steps[j].start.includes('Line')) {
                    prevStep = steps[j];
                    break;
                }
            }
            
            for (let j = i + 1; j < steps.length; j++) {
                if (steps[j] && steps[j].start && 
                    typeof steps[j].start === 'string' && 
                    !steps[j].start.includes('unknown') && 
                    !steps[j].start.includes('Line')) {
                    nextStep = steps[j];
                    break;
                }
            }
            
            // If we have both prev and next timestamps, interpolate
            if (prevStep && nextStep && prevStep.start && nextStep.start) {
                try {
                    const prevTime = new Date(prevStep.start);
                    const nextTime = new Date(nextStep.start);
                    
                    if (!isNaN(prevTime) && !isNaN(nextTime)) {
                        const timeDiff = nextTime - prevTime;
                        const stepCount = nextStep.index - prevStep.index;
                        const timeStep = timeDiff / stepCount;
                        
                        const interpolatedTime = new Date(prevTime.getTime() + timeStep * (i - prevStep.index));
                        steps[i].start = interpolatedTime.toISOString();
                        steps[i].details = `${steps[i].details || 'Step'} (interpolated time)`;
                    }
                } catch (e) {
                    // Skip interpolation if dates can't be parsed
                    console.log("Could not interpolate timestamp:", e);
                }
            }
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
    
    if (!steps || !steps.length) {
        timelineContainer.innerHTML = '<div class="alert alert-info">No timeline data available</div>';
        return;
    }
    
    // Sort steps by start time if available
    steps.sort((a, b) => {
        if (a && b && a.start && b.start) {
            return a.start.localeCompare(b.start);
        }
        return 0;
    });
    
    // Create the timeline HTML
    let timelineHTML = '<ul class="timeline">';
    
    steps.forEach((step, index) => {
        if (!step) return;
        
        // Assign index for interpolation purposes
        step.index = index;
        
        // Determine icon class based on step type
        let iconClass = '';
        let badgeClass = '';
        
        switch (step.type) {
            case 'stage':
                iconClass = 'fa-map-marker-alt';
                badgeClass = 'text-primary';
                break;
            case 'step':
                iconClass = 'fa-arrow-right';
                badgeClass = step.actionType === 'error' ? 'text-danger' : '';
                break;
            case 'error':
                iconClass = 'fa-times-circle';
                badgeClass = 'text-danger';
                break;
            case 'completion':
                iconClass = 'fa-check-circle';
                badgeClass = 'text-success';
                break;
            default:
                iconClass = 'fa-circle';
        }
        
        // Format the time display
        let timeDisplay = '';
        if (step.start && typeof step.start === 'string' && 
            !step.start.includes('unknown') && !step.start.includes('Line')) {
            timeDisplay = `<span class="timeline-time">${formatTimeDisplay(step.start)}</span>`;
        } else if (step.time && typeof step.time === 'string' && 
                 !step.time.includes('unknown') && !step.time.includes('Line')) {
            timeDisplay = `<span class="timeline-time">${formatTimeDisplay(step.time)}</span>`;
        }
        
        // Create the timeline item with the enhanced details
        timelineHTML += `
            <li class="timeline-item">
                <div class="timeline-badge ${badgeClass}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="timeline-panel">
                    <div class="timeline-heading">
                        <h6>${step.name || 'Unknown step'} ${timeDisplay}</h6>
                    </div>
                    <div class="timeline-body">
                        <p>${step.details || ''}</p>
                    </div>
                </div>
            </li>
        `;
    });
    
    timelineHTML += '</ul>';
    timelineContainer.innerHTML = timelineHTML;
}

// Format time for display in the timeline
function formatTimeDisplay(timestamp) {
    if (!timestamp) return '';
    
    try {
        // Try to parse as ISO date first
        const date = new Date(timestamp);
        if (!isNaN(date)) {
            // If it's a valid date, format it
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
    } catch (e) {
        // Skip formatting if dates can't be parsed
    }
    
    // For simple time formats like HH:MM:SS, return as is
    return timestamp;
}
