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

        console.log("[DEBUG Timeline] Fetched log length:", logText ? logText.length : 0);

        console.log("[DEBUG Timeline] === Starting Basic Parsing ===");
        const basicSteps = parsePipelineSteps(logText);
        console.log("[DEBUG Timeline] === Finished Basic Parsing === Raw Steps:", JSON.parse(JSON.stringify(basicSteps)));

        console.log("[DEBUG Timeline] === Starting Step Enhancement ===");
        const timelineSteps = await improveTimelineSteps(basicSteps, logText); // Keep await if enhance becomes async
        console.log("[DEBUG Timeline] === Finished Step Enhancement === Final Steps:", JSON.parse(JSON.stringify(timelineSteps)));

        console.log("[DEBUG Timeline] === Starting Display Timeline ===");
        displayTimeline(timelineSteps);
        console.log("[DEBUG Timeline] === Finished Display Timeline ===");

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
async function improveTimelineSteps(steps, logContent) { // Make async if needed for future API calls
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
            (step.name.includes('Unknown') || step.name.match(/^\/\/.+/) || step.name.length < 5)) { 
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
                    // Only update if the name seems generic or placeholder-like
                    if (inferredInfo.name && inferredInfo.name.length > 1) { // Ensure name isn't just a character
                        step.name = inferredInfo.name;
                    }
                    
                    // Always try to update details if inferred details are better
                    if (inferredInfo.details) {
                        // Check if existing details are just the initial line(s)
                        let existingDetails = Array.isArray(step.details) ? step.details.join('\n') : (step.details || '');
                        if (!existingDetails || existingDetails.length < 50) { // Update if short/generic
                            step.details = inferredInfo.details;
                        }
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
    console.log("[DEBUG Timeline] Steps after interpolation:", JSON.parse(JSON.stringify(enhancedSteps)));
    
    return enhancedSteps;
}

// Parse pipeline steps with improved grouping and step detection
function parsePipelineSteps(logContent) {
    const lines = logContent.split('\n');
    const steps = [];
    let currentStage = null;
    let stageStartTime = null;
    let currentStep = null;
    let currentStepDetails = []; // Collect lines for the current step
    let lastTimestamp = 'unknown';
    let lineIndex = 0;

    const meaningfulStepIndicators = [
        /^\[Pipeline\] (sh|bat|powershell|echo|error|input|timeout|retry|node|agent)/,
        /^\[Pipeline\] \/\/(.+)/, // End of block
        /^[\w\s]+:/, // Labels like 'Checking out GitSCM'
        /^ > git/ // Git commands often start like this
    ];

    for (const line of lines) {
        lineIndex++;
        const timestamp = extractTimestamp(line) || lastTimestamp;
        if (timestamp !== `Line ${lineIndex}`) lastTimestamp = timestamp;
        
        const trimmedLine = line.trim();
        if (!trimmedLine) continue; // Skip empty lines

        // Start of stage
        if (trimmedLine.includes('[Pipeline] stage')) {
            const stageMatch = trimmedLine.match(/\[Pipeline\] stage (?:Starting\s)?\(?([^)]+)\)?/);
            if (stageMatch && stageMatch[1]) {
                // Finish previous step/stage if any
                finishCurrentStep(steps, currentStep, currentStepDetails, timestamp);
                finishCurrentStage(steps, currentStage, stageStartTime, timestamp);
                currentStep = null;
                currentStepDetails = [];
                
                currentStage = stageMatch[1].trim();
                stageStartTime = timestamp;
                
                steps.push({
                    name: `Stage: ${currentStage}`,
                    type: 'stage_start',
                    start: timestamp,
                    status: 'started',
                    details: `Stage \"${currentStage}\" started at ${timestamp}`
                });
                continue; // Move to next line after handling stage start
            }
        }

        // End of stage (often marked by // stage)
        if (trimmedLine.match(/^\[Pipeline\] \/\/ stage/)) {
            finishCurrentStep(steps, currentStep, currentStepDetails, timestamp);
            finishCurrentStage(steps, currentStage, stageStartTime, timestamp);
            currentStage = null;
            currentStep = null;
            currentStepDetails = [];
            continue;
        }

        // Detect significant steps
        let isNewStep = false;
        let stepName = null;
        for (const indicator of meaningfulStepIndicators) {
            const match = trimmedLine.match(indicator);
            if (match) {
                isNewStep = true;
                stepName = match[1] ? match[1].trim() : indicator.toString(); // Basic name
                break;
            }
        }

        // If it looks like a new step command
        if (isNewStep && stepName !== currentStep) {
            finishCurrentStep(steps, currentStep, currentStepDetails, timestamp);
            currentStep = stepName;
            steps.push({
                name: stepName, 
                type: 'step',
                start: timestamp,
                parent: currentStage,
                status: 'running',
                details: [trimmedLine] // Start details with this line
            });
            currentStepDetails = [trimmedLine]; 
        } else if (currentStep) {
            // Add line to current step's details
            currentStepDetails.push(trimmedLine);
            const lastStep = steps[steps.length - 1];
            if (lastStep && lastStep.type === 'step' && lastStep.name === currentStep) {
                lastStep.details = currentStepDetails; // Update details in the step object
            }
        }
        
        // --- Error and Completion Detection --- 
        // (Keep these as separate events, potentially closing the current step)
        if (trimmedLine.includes('ERROR:') || trimmedLine.includes('FAILED:') || trimmedLine.includes('Finished: FAILURE')) {
            finishCurrentStep(steps, currentStep, currentStepDetails, timestamp);
            currentStep = null; // Error terminates the current step
            steps.push({
                name: currentStep ? `Error in ${currentStep}` : 'Build Error',
                type: 'error',
                time: timestamp,
                details: [trimmedLine],
                status: 'error'
            });
        } else if (trimmedLine.includes('Finished: SUCCESS') || trimmedLine.includes('BUILD SUCCESS')) {
            finishCurrentStep(steps, currentStep, currentStepDetails, timestamp);
            finishCurrentStage(steps, currentStage, stageStartTime, timestamp);
            currentStep = null;
            currentStage = null;
            steps.push({
                name: 'Build Completed Successfully',
                type: 'completion_success',
                time: timestamp,
                details: [trimmedLine],
                status: 'success'
            });
        }
    }
    
    // Finish any dangling step or stage at the end of the log
    finishCurrentStep(steps, currentStep, currentStepDetails, lastTimestamp);
    finishCurrentStage(steps, currentStage, stageStartTime, lastTimestamp);

    console.log("[DEBUG Timeline] Raw parsed steps (before return):", JSON.parse(JSON.stringify(steps))); // Deep copy for logging
    return steps;
}

// Helper to finalize the current step
function finishCurrentStep(steps, stepName, stepDetails, endTime) {
    if (!stepName) return;
    const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
    // Find the actual start step object if it exists
    const startStep = steps.find(s => s.type === 'step' && s.name === stepName && !s.end);

    if (startStep) {
        startStep.end = endTime;
        startStep.details = stepDetails.join('\n'); // Consolidate details
        startStep.status = 'completed'; // Mark as completed
    } else if (lastStep && lastStep.name === stepName && lastStep.type === 'step') {
        // Fallback if the start step wasn't found correctly (shouldn't happen often)
        lastStep.end = endTime;
        lastStep.details = stepDetails.join('\n');
        lastStep.status = 'completed';
    }
}

// Helper to finalize the current stage
function finishCurrentStage(steps, stageName, startTime, endTime) {
    if (!stageName) return;
    // Find the stage_start event
    const startStage = steps.find(s => s.type === 'stage_start' && s.name === `Stage: ${stageName}` && !s.end);
    
    if (startStage) {
        startStage.end = endTime; 
        steps.push({ // Add a specific stage end event
            name: `Stage: ${stageName}`,
            type: 'stage_end',
            start: startTime, // Keep original start time
            end: endTime,
            status: 'completed',
            details: `Stage \"${stageName}\" finished at ${endTime}`
        });
    } else {
         console.warn(`Could not find start event for stage: ${stageName} to mark end.`);
    }
}

// Get the line index in the log that corresponds to a timestamp
function getLineIndexByTimestamp(lines, timestamp) {
    if (!timestamp || (typeof timestamp === 'string' && timestamp.includes('Line'))) {
        // If timestamp is already a line index (like "Line 123")
        if (typeof timestamp === 'string') {
            const lineMatch = timestamp.match(/Line (\d+)/);
            if (lineMatch && lineMatch[1]) {
                // Ensure the matched line number is within bounds
                const index = parseInt(lineMatch[1], 10) - 1; // Convert to 0-based index
                return (index >= 0 && lines && index < lines.length) ? index : -1;
            }
        }
        return -1;
    }
    
    // Handle potential Date objects from interpolation
    if (timestamp instanceof Date) {
        timestamp = timestamp.toISOString(); 
    }

    if (typeof timestamp !== 'string') return -1; // Cannot search if not a string

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
    const text = lines.map(l => String(l || '')).join(' \n '); // Ensure lines are strings
    
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
    const commandMatch = text.match(/\b(npm|yarn|gradle|mvn|python|java|docker|git|sh|cmake|make)\b.*?(?=\n|$)/i);
    if (commandMatch && commandMatch[0].trim().length > 3) { // Ensure command is not trivial
        return {
            name: commandMatch[1].charAt(0).toUpperCase() + commandMatch[1].slice(1),
            details: commandMatch[0].trim(),
            type: 'command'
        };
    }
    
    // Check for common build actions if text is substantial
    if (text.length > 10) { 
        if (text.match(/test(s|ing)? conducted|running tests/i)) {
            return { name: 'Testing', details: 'Running tests', type: 'testing' };
        }
        if (text.match(/building application|compilation complete/i)) {
            return { name: 'Build', details: 'Building application', type: 'build' };
        }
        if (text.match(/deploy(ing|ment)|publishing artifact/i)) {
            return { name: 'Deployment', details: 'Deploying application', type: 'deployment' };
        }
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
    
    console.log("[DEBUG Timeline] Final steps passed to displayTimeline:", JSON.parse(JSON.stringify(steps))); // Log steps before sorting/display

    // Sort steps by start time if available
    steps.sort((a, b) => {
        try {
            // Prioritize start time, fallback to time if start is missing
            const timeA = a.start && !String(a.start).includes('Line') ? new Date(a.start) : (a.time && !String(a.time).includes('Line') ? new Date(a.time) : null);
            const timeB = b.start && !String(b.start).includes('Line') ? new Date(b.start) : (b.time && !String(b.time).includes('Line') ? new Date(b.time) : null);

            if (timeA instanceof Date && !isNaN(timeA) && timeB instanceof Date && !isNaN(timeB)) {
                return timeA - timeB;
            } else if (timeA instanceof Date && !isNaN(timeA)) {
                return -1; // Place valid dates first
            } else if (timeB instanceof Date && !isNaN(timeB)) {
                return 1;
            } else {
                // Fallback to comparing raw strings if dates are invalid/missing
                const rawA = a.start || a.time || '';
                const rawB = b.start || b.time || '';
                return String(rawA).localeCompare(String(rawB));
            }
        } catch (e) {
            console.warn("Error comparing step timestamps:", a, b, e);
            return 0; // Don't crash sorting
        }
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
            case 'stage_start':
            case 'stage_end':
                iconClass = 'fa-flag'; // Use flag for stage boundaries
                badgeClass = step.status === 'completed' ? 'text-secondary' : 'text-primary';
                break;
            case 'step':
                // Use specific icons based on inferred actionType if available
                switch(step.actionType) {
                    case 'git': iconClass = 'fa-code-branch'; break;
                    case 'build-tool': iconClass = 'fa-cogs'; break;
                    case 'testing': iconClass = 'fa-vial'; break;
                    case 'deployment': iconClass = 'fa-upload'; break;
                    case 'command': iconClass = 'fa-terminal'; break;
                    default: iconClass = 'fa-arrow-right';
                }
                badgeClass = step.status === 'error' ? 'text-danger' : (step.status === 'completed' ? 'text-secondary' : '');
                break;
            case 'error':
                iconClass = 'fa-times-circle';
                badgeClass = 'text-danger';
                break;
            case 'completion_success':
                iconClass = 'fa-check-circle';
                badgeClass = 'text-success';
                break;
            default:
                iconClass = 'fa-circle'; // Generic fallback
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
                        <h6>${step.name || 'Processing...'} ${timeDisplay}</h6>
                    </div>
                    <div class="timeline-body">
                        <pre class="log-details">${Array.isArray(step.details) ? step.details.join('\n') : (step.details || '')}</pre>
                    </div>
                </div>
            </li>
        `;
    });
    
    timelineHTML += '</ul>';
    timelineContainer.innerHTML = timelineHTML;
    console.log("[DEBUG Timeline] Timeline HTML generated.");
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
