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

        console.log("[DEBUG Timeline] === Starting Display Timeline ===");
        displayTimeline(basicSteps);
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

// Parse pipeline steps focusing on stages and major commands
function parsePipelineSteps(logContent) {
    console.log("[Timeline] Starting STAGE-FOCUSED parsing...");
    const lines = logContent.split('\n');
    const steps = [];
    let currentStage = null;
    let currentStageStartTime = null;
    let currentStageDetails = [];
    let lastValidTimestamp = null; // Track the last known valid timestamp
    let lineIndex = 0;

    // Regex to identify the start of a stage more reliably
    const stageStartRegex = /^\[Pipeline\] stage(?:\s*\(Declarative: Stage(?: "(.+?)"| \w+)\))?/; // Handles declarative and scripted stage starts
    const stageNameRegex = /Starting stage "(.+)"|\(Declarative: Stage(?: "(.+?)"| \w+)\)/; // Extract name

    // Regex to identify significant commands *within* a stage (optional detail)
    const commandRegex = /^\[Pipeline\] (sh|bat|powershell|node|echo|git|mvn|docker|gradle|npm|yarn|pip|ansible|terraform)/i;
    // Regex for end of pipeline or build result lines
    const endRegex = /^\[Pipeline\] End of Pipeline|Finished: (SUCCESS|FAILURE|ABORTED|UNSTABLE)/;

    for (const line of lines) {
        lineIndex++;
        // Attempt to extract timestamp for the current line
        const currentLineTimestamp = extractTimestamp(line);
        if (currentLineTimestamp) {
            lastValidTimestamp = currentLineTimestamp; // Update last known good timestamp
        }
        const effectiveTimestamp = lastValidTimestamp || `Line ${lineIndex}`; // Use last good or fallback

        const trimmedLine = line.trim();
        if (!trimmedLine) continue; // Skip empty lines

        // Detect STAGE START
        if (stageStartRegex.test(trimmedLine)) {
            // --- Finalize the PREVIOUS stage --- 
            if (currentStage) {
                steps.push({
                    name: currentStage,
                    start: currentStageStartTime,
                    end: effectiveTimestamp, // End time is start of next stage
                    status: 'Unknown', // Status determined later or from end block
                    details: currentStageDetails.join('\n'),
                    type: 'stage'
                });
                console.log(`[Timeline] Finished Stage: ${currentStage} at ${effectiveTimestamp}`);
            }
            // --- Start the NEW stage --- 
            let stageName = "Unnamed Stage";
            const nameMatch = trimmedLine.match(stageNameRegex);
            if (nameMatch) {
                stageName = nameMatch[1] || nameMatch[2] || stageName; // Extract name from different patterns
            }
            // Clean up potential extra details in stage name
            stageName = stageName.replace(/^Starting stage "|"$/, '').trim(); 
                 
            currentStage = `Stage: ${stageName}`;
            currentStageStartTime = effectiveTimestamp;
            currentStageDetails = [line]; // Start details with this line
            console.log(`[Timeline] Started Stage: ${currentStage} at ${currentStageStartTime}`);
            continue; // Move to next line after processing stage start
        }

        // Detect END OF PIPELINE / FINAL STATUS
        if (endRegex.test(trimmedLine)) {
             // --- Finalize the LAST stage --- 
            if (currentStage) {
                // Try to infer status from the end line
                let finalStatus = 'Unknown';
                const statusMatch = trimmedLine.match(/Finished: (\w+)/);
                if (statusMatch && statusMatch[1]) {
                    finalStatus = statusMatch[1];
                }
                currentStageDetails.push(line); // Add end line to details
                steps.push({
                    name: currentStage,
                    start: currentStageStartTime,
                    end: effectiveTimestamp,
                    status: finalStatus, 
                    details: currentStageDetails.join('\n'),
                    type: 'stage'
                });
                console.log(`[Timeline] Finished FINAL Stage: ${currentStage} at ${effectiveTimestamp} with status ${finalStatus}`);
                currentStage = null; // Mark stage as finished
                currentStageDetails = [];
            }
            // We can potentially break here if we are sure it's the end
            // break; 
        }

        // If within a stage, collect details
        if (currentStage) {
            currentStageDetails.push(line);

            // Optional: Identify significant commands within the stage for detail enrichment
            // const commandMatch = trimmedLine.match(commandRegex);
            // if (commandMatch) {
            //     // You could potentially add markers or annotations to currentStageDetails here
            //     // console.log(`[Timeline] Found command '${commandMatch[0]}' in stage ${currentStage}`);
            // }
        }
    }

    // If the loop finishes and there's still an active stage (no explicit end line found)
    if (currentStage) {
        steps.push({
            name: currentStage,
            start: currentStageStartTime,
            end: lastValidTimestamp || currentStageStartTime, // Use last known time or start time
            status: 'Unknown', // Status likely undetermined
            details: currentStageDetails.join('\n'),
            type: 'stage'
        });
         console.log(`[Timeline] Finished Stage (end of log): ${currentStage}`);
    }

    console.log(`[Timeline] Stage-focused parsing finished. Found ${steps.length} stages/blocks.`);
    return steps;
}

// Helper to clean up extracted names (Keep this as it's useful)
function cleanupName(name) {
    if (!name) return 'Unknown Step';
    // Truncate if too long
    if (name.length > 30) {
        name = name.substring(0, 27) + '...';
    }
    
    // Capitalize first letter
    return name.charAt(0).toUpperCase() + name.slice(1);
}

// Display the execution timeline with enhanced timing details
function displayTimeline(steps) {
    console.log("[Timeline] Displaying timeline with", steps ? steps.length : 0, "stages/blocks");
    const timelineContent = getElement('timeline-content');
    const timelineError = getElement('timeline-error');

    if (!steps || !steps.length) {
        timelineContent.innerHTML = '<div class="alert alert-info">No timeline data available</div>';
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
    timelineContent.innerHTML = timelineHTML;
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
