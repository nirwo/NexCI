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
                    // Add CSRF token header if needed (depending on Flask-WTF setup)
                    // 'X-CSRFToken': getCsrfToken() 
                },
                body: JSON.stringify({ log_content: logContent })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }

            if (data.analysis) {
                analysisResult.textContent = data.analysis;
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

// Helper to get CSRF token if needed (implement based on your Flask-WTF setup)
// function getCsrfToken() {
//     const token = document.querySelector('meta[name="csrf-token"]');
//     return token ? token.getAttribute('content') : null;
// }
