// Handles Log Analysis Feature

document.addEventListener('DOMContentLoaded', () => {
    console.log("[DEBUG LogAnalyzer] Initializing log analyzer...");
    const analyzeBtn = document.getElementById('analyze-log-btn');
    const logContentElement = document.getElementById('log-content'); // The <pre> tag holding the log
    const analysisLoading = document.getElementById('log-analysis-loading');
    const analysisResult = document.getElementById('log-analysis-result');
    const analysisError = document.getElementById('log-analysis-error');

    if (!analyzeBtn) {
        console.error("[LogAnalyzer] Analyze button not found!");
        return;
    }
    if (!logContentElement) {
        console.error("[LogAnalyzer] Log content element not found!");
        return;
    }
    if (!analysisLoading || !analysisResult || !analysisError) {
        console.error("[LogAnalyzer] Analysis display elements not found!");
        return;
    }

    analyzeBtn.addEventListener('click', async () => {
        console.log("[DEBUG LogAnalyzer] Analyze button clicked.");
        const logContent = logContentElement.textContent;

        if (!logContent) {
            showAnalysisError("Log content is empty. Cannot analyze.");
            return;
        }

        // Show loading, hide previous results/errors
        analysisLoading.style.display = 'block';
        analysisResult.textContent = '';
        analysisError.style.display = 'none';
        analyzeBtn.disabled = true;

        try {
            const response = await fetch('/api/analyze-log', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken() 
                },
                body: JSON.stringify({ log_content: logContent })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }

            if (data.analysis) {
                displayAnalysisResult(data.analysis);
            } else {
                showAnalysisError("Received empty analysis from server.");
            }

        } catch (error) {
            console.error("[LogAnalyzer] Error calling analysis API:", error);
            showAnalysisError(`Failed to analyze log: ${error.message}`);
        } finally {
            // Hide loading, re-enable button
            analysisLoading.style.display = 'none';
            analyzeBtn.disabled = false;
        }
    });

    // Function to enable/disable the analyze button based on log content
    function updateAnalyzeButtonState() {
         if (!analyzeBtn || !logContentElement) return;
        
         // Check if the log content element exists and has text content
         const hasLogContent = logContentElement && logContentElement.textContent.trim().length > 0;
         analyzeBtn.disabled = !hasLogContent;
         console.log(`[DEBUG LogAnalyzer] Analyze button state updated. Disabled: ${!hasLogContent}`);
    }
    
    // We need a way to know when log content is loaded or updated.
    // Since log loading is handled in logHandler.js, we'll use a custom event.
    // logHandler.js should dispatch this event after successfully loading logs.
    document.addEventListener('logContentLoaded', () => {
        console.log("[DEBUG LogAnalyzer] Received logContentLoaded event.");
        updateAnalyzeButtonState();
    });

    // Initial check in case logs were already loaded before this script ran (unlikely with DOMContentLoaded)
     updateAnalyzeButtonState(); 

});

function showAnalysisError(message) {
    const analysisError = document.getElementById('log-analysis-error');
    if (analysisError) {
        analysisError.textContent = message;
        analysisError.style.display = 'block';
    }
     // Also clear any existing results
     const analysisResult = document.getElementById('log-analysis-result');
     if(analysisResult) analysisResult.textContent = '';
}

// Function to format and display analysis results with colorization
function displayAnalysisResult(analysisText) {
    const analysisResult = document.getElementById('log-analysis-result');
    if (!analysisResult) return;
    
    // Clear previous content
    analysisResult.innerHTML = '';
    
    // Format the analysis with colorization
    let formattedHtml = '';
    const lines = analysisText.split('\n');
    
    lines.forEach(line => {
        // Format section headers (numbered lists or headings)
        if (/^\d+\.\s+|^#+\s+/.test(line)) {
            formattedHtml += `<div class="analysis-header">${escapeHtml(line)}</div>`;
        }
        // Format lists
        else if (/^[-*•]\s+/.test(line)) {
            formattedHtml += `<div class="analysis-list-item">${formatAnalysisLine(line)}</div>`;
        }
        // Handle error highlights
        else if (/error|fail|exception|critical/i.test(line)) {
            formattedHtml += `<div class="analysis-error">${formatAnalysisLine(line)}</div>`;
        }
        // Handle success highlights
        else if (/success|passed|completed/i.test(line)) {
            formattedHtml += `<div class="analysis-success">${formatAnalysisLine(line)}</div>`;
        }
        // Handle warning highlights
        else if (/warning|caution|attention/i.test(line)) {
            formattedHtml += `<div class="analysis-warning">${formatAnalysisLine(line)}</div>`;
        }
        // Regular lines
        else {
            formattedHtml += `<div>${formatAnalysisLine(line)}</div>`;
        }
    });
    
    analysisResult.innerHTML = formattedHtml;
}

// Helper function to format individual lines with inline highlighting
function formatAnalysisLine(line) {
    let formatted = escapeHtml(line);
    
    // Highlight specific keywords inline
    formatted = formatted
        .replace(/(\b(?:error|exception|fail(?:ed|ure)?|fatal)\b)/gi, '<span class="highlight-error">$1</span>')
        .replace(/(\b(?:warning|warn|deprecated)\b)/gi, '<span class="highlight-warning">$1</span>')
        .replace(/(\b(?:success(?:ful)?|passed|completed)\b)/gi, '<span class="highlight-success">$1</span>')
        .replace(/(`[^`]+`)/g, '<code>$1</code>') // Format inline code
        .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" class="analysis-link">$1</a>'); // Make URLs clickable
    
    return formatted;
}

// Helper function to escape HTML special characters
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showAnalysisResults(analysis, logHash, buildResult, errorCount) {
    const resultsContainer = document.getElementById('analysisResults');
    if (resultsContainer) {
        // Convert markdown to HTML
        const converter = new showdown.Converter();
        const analysisHtml = converter.makeHtml(analysis);
        
        resultsContainer.innerHTML = `
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <h5 class="mb-0">Log Analysis Results</h5>
                </div>
                <div class="card-body">
                    ${analysisHtml}
                    <div class="mt-4 feedback-section">
                        <h6>Was this analysis helpful?</h6>
                        <div class="rating-container">
                            <div class="star-rating">
                                ${[1, 2, 3, 4, 5].map(num => 
                                    `<span class="rating-star" data-rating="${num}">★</span>`
                                ).join('')}
                            </div>
                            <div class="mt-2">
                                <textarea id="feedback-correction" class="form-control" 
                                    placeholder="Suggestions for improvement (optional)"></textarea>
                            </div>
                            <button id="submit-feedback" class="btn btn-sm btn-outline-primary mt-2">Submit Feedback</button>
                        </div>
                    </div>
                </div>
                <div class="card-footer">
                    <small class="text-muted">
                        Build result: <span class="badge ${buildResult === 'SUCCESS' ? 'bg-success' : buildResult === 'FAILURE' ? 'bg-danger' : 'bg-warning'}">${buildResult || 'Unknown'}</span>
                        ${errorCount !== undefined ? ` | Errors found: <span class="badge bg-${errorCount > 0 ? 'danger' : 'success'}">${errorCount}</span>` : ''}
                    </small>
                </div>
            </div>
        `;

        // Add click handlers for the rating stars
        const stars = document.querySelectorAll('.rating-star');
        stars.forEach(star => {
            star.addEventListener('click', function() {
                const rating = this.getAttribute('data-rating');
                
                // Reset all stars
                stars.forEach(s => s.classList.remove('active'));
                
                // Highlight stars up to the selected one
                for (let i = 0; i < rating; i++) {
                    stars[i].classList.add('active');
                }
                
                // Store the selected rating
                this.parentElement.setAttribute('data-selected-rating', rating);
            });
        });
        
        // Add click handler for the submit feedback button
        const submitBtn = document.getElementById('submit-feedback');
        if (submitBtn) {
            submitBtn.addEventListener('click', function() {
                const ratingContainer = document.querySelector('.star-rating');
                const rating = ratingContainer.getAttribute('data-selected-rating');
                const correction = document.getElementById('feedback-correction').value;
                
                if (!rating) {
                    alert('Please select a rating before submitting feedback.');
                    return;
                }
                
                // Send feedback to the server
                submitFeedback(logHash, parseInt(rating), correction);
            });
        }
    }
}

function submitFeedback(logHash, rating, correction) {
    const url = '/api/log-analysis/feedback';
    const csrfToken = getCsrfToken();
    
    // Show loading
    const submitBtn = document.getElementById('submit-feedback');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = 'Submitting...';
    }
    
    // Send feedback to server
    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
            log_hash: logHash,
            rating: rating,
            correction: correction
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Replace feedback section with thank you message
            const feedbackSection = document.querySelector('.feedback-section');
            if (feedbackSection) {
                feedbackSection.innerHTML = `
                    <div class="alert alert-success">
                        Thank you for your feedback! Your input helps improve the analyzer.
                    </div>
                `;
            }
        } else {
            alert('Failed to submit feedback: ' + (data.error || 'Unknown error'));
            // Re-enable button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Submit Feedback';
            }
        }
    })
    .catch(error => {
        console.error('Error submitting feedback:', error);
        alert('An error occurred while submitting feedback.');
        // Re-enable button
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Submit Feedback';
        }
    });
}

function analyzeLog() {
    const logContent = document.getElementById('logContent').value;
    if (!logContent) {
        alert('Please enter log content to analyze.');
        return;
    }
    
    const analysisResults = document.getElementById('analysisResults');
    analysisResults.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
    
    const url = '/api/analyze-log';
    const csrfToken = getCsrfToken();
    
    // Get job name and build number if available
    const jobName = document.getElementById('jobNameInput')?.value || '';
    const buildNumber = document.getElementById('buildNumberInput')?.value || '';
    
    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({
            log_content: logContent,
            job_name: jobName,
            build_number: buildNumber
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            analysisResults.innerHTML = `<div class="alert alert-danger">${data.error}</div>`;
        } else {
            showAnalysisResults(data.analysis, data.log_hash, data.build_result, data.error_count);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        analysisResults.innerHTML = `<div class="alert alert-danger">An error occurred while analyzing the log.</div>`;
    });
}
