// Test script for log analysis functionality
// You can run this in the browser console when logged in

function testLogAnalysis() {
    console.log("Testing log analysis functionality...");
    
    // Sample log content with various message types
    const sampleLog = `
[2025-04-01 14:23:01] Starting build #4217
[2025-04-01 14:23:03] Cloning repository from https://github.com/org/repo.git
[2025-04-01 14:23:15] SUCCESS: Repository cloned successfully
[2025-04-01 14:23:20] Running npm install
[2025-04-01 14:23:45] WARNING: Package xyz is deprecated and will be removed in future versions
[2025-04-01 14:24:02] Running tests...
[2025-04-01 14:24:30] ERROR: Test case login_user_with_invalid_credentials failed
[2025-04-01 14:24:31] Stack trace: TypeError: Cannot read property 'status' of undefined
[2025-04-01 14:24:45] 12 tests passed, 1 failed, 0 skipped
[2025-04-01 14:24:50] Building distribution package
[2025-04-01 14:25:10] SUCCESS: Build completed
[2025-04-01 14:25:15] Uploading artifacts
[2025-04-01 14:25:30] Build finished with status: UNSTABLE
`;

    // Get CSRF token from meta tag (assuming it's in your HTML)
    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    
    // Elements for displaying test results
    let testResultContainer = document.getElementById('test-log-analysis-result');
    if (!testResultContainer) {
        testResultContainer = document.createElement('div');
        testResultContainer.id = 'test-log-analysis-result';
        testResultContainer.className = 'mt-4 p-3 border rounded';
        testResultContainer.innerHTML = '<h5>Log Analysis Test</h5><div id="test-status"></div><div id="test-output"></div>';
        document.querySelector('.container').appendChild(testResultContainer);
    }
    
    const testStatus = document.getElementById('test-status');
    const testOutput = document.getElementById('test-output');
    
    testStatus.innerHTML = '<div class="text-info"><i class="fas fa-spinner fa-spin"></i> Testing log analysis API...</div>';
    
    // Make API request with CSRF token
    fetch('/api/analyze-log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': csrfToken
        },
        body: JSON.stringify({ log_content: sampleLog })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log("API Response:", data);
        testStatus.innerHTML = '<div class="text-success"><i class="fas fa-check-circle"></i> Test completed successfully!</div>';
        
        // If the analysis function exists, use it to display the result
        if (typeof displayAnalysisResult === 'function') {
            displayAnalysisResult(data.analysis);
            testOutput.innerHTML = '<div class="mt-2 mb-2">Analysis displayed above using the actual formatter.</div>';
        } else {
            // Fallback display
            testOutput.innerHTML = `
                <div class="mt-2 p-2 bg-light">
                    <h6>Raw API Response:</h6>
                    <pre>${JSON.stringify(data, null, 2)}</pre>
                </div>
            `;
        }
    })
    .catch(error => {
        console.error("Error testing log analysis:", error);
        testStatus.innerHTML = `<div class="text-danger"><i class="fas fa-exclamation-circle"></i> Test failed: ${error.message}</div>`;
    });
}

// Export for console use
window.testLogAnalysis = testLogAnalysis;

console.log("Log analysis test script loaded. Run testLogAnalysis() to test the functionality.");
