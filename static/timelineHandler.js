// --- Timeline Functions ---

// Main function to display the timeline, called by the 'View Timeline' button
async function displayTimeline() {
    const timelineArea = getElement('timeline-area');
    const timelineContent = getElement('timeline-content');
    const logContentElement = getElement('log-content'); // Need the log content to parse
    const logErrorElement = getElement('log-error');
    const logLoadingIndicator = getElement('log-loading-indicator');

    if (!timelineArea || !timelineContent) {
        console.error("Timeline UI elements not found.");
        return;
    }

    // Ensure logs are fetched first if not already available
    if (!logContentElement || logContentElement.textContent.trim() === '') {
        console.log("[DEBUG] Logs not yet fetched for timeline, fetching now...");
        await fetchAndDisplayLogs(); // Assume fetchAndDisplayLogs is available globally or imported
        // Check again if logs were successfully loaded after fetching
        if (!logContentElement || logContentElement.textContent.trim() === '' || (logErrorElement && logErrorElement.style.display !== 'none') ) {
            showError("Cannot display timeline because logs could not be loaded.", "timeline"); // Assuming a timeline-error element exists
             if (logLoadingIndicator) logLoadingIndicator.style.display = 'none';
            timelineArea.style.display = 'none';
            return;
        }
    }

    const logText = logContentElement.textContent;
    console.log("[DEBUG] Generating timeline from log content...");

    try {
        const timelineSteps = parseLogForTimeline(logText);
        console.log("[DEBUG] Parsed timeline steps:", timelineSteps);
        renderTimelineHTML(timelineSteps, timelineContent);
        timelineArea.style.display = 'block';
        // Hide other sections like log display when timeline is shown
        const logDisplayArea = getElement('log-display-area');
        if (logDisplayArea) logDisplayArea.style.display = 'none';
        const buildSummaryArea = getElement('build-summary-area');
        if (buildSummaryArea) buildSummaryArea.style.display = 'none';
    } catch (error) {
        console.error("Error generating timeline:", error);
        showError(`Failed to generate timeline: ${error.message}`, 'timeline'); // Assuming timeline-error
        timelineArea.style.display = 'none';
    }
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
