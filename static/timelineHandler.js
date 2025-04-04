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
        const timelineSteps = parseLogForTimeline(logText);
        console.log("[DEBUG Timeline] Parsed timeline steps:", timelineSteps);
        renderTimelineHTML(timelineSteps, timelineContent);

    } catch (error) {
        console.error("Error generating timeline:", error);
        showError(`Failed to generate timeline: ${error.message}`, 'timeline');
        // Keep timeline area visible to show the error message
    } finally {
        timelineLoadingIndicator.style.display = 'none';
    }
}

// Parses log text (simplified example - needs robust implementation)
function parseLogForTimeline(logText) {
    console.log("[DEBUG Timeline] Parsing log text... First 500 chars:", logText.substring(0, 500));
    const steps = [];
    // Placeholder: This regex is very basic and needs significant improvement
    // It looks for lines starting with [Pipeline] Stage "Stage Name"
    // and assumes timestamps mark start/end, which might not be accurate.
    const stageRegex = /\[Pipeline\] Stage \"([^\"]+)\"/g;
    const timestampRegex = /^(\d{2}:\d{2}:\d{2}\.\d{3})/; // Example: 14:17:35.123
    let currentStage = null;
    let stageStartTime = null;

    const lines = logText.split('\n');

    lines.forEach(line => {
        const stageMatch = stageRegex.exec(line);
        const timeMatch = timestampRegex.exec(line);
        let currentTime = null;

        if (timeMatch) {
            // Very basic time parsing - assumes log date is today
            // This needs a robust way to handle dates across days
            try {
                const timeParts = timeMatch[1].split(/[:.]/);
                const date = new Date();
                date.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), parseInt(timeParts[2], 10), parseInt(timeParts[3], 10));
                currentTime = date.getTime();
            } catch (e) { /* Ignore lines without parseable timestamps */ }
        }

        if (stageMatch) {
            // End previous stage if one was active
            if (currentStage && stageStartTime && currentTime) {
                currentStage.duration = currentTime - stageStartTime;
                // Simple status determination (needs improvement)
                currentStage.status = 'SUCCESS'; // Assume success unless error found later
                steps.push(currentStage);
            }
            // Start new stage
            currentStage = { name: stageMatch[1], status: 'RUNNING', duration: null };
            stageStartTime = currentTime;
        }

        // Add simplistic error detection
        if (currentStage && (line.includes('ERROR:') || line.includes('Failed') || line.toLowerCase().includes('exception'))) {
            currentStage.status = 'FAILURE';
            currentStage.error = line.trim(); // Store first error line
        }
    });

    // Add the last stage if it exists
    if (currentStage) {
        // If no end time found, maybe mark as ABORTED or UNKNOWN?
        if (!currentStage.duration && stageStartTime && lines.length > 0) {
             // Try to get time from last line? Highly unreliable.
             // currentStage.duration = endTimeFromLastLine - stageStartTime;
             if (currentStage.status === 'RUNNING') currentStage.status = 'UNKNOWN'; // Or SUCCESS?
        }
        // If duration still null, maybe set to 0 or mark status differently
        if (!currentStage.duration) currentStage.duration = 0;
        if (currentStage.status === 'RUNNING') currentStage.status = 'SUCCESS'; // Assume ended successfully if no failure detected
        steps.push(currentStage);
    }

    console.log("[DEBUG Timeline] Parsing complete. Steps found:", steps.length);
    return steps;
}

// Renders the timeline steps into HTML
function renderTimelineHTML(steps, containerElement) {
    if (!containerElement) return;

    containerElement.innerHTML = ''; // Clear previous timeline

    if (!steps || steps.length === 0) {
        containerElement.innerHTML = '<p class="text-muted">No timeline data could be extracted from the log.</p>';
        return;
    }

    const summaryPanel = document.createElement('div');
    summaryPanel.id = 'timeline-summary';
    summaryPanel.classList.add('card', 'mb-4', 'shadow-sm');
    containerElement.appendChild(summaryPanel);

    const timelineList = document.createElement('ul');
    timelineList.classList.add('timeline', 'list-unstyled'); // Use list-unstyled to remove default list styling
    containerElement.appendChild(timelineList);

    steps.forEach((step, index) => {
        const listItem = document.createElement('li');
        listItem.classList.add('timeline-item');

        let statusClass = 'secondary';
        let statusIcon = 'fa-question-circle';
        switch (step.status) {
            case 'SUCCESS': statusClass = 'success'; statusIcon = 'fa-check-circle'; break;
            case 'FAILURE': statusClass = 'danger'; statusIcon = 'fa-times-circle'; break;
            case 'RUNNING': statusClass = 'info'; statusIcon = 'fa-play-circle'; break;
            case 'UNSTABLE': statusClass = 'warning'; statusIcon = 'fa-exclamation-circle'; break;
            case 'ABORTED': statusClass = 'secondary'; statusIcon = 'fa-stop-circle'; break;
        }

        const durationText = step.duration ? formatDuration(step.duration) : '--'; // Use formatDuration

        listItem.innerHTML = `
            <div class="timeline-marker bg-${statusClass}">
                <i class="fas ${statusIcon} text-white"></i>
            </div>
            <div class="timeline-content card">
                 <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center">
                     <strong class="step-name">${step.name || 'Unnamed Step'}</strong>
                     <span class="text-muted small">${durationText}</span>
                 </div>
                 <div class="timeline-details p-3" data-step-index="${index}" style="display: none;">
                    <p><strong>Status:</strong> <span class="badge bg-${statusClass}">${step.status}</span></p>
                    ${step.command ? `<p><strong>Command:</strong> <code>${escapeHtml(step.command)}</code></p>` : ''}
                    ${step.node ? `<p><strong>Node:</strong> ${step.node}</p>` : ''}
                    ${step.stage ? `<p><strong>Stage:</strong> ${step.stage}</p>` : ''}
                    ${step.error ? `<p class="text-danger"><strong>Error:</strong> ${step.error}</p>` : ''}
                 </div>
             </div>
        `;
        timelineList.appendChild(listItem);

        // Add click listener to the content card to toggle details
        const contentCard = listItem.querySelector('.timeline-content .card-header'); // Target header for click
         if (contentCard) {
             contentCard.style.cursor = 'pointer'; // Indicate clickable
             contentCard.addEventListener('click', () => {
                 const detailsElement = listItem.querySelector('.timeline-details');
                 if (detailsElement) {
                    detailsElement.style.display = detailsElement.style.display === 'none' ? 'block' : 'none';
                 }
             });
         }
    });

     // Generate and display the summary panel
    generateTimelineSummary(steps, summaryPanel);
}

// Function to generate the summary panel content
function generateTimelineSummary(steps, summaryPanel) {
    if (!summaryPanel || !steps || steps.length === 0) return;

    // Calculate total duration
    const totalDuration = steps.reduce(
        (total, step) => total + (step.duration || 0),
        0
    );
    const totalDurationText = formatDuration(totalDuration);

    // Count statuses
    const statusCounts = steps.reduce((counts, step) => {
        counts[step.status] = (counts[step.status] || 0) + 1;
        return counts;
    }, {});

    // Create status badges
    const statusBadges = Object.entries(statusCounts)
        .map(([status, count]) => {
            let badgeClass = "bg-secondary";
            if (status === "SUCCESS") badgeClass = "bg-success";
            if (status === "FAILURE") badgeClass = "bg-danger";
            if (status === "UNSTABLE") badgeClass = "bg-warning";
            if (status === "RUNNING") badgeClass = "bg-info";

            return `<span class="badge ${badgeClass} me-2">${status}: ${count}</span>`;
        })
        .join("");

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

}

// Helper to escape HTML special characters for display
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }
