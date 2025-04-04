// --- Log Handling Functions ---

let latestBuildUrl = null; // Store URL for the latest build of the selected job

// Function to update the latestBuildUrl (called from jobDetailsHandler)
function setLatestBuildUrl(url) {
    console.log(`[DEBUG logHandler] Setting latest build URL to: ${url}`);
    latestBuildUrl = url;
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

    if (!latestBuildUrl) {
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
        const proxyLogUrl = `/api/proxy/log?build_url=${encodeURIComponent(latestBuildUrl)}`;
        console.log(`[DEBUG Log] Fetching logs via proxy: ${proxyLogUrl}`);
        const response = await fetch(proxyLogUrl);

        if (!response.ok) {
            const errorText = await response.text(); // Try to get more error info
            throw new Error(`HTTP Error: ${response.status} - ${response.statusText}. ${errorText}`);
        }
        const logText = await response.text();
        console.log(`[DEBUG Log] Received log text (length: ${logText.length}). First 500 chars:`, logText.substring(0, 500)); // Log received text
        logContentElement.textContent = logText;
        console.log("[DEBUG] Log fetched successfully.");

    } catch (error) {
        console.error("Error fetching logs:", error);
        showError(`Failed to load logs: ${error.message}`, 'log');
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
    const stageRegex = /^\s*\[Pipeline\] \/\/{0,1}stage(?: \(Declarative: (.*)\))?$/; // Match stage start/end and capture name
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
