// --- Timeline Functions ---

// Global variable to hold the parsed timeline steps, declared properly
let currentTimelineSteps = [];

// Helper functions - local definitions to ensure availability
function showLoadingSection(sectionId, loadingIndicatorId, errorElementId) {
    const section = document.getElementById(sectionId);
    const loadingIndicator = document.getElementById(loadingIndicatorId);
    const errorElement = document.getElementById(errorElementId);

    if (section) section.style.display = 'block';
    if (errorElement) {
        errorElement.style.display = 'none';
        errorElement.textContent = '';
    }
    if (loadingIndicator) loadingIndicator.style.display = 'inline-block';
}

function hideLoadingIndicator(loadingIndicatorId, errorElementId, errorMessage = null) {
    const loadingIndicator = document.getElementById(loadingIndicatorId);
    const errorElement = document.getElementById(errorElementId);

    if (loadingIndicator) loadingIndicator.style.display = 'none';

    if (errorMessage && errorElement) {
        errorElement.textContent = errorMessage;
        errorElement.style.display = 'block';
    }
}

function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with ID '${id}' not found.`);
    }
    return element;
}

// Function to fetch and display the execution timeline
async function fetchAndDisplayTimeline(jobName, buildNumber = 'lastBuild') {
    const containerId = 'timeline-container';
    const loadingId = 'timeline-loading-indicator';
    const errorId = 'timeline-error';
    const areaId = 'timeline-display-area';

    // Ensure jobName is provided, fallback to global if necessary
    const targetJobName = jobName || selectedJobFullName;
    if (!targetJobName) {
        hideLoadingIndicator(loadingId, errorId, "No job selected.");
        return;
    }

    console.log(`[Timeline] Fetching timeline for ${targetJobName}, build ${buildNumber}`);
    showLoadingSection(areaId, loadingId, errorId); // Use global helper

    const timelineContainer = getElement(containerId);
    if (timelineContainer) timelineContainer.innerHTML = ''; // Clear previous timeline

    try {
        const url = `/api/jenkins/timeline/${encodeURIComponent(targetJobName)}/${buildNumber}`;
        console.log("[Timeline] Requesting URL:", url);
        const response = await fetch(url);
        console.log("[Timeline] Received response status:", response.status);

        if (!response.ok) {
            // Handle specific errors like 401 Unauthorized (maybe Jenkins creds changed)
            let errorText = `HTTP Error: ${response.status} - ${response?.statusText}`;
            if (response.status === 401) {
                errorText = "Unauthorized access to Jenkins log. Check credentials in Settings.";
            } else if (response.status === 404) {
                errorText = "Log not found on Jenkins server.";
            } else {
                // Try to get error details from the response body if available
                try {
                    const errorData = await response.json();
                    if (errorData && errorData.error) {
                        errorText += `: ${errorData?.error || 'Unknown error'}`; // Use optional chaining and nullish coalescing
                    }                
                } catch(e) { /* Ignore if response is not JSON */ }
            }
            throw new Error(errorText);
        }

        const logText = await response.text();
        if (!logText || logText.length === 0) {
            hideLoadingIndicator(loadingId, errorId, "Log content is empty. Cannot generate timeline.");
            return;
        }

        console.log("[DEBUG Timeline] Fetched log length:", logText ? logText.length : 0);

        console.log("[DEBUG Timeline] === Starting Basic Parsing ===");
        const basicSteps = parsePipelineSteps(logText);
        console.log("[DEBUG Timeline] === Finished Basic Parsing === Raw Steps:", JSON.parse(JSON.stringify(basicSteps)));

        // --- AI Naming for Unnamed Stages ---
        console.log("[Timeline] === Starting AI Stage Naming ===");
        await enhanceStageNamesWithAI(basicSteps); // Call the new function
        console.log("[Timeline] === Finished AI Stage Naming === Final Steps:", JSON.parse(JSON.stringify(basicSteps)));

        console.log("[DEBUG Timeline] === Starting Display Timeline ===");
        displayTimeline(basicSteps);
        console.log("[DEBUG Timeline] === Finished Display Timeline ===");

    } catch (error) {
        console.error('[Timeline] Error fetching or generating timeline:', error);
        // Use global helper to hide loading and show error message
        hideLoadingIndicator(loadingId, errorId, `Failed to generate timeline: ${error.message}`);
        if (timelineContainer) timelineContainer.innerHTML = ''; // Clear container on error
    }
    // Loading indicator is hidden by hideLoadingIndicator on error, or by displayTimeline on success.
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
    const lines = logContent?.split('\n') ?? []; // Use optional chaining and nullish coalescing
    const steps = [];
    let currentStage = null;
    let currentStageStartTime = null;
    let currentStageDetails = [];
    let lastValidTimestamp = null; // Track the last known valid timestamp
    let lineIndex = 0;

    // Regex to identify the start of a stage more reliably
    const stageStartRegex = /^\[Pipeline\] stage(?:\s*\(Declarative: Stage(?: "(.+?)"| \w+)\))?/; // Handles declarative and scripted stage starts
    const stageNameRegex = /Starting stage "(.+)"|\(Declarative: Stage(?: "(.+?)"| \w+)\)/; // Extract name

    // Regex for end of pipeline or build result lines
    const endRegex = /^\[Pipeline\] (?:End of Pipeline|Finished: (?:SUCCESS|FAILURE|ABORTED|UNSTABLE))/; // Added non-capturing group to inner alternatives

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

// --- AI Stage Naming Function ---
async function enhanceStageNamesWithAI(steps) {
    const unnamedStagePattern = /Stage: Unnamed Stage/i;
    const promises = [];

    for (const step of steps) {
        if (step.type === 'stage' && unnamedStagePattern.test(step.name)) {
            console.log(`[Timeline AI] Found unnamed stage, attempting to name using details (length: ${step.details?.length})`);
            if (step.details && step.details.length > 50) { // Only try if there are enough details
                // Create a promise for the API call
                const promise = fetch('/api/analyze/suggest_stage_name', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        // Add CSRF token if needed (see setupCSRF in utils.js)
                        'X-CSRFToken': getCsrfToken() 
                    },
                    body: JSON.stringify({ log_snippet: step.details })
                })
                .then(response => {
                    if (!response.ok) {
                        // Handle API errors gracefully (e.g., credits issue)
                         return response.json().then(errData => {
                            console.warn(`[Timeline AI] API error suggesting name: ${response.status}`, errData.error || 'Unknown error');
                            return { suggested_name: 'Unnamed Stage' }; // Keep original name on error
                         });
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.suggested_name && data.suggested_name !== 'Processing') {
                        console.log(`[Timeline AI] Suggested name: '${data.suggested_name}' for original '${step.name}'`);
                        step.name = `Stage: ${data.suggested_name}`; // Update the step name
                    } else {
                         console.log(`[Timeline AI] AI suggested 'Processing' or no name, keeping '${step.name}'`);
                    }
                })
                .catch(error => {
                    console.error('[Timeline AI] Failed to fetch suggested name:', error);
                    // Keep original name on network or other errors
                });
                promises.push(promise);
            } else {
                console.log(`[Timeline AI] Skipping AI naming for stage '${step.name}' due to insufficient details.`);
            }
        }
    }

    // Wait for all API calls to complete before proceeding
    if (promises.length > 0) {
        console.log(`[Timeline AI] Waiting for ${promises.length} AI naming requests...`);
        await Promise.all(promises);
        console.log('[Timeline AI] All AI naming requests finished.');
    } else {
        console.log('[Timeline AI] No unnamed stages found requiring AI naming.');
    }
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
    console.log("[Timeline] Displaying timeline with", steps?.length, "stages/blocks");
    const containerId = 'timeline-container';
    const loadingId = 'timeline-loading-indicator';
    const errorId = 'timeline-error';

    const timelineContainer = getElement(containerId);
    const errorElement = getElement(errorId);

    if (!timelineContainer) {
        console.error("[Timeline] Error: Timeline container element not found.");
        hideLoadingIndicator(loadingId, errorId, "Internal error: Timeline display area missing.");
        return;
    }

    // Clear previous errors before rendering
    if (errorElement) errorElement.style.display = 'none';

    let timelineHTML = '<ul class="timeline">'; // Start timeline list
    const ignoreList = getTimelineIgnoreList();

    // Global variable to hold the parsed timeline steps
    currentTimelineSteps = steps; // Assign to the global variable

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
        let displayTime = '--:--:--';
        const timeSource = step.start || step.time;
        if (timeSource && !String(timeSource).includes('Line')) {
            try {
                displayTime = timeSource.substring(11, 19);
            } catch(e) {
                console.warn('Time formatting error', e);
            }
        }
        timeDisplay = `<span class="timeline-time">${displayTime}</span>`;
        
        // Filter details based on ignore list
        let filteredDetails = step.details?.split('\n').filter(line => {
            // Keep line if it doesn't contain any of the ignore list items
            return !ignoreList.some(ignoreItem => line.includes(ignoreItem));
        }).join('\n');

        // Display AI suggestion or original name with an edit button
        let stageNameDisplay = step.name;
        let aiBadge = "";
        if (step.suggested_name && step.suggested_name !== step.name) { // Show badge only if AI changed it
            stageNameDisplay = step.suggested_name;
            aiBadge = ` <span class="badge bg-info text-dark ms-2">AI </span>`;
        }

        // Create the timeline item with the enhanced details
        timelineHTML += `
            <li class="timeline-item" data-step-index="${index}">
                <div class="timeline-marker ${getMarkerClass(step.status)}"></div> 
                <div class="timeline-content">
                    <span class="timeline-title" id="stage-title-${index}">
                        ${iconClass} 
                        <span class="stage-name">${escapeHtml(stageNameDisplay)}</span>
                        ${aiBadge}
                        <button class="btn btn-sm btn-outline-secondary ms-2 edit-stage-btn" title="Edit Stage Name">
                            <i class="fas fa-pencil-alt"></i>
                        </button>
                        <span class="edit-controls" style="display: none;">
                            <input type="text" class="form-control form-control-sm d-inline-block w-auto ms-2 edit-stage-input" value="${escapeHtml(stageNameDisplay)}">
                            <button class="btn btn-sm btn-success ms-1 save-stage-btn"><i class="fas fa-check"></i></button>
                            <button class="btn btn-sm btn-danger ms-1 cancel-edit-btn"><i class="fas fa-times"></i></button>
                        </span>
                    </span>
                    ${timeDisplay}
                    <div class="timeline-body">
                        {# Details are now in the collapsible section below #}
                        <pre class="log-details">${Array.isArray(step.details) ? step.details.join('\n') : (step.details || '')}</pre>
                    </div>
                    <div class="timeline-details">
                        <button class="btn btn-sm btn-outline-secondary mt-2" type="button" data-bs-toggle="collapse" data-bs-target="#details-${index}" aria-expanded="false" aria-controls="details-${index}">
                            ${filteredDetails ? 'Show/Hide Details (' + filteredDetails.split('\n').length + ' lines)' : 'No Details'}
                        </button>
                        <div class="collapse mt-1" id="details-${index}">
                            <pre class="log-details-content"><code>${filteredDetails ? escapeHtml(filteredDetails) : 'No details available.'}</code></pre>
                        </div>
                    </div>
                </div>
            </li>
        `;
    });
    
    timelineHTML += '</ul>';
    timelineContainer.innerHTML = timelineHTML;
    console.log("[DEBUG Timeline] Timeline HTML generated.");

    // Setup event listeners for the new timeline items
    setupTimelineInteractivity('timeline-container');

    // Hide loading on successful display
    hideLoadingIndicator(loadingId, errorId);
}

// Utility function to get status icon class
function getStatusIcon(status) {
    status = String(status).toLowerCase() || 'unknown'; // Ensure it's a lowercase string
    switch (status) {
        case 'success':
            return '<i class="fas fa-check-circle text-success"></i>';
        case 'failure':
        case 'error':
            return '<i class="fas fa-times-circle text-danger"></i>';
        case 'aborted':
            return '<i class="fas fa-stop-circle text-warning"></i>';
        case 'running':
        case 'inprogress': // Assuming 'inprogress' is similar to 'running'
            return '<i class="fas fa-spinner fa-spin text-primary"></i>';
        case 'unstable':
            return '<i class="fas fa-exclamation-circle text-warning"></i>';
        case 'skipped':
        case 'not_built':
            return '<i class="fas fa-minus-circle text-muted"></i>';
        default:
            return '<i class="fas fa-question-circle text-muted"></i>';
    }
}

// Utility function to get status marker class
function getMarkerClass(status) {
    status = String(status).toLowerCase() || 'unknown'; // Ensure it's a lowercase string
    switch (status) {
        case 'success':
            return 'marker-success';
        case 'failure':
        case 'error':
            return 'marker-failure';
        case 'aborted':
            return 'marker-aborted';
        case 'running':
        case 'inprogress': // Assuming 'inprogress' is similar to 'running'
            return 'marker-running';
        case 'unstable':
            return 'marker-unstable';
        case 'skipped':
        case 'not_built':
            return 'marker-skipped';
        default:
            return 'marker-unknown';
    }
}

// --- Timeline Interactivity ---
function setupTimelineInteractivity(containerId) {
    const container = getElement(containerId);
    if (!container) return;

    container.addEventListener('click', (event) => {
        const target = event.target;

        // Find the closest button with the specific class
        const editButton = target.closest('.edit-stage-btn');
        const saveButton = target.closest('.save-stage-btn');
        const cancelButton = target.closest('.cancel-edit-btn');

        const listItem = target.closest('.timeline-item');
        if (!listItem) return; // Click wasn't inside a timeline item

        const titleSpan = listItem.querySelector('.timeline-title');
        const stageNameSpan = listItem.querySelector('.stage-name');
        const aiBadgeSpan = titleSpan.querySelector('.badge'); // Might be null
        const editControls = listItem.querySelector('.edit-controls');
        const editInput = listItem.querySelector('.edit-stage-input');

        if (editButton) {
            // Hide name, badge, and edit button; show input and save/cancel buttons
            stageNameSpan.style.display = 'none';
            if (aiBadgeSpan) aiBadgeSpan.style.display = 'none';
            editButton.style.display = 'none';
            editControls.style.display = 'inline';
            editInput.value = stageNameSpan.textContent; // Set input to current name
            editInput.focus();
            editInput.select();
        }

        if (saveButton) {
            const newName = editInput.value.trim();
            if (newName) {
                stageNameSpan.textContent = newName;
                // Optionally: Update the underlying data structure if needed for persistence
                console.log(`Stage ${listItem.dataset.stepIndex} renamed to: ${newName}`);
            }
            // Hide input and save/cancel; show name, badge, and edit button
            stageNameSpan.style.display = 'inline';
            if (aiBadgeSpan) aiBadgeSpan.style.display = 'inline'; // Show badge again
            editButton.style.display = 'inline-block'; // Or inline
            editControls.style.display = 'none';
        }

        if (cancelButton) {
            // Just revert UI - hide input and save/cancel; show original name, badge, and edit button
            stageNameSpan.style.display = 'inline';
            if (aiBadgeSpan) aiBadgeSpan.style.display = 'inline';
            editButton.style.display = 'inline-block'; // Or inline
            editControls.style.display = 'none';
        }
    });
}

// Function to get the ignore list from local storage
function getTimelineIgnoreList() {
    const TIMELINE_IGNORE_LIST_KEY = 'timelineIgnoreList'; // Same key as in settingsHandler
    const rawList = localStorage.getItem(TIMELINE_IGNORE_LIST_KEY);
    if (!rawList) {
        return [];
    }
    // Split by newline, trim whitespace, filter empty lines
    return rawList.split('\n').map(item => item.trim()).filter(item => item.length > 0);
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
