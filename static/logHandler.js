// --- Log Handling Functions ---

// Use window scope to avoid conflicts
if (typeof window.latestBuildUrl === 'undefined') {
    window.latestBuildUrl = null;
}

// Function to update the latestBuildUrl (called from jobDetailsHandler)
function setLatestBuildUrl(url) {
    console.log(`[DEBUG logHandler] Setting latest build URL to: ${url}`);
    window.latestBuildUrl = url;
    
    // Ensure this function is globally accessible for the job wizard
    if (typeof window !== 'undefined' && !window.setLatestBuildUrl) {
        window.setLatestBuildUrl = setLatestBuildUrl;
    }
}

// Fetch and display logs for the latest build URL
async function fetchAndDisplayLogs() {
    const logDisplayArea = getElement('log-display-area');
    const logContentElement = getElement('log-content');
    const logErrorElement = getElement('log-error');
    const logLoadingIndicator = getElement('log-loading-indicator');

    if (!logDisplayArea || !logContentElement || !logErrorElement || !logLoadingIndicator) {
        console.error("Log display UI elements not found.");
        return;
    }

    if (!window.latestBuildUrl) {
        showError("No build selected or latest build URL is missing.", 'log');
        logDisplayArea.style.display = 'block'; // Show the area to display the error
        return;
    }

    logLoadingIndicator.style.display = 'inline-block';
    logErrorElement.style.display = 'none';
    logContentElement.textContent = 'Loading logs...';
    logDisplayArea.style.display = 'block';

    try {
        // Use the new proxy route
        const proxyLogUrl = `/api/proxy/log?build_url=${encodeURIComponent(window.latestBuildUrl)}`;
        console.log(`[DEBUG Log] Fetching logs via proxy: ${proxyLogUrl}`);
        const response = await fetch(proxyLogUrl, {
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            const errorText = await response.text(); // Try to get more error info
            throw new Error(`HTTP Error: ${response.status} - ${response.statusText}. ${errorText}`);
        }
        const logText = await response.text();
        console.log(`[DEBUG Log] Received log text (length: ${logText.length}). First 500 chars:`, logText.substring(0, 500)); // Log received text
        
        // Store raw log text in a global variable for other components to access
        window.latestLogText = logText;
        
        // Filter out repetitive pipeline log lines that don't provide useful information
        const filteredLogText = filterPipelineNoise(logText);
        
        // Display formatted logs instead of plain text
        displayFormattedLogs(filteredLogText, logContentElement);
        console.log("[DEBUG] Log fetched successfully.");

        // Update line count info
        const lineInfo = document.getElementById('log-line-info');
        if (lineInfo) {
            const lineCount = logText.split('\n').length;
            lineInfo.innerHTML = `<span class="badge bg-secondary">${lineCount.toLocaleString()} lines</span>`;
        }

        // Dispatch event indicating logs are loaded - with detail object containing the log text
        console.log("[DEBUG LogHandler] Dispatching logContentLoaded event.");
        document.dispatchEvent(new CustomEvent('logContentLoaded', {
            detail: {
                logText: logText,
                filteredLogText: filteredLogText,
                buildUrl: window.latestBuildUrl,
                lineCount: logText.split('\n').length
            }
        }));
        
        // Also dispatch the jobWizard specific event in case that's being listened for
        document.dispatchEvent(new CustomEvent('jobWizardLogContentLoaded', {
            detail: {
                logText: logText,
                filteredLogText: filteredLogText,
                buildUrl: window.latestBuildUrl,
                lineCount: logText.split('\n').length
            }
        }));

    } catch (error) {
        console.error("Error fetching logs:", error);
        showError(`Failed to load logs: ${error.message}`, 'log');
        
        // Dispatch error event
        document.dispatchEvent(new CustomEvent('logContentError', {
            detail: {
                error: error,
                buildUrl: window.latestBuildUrl
            }
        }));
    } finally {
        logLoadingIndicator.style.display = 'none';
    }
}


// Parse log text to extract structured timeline steps
// Improved parsing logic
function parseLogForTimeline(logText) {
    if (!logText) return [];

    const lines = logText.split(/\r?\n/);
    const steps = [];
    let currentStep = null;
    let stageName = 'Declarative: Checkout SCM'; // Default stage

    // More robust regex
    const stageRegex = /^\s*\[Pipeline\] \/\/?stage(?: \(Declarative: (.*)\))?$/; // Match stage start/end and capture name
    const stepStartRegex = /^\s*\[Pipeline\] ([a-zA-Z]+)$/; // Match general step start like [Pipeline] sh
    const commandRegex = /^\+\s+(.*)$/; // Match shell commands
    const nodeRegex = /^Running on (.+) in (.+)$/; // Match node execution
    const statusRegex = /^Finished: (SUCCESS|FAILURE|ABORTED|UNSTABLE)$/; // Match final build status
    const errorMsgRegex = /^ERROR: (.*)$/i; // Match ERROR lines
    const timeStampRegex = /^(\d{2}:\d{2}:\d{2}\.\d{3})\s+/; // Simple time HH:MM:SS.ms

    // Simplified time parsing for duration - assumes logs have timestamps
    let buildStartTime = null;
    let lastTimestamp = null;

    function parseTimestamp(line) {
        const match = line.match(timeStampRegex);
        if (match) {
            // Create a Date object relative to today, assuming logs are recent
            const timeParts = match[1].split(/[:.]/);
            const now = new Date();
            const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                parseInt(timeParts[0]), parseInt(timeParts[1]), parseInt(timeParts[2]), parseInt(timeParts[3]));
            return date.getTime(); // milliseconds since epoch
        }
        return null;
    }

    lines.forEach(line => {
        const timestamp = parseTimestamp(line);
        if (timestamp) {
            if (!buildStartTime) buildStartTime = timestamp;
            lastTimestamp = timestamp;
        }
        line = line.replace(timeStampRegex, '').trim(); // Remove timestamp for cleaner regex matching

        const stageMatch = line.match(stageRegex);
        const stepStartMatch = line.match(stepStartRegex);
        const commandMatch = line.match(commandRegex);
        const nodeMatch = line.match(nodeRegex);
        const statusMatch = line.match(statusRegex);
        const errorMatch = line.match(errorMsgRegex);

        if (stageMatch) {
            // If it's a stage start line and captures a name, update stageName
            if (line.includes('stage (Declarative:') && stageMatch[1]) {
                stageName = stageMatch[1].trim();
            }
            // If it's a stage end line or a simple stage start, we might end the previous step
            if (currentStep && !line.includes('Declarative:')) { // Avoid ending step on the same line as stage name
                currentStep.status = 'SUCCESS'; // Assume success if ending due to new stage/step
                if (currentStep.startTime && lastTimestamp) {
                    currentStep.duration = lastTimestamp - currentStep.startTime;
                }
                steps.push(currentStep);
                currentStep = null;
            }
        } else if (stepStartMatch) {
            // End previous step if exists
            if (currentStep) {
                currentStep.status = 'SUCCESS'; // Assume success if ending due to new step
                if (currentStep.startTime && lastTimestamp) {
                    currentStep.duration = lastTimestamp - currentStep.startTime;
                }
                steps.push(currentStep);
            }
            // Start new step
            currentStep = {
                name: stepStartMatch[1],
                status: 'RUNNING',
                stage: stageName,
                startTime: lastTimestamp,
                duration: null,
                command: null,
                node: null,
                error: null
            };
        } else if (commandMatch && currentStep) {
            currentStep.command = (currentStep.command ? currentStep.command + '\n' : '') + commandMatch[1];
        } else if (nodeMatch && currentStep) {
            currentStep.node = nodeMatch[1];
            // Optionally update stage if node line implies it
            if (!currentStep.stage && nodeMatch[2]) {
                currentStep.stage = nodeMatch[2]; // Or some derivative
            }
        } else if (errorMatch && currentStep) {
            currentStep.status = 'FAILURE';
            currentStep.error = (currentStep.error ? currentStep.error + '\n' : '') + errorMatch[1];
        } else if (statusMatch) {
            // Final build status - could potentially mark the last step
            if (currentStep) {
                currentStep.status = statusMatch[1];
                if (currentStep.startTime && lastTimestamp) {
                    currentStep.duration = lastTimestamp - currentStep.startTime;
                }
                steps.push(currentStep);
                currentStep = null;
            }
            // Add a final step for the overall result if needed?
            steps.push({ name: 'Build Result', status: statusMatch[1], duration: null, stage: 'Summary', startTime: lastTimestamp });
        }
    });

    // Add the last running step if the log ended abruptly
    if (currentStep) {
        if (!currentStep.status || currentStep.status === 'RUNNING') {
            currentStep.status = 'UNKNOWN'; // Or infer based on overall status if available
        }
        if (currentStep.startTime && lastTimestamp) {
            currentStep.duration = lastTimestamp - currentStep.startTime;
        }
        steps.push(currentStep);
    }

    console.log("[DEBUG] Parsed Steps:", steps);
    return steps;
}

// Function to filter pipeline noise from log text
function filterPipelineNoise(logText) {
    if (!logText) return '';
    
    // Split the log into lines
    const lines = logText.split('\n');
    
    // Patterns to identify noisy/repetitive pipeline lines
    const noisePatterns = [
        /\[Pipeline\]\s*(?:echo|sleep|\[.+?\])\s*(?:echo|sleep|null)/i,  // Pipeline echo/sleep commands
        /\[Pipeline\]\s*\/\s*[a-z]+/i,                               // Pipeline node path indicators
        /\[Pipeline\]\s*\/\s*\[.+?\]/i,                             // Pipeline nested brackets
        /^\[Pipeline\]\s*$/,                                        // Empty pipeline lines
        /\[Pipeline\].*?Entering stage/i,                          // Stage enter notifications with no details
        /Running in Durability.+$/i,                               // Durability settings
        /\[Pipeline\]\s*\/\s*(?:sh|bat|powershell)\s*\(.*?\)$/i     // Simple shell commands without output
    ];
    
    // Filter out lines matching noise patterns
    // Also consolidate multiple consecutive pipeline entries to one summary line
    const filtered = [];
    let consecutivePipelineLines = 0;
    let lastNormalLine = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Check if this is a pipeline noise line
        const isNoisy = noisePatterns.some(pattern => pattern.test(line));
        
        if (isNoisy) {
            consecutivePipelineLines++;
            
            // If this is the first noisy line in a sequence, note it for potential summary
            if (consecutivePipelineLines === 1) {
                lastNormalLine = line;
            }
            
            // If we're at the end of the log or the next line isn't noisy,
            // add a summary instead of all the consecutive noisy lines
            if (i === lines.length - 1 || 
                !noisePatterns.some(pattern => pattern.test(lines[i+1]))) {
                
                if (consecutivePipelineLines > 3) {
                    // Add first line + summary instead of all lines
                    filtered.push(lastNormalLine);
                    filtered.push(`[...${consecutivePipelineLines-1} more similar pipeline lines omitted...]`);
                } else {
                    // For just a few lines, keep them all
                    for (let j = 0; j < consecutivePipelineLines; j++) {
                        filtered.push(lines[i - (consecutivePipelineLines - 1) + j]);
                    }
                }
                
                // Reset counter
                consecutivePipelineLines = 0;
            }
        } else {
            // This is a normal, informative line - keep it
            if (consecutivePipelineLines === 0) {
                filtered.push(line);
            }
            // Reset counter
            consecutivePipelineLines = 0;
            lastNormalLine = line;
        }
    }
    
    // Ensure this function is globally accessible for the job wizard
    if (typeof window !== 'undefined' && !window.filterPipelineNoise) {
        window.filterPipelineNoise = filterPipelineNoise;
    }
    
    return filtered.join('\n');
}

// Function to format log content with markup and syntax highlighting
function displayFormattedLogs(logText, containerElement) {
    if (!logText || !containerElement) return;
    
    // Clear the container
    containerElement.innerHTML = '';
    
    // Convert log text to HTML with syntax highlighting
    const logLines = logText.split(/\r?\n/);
    const fragment = document.createDocumentFragment();
    
    // Define patterns for different log elements
    const patterns = [
        { regex: /^\[Pipeline\]\s+(.+)$/, class: 'log-pipeline', icon: '<i class="fas fa-stream text-primary me-1"></i>' },
        { regex: /^\s*\[Pipeline\] \/\/?stage(?: \(Declarative: (.*)\))?$/, class: 'log-stage', icon: '<i class="fas fa-layer-group text-success me-1"></i>' },
        { regex: /^\+\s+(.*)$/, class: 'log-command', icon: '<i class="fas fa-terminal text-secondary me-1"></i>' },
        { regex: /^ERROR:?\s+(.*)$/i, class: 'log-error', icon: '<i class="fas fa-times-circle text-danger me-1"></i>' },
        { regex: /^WARNING:?\s+(.*)$/i, class: 'log-warning', icon: '<i class="fas fa-exclamation-triangle text-warning me-1"></i>' },
        { regex: /^Finished: (SUCCESS)$/i, class: 'log-success', icon: '<i class="fas fa-check-circle text-success me-1"></i>' },
        { regex: /^Finished: (FAILURE|ABORTED|UNSTABLE)$/i, class: 'log-failure', icon: '<i class="fas fa-times-circle text-danger me-1"></i>' },
        { regex: /^Running on (.+) in (.+)$/, class: 'log-node', icon: '<i class="fas fa-server text-info me-1"></i>' }
    ];
    
    // Process each line with the appropriate formatting
    logLines.forEach((line, index) => {
        const lineDiv = document.createElement('div');
        lineDiv.className = 'log-line';
        
        // Add line number
        const lineNumSpan = document.createElement('span');
        lineNumSpan.className = 'log-line-number';
        lineNumSpan.textContent = (index + 1).toString().padStart(4, ' ');
        lineDiv.appendChild(lineNumSpan);
        
        // Format the line content based on patterns
        let lineFormatted = false;
        
        for (const pattern of patterns) {
            const match = line.match(pattern.regex);
            if (match) {
                lineDiv.className += ` ${pattern.class}`;
                
                // Create content with icon
                const contentSpan = document.createElement('span');
                contentSpan.className = 'log-content';
                contentSpan.innerHTML = pattern.icon + escapeHtml(line);
                lineDiv.appendChild(contentSpan);
                
                lineFormatted = true;
                break;
            }
        }
        
        // If no specific formatting was applied, use the default
        if (!lineFormatted) {
            const contentSpan = document.createElement('span');
            contentSpan.className = 'log-content';
            contentSpan.textContent = line;
            lineDiv.appendChild(contentSpan);
        }
        
        fragment.appendChild(lineDiv);
    });
    
    containerElement.appendChild(fragment);
    
    // Ensure this function is globally accessible for the job wizard
    if (typeof window !== 'undefined' && !window.displayFormattedLogs) {
        window.displayFormattedLogs = displayFormattedLogs;
    }
    
    // Dispatch an event when logs are formatted and displayed
    document.dispatchEvent(new CustomEvent('logsFormatted', { 
        detail: { 
            container: containerElement,
            lineCount: logLines.length
        }
    }));
    
    return true;
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    
    // Use a more reliable approach for escaping HTML
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
