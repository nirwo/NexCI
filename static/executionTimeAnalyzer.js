// Execution Time Analyzer module

// Global chart instance for execution time data - use window object to avoid redeclaration issues
if (typeof window.executionTimeChartInstance === 'undefined') {
    window.executionTimeChartInstance = null;
}

/**
 * Fetches recent builds data and displays the execution time chart
 */
async function loadExecutionTimeChart() {
    console.log('[ExecutionTimeAnalyzer] Loading execution time data...');
    
    // First verify container exists
    const container = document.getElementById('execution-time-container');
    if (!container) {
        console.error('[ExecutionTimeAnalyzer] Container element not found!');
        return;
    }
    
    // Verify canvas exists or create it
    let canvas = document.getElementById('executionTimeChart');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'executionTimeChart';
        container.innerHTML = '';
        container.appendChild(canvas);
    }
    
    // Get context and verify
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('[ExecutionTimeAnalyzer] Failed to get canvas context');
        container.innerHTML = '<div class="alert alert-danger">Failed to initialize chart canvas</div>';
        return;
    }
    
    // Show loading state
    container.innerHTML = '<div class="d-flex justify-content-center align-items-center" style="height: 200px;"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    try {
        // Call our new API endpoint to get recent builds data
        const response = await fetch('/api/jenkins/recent_builds');
        
        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            
            // Try to get error details from response
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorData.message || errorMessage;
            } catch (e) {
                console.error('Failed to parse error response:', e);
            }
            
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        if (!data.builds || data.builds.length === 0) {
            container.innerHTML = '<div class="alert alert-info">No build data available for the last 24 hours.</div>';
            return;
        }
        
        // Create/update the chart
        displayExecutionTimeChart(data.builds);
        
    } catch (error) {
        console.error('[ExecutionTimeAnalyzer] Error fetching execution time data:', error);
        
        // Show a more detailed error message
        let errorMessage = 'An unexpected error occurred';
        
        if (error.message) {
            errorMessage = error.message;
        }
        
        // Check if it's a network error (like CORS or connection issues)
        if (error.name === 'TypeError' && error.message.includes('NetworkError')) {
            errorMessage = 'Network error - please check Jenkins connection';
        }
        
        // For 404 errors, be more specific
        if (error.message && error.message.includes('404')) {
            errorMessage = 'API endpoint not found - check server configuration';
        }
        
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                <strong>Error loading execution time data:</strong> ${errorMessage}
                <p class="small mt-2">Please check your Jenkins connection and ensure the server is configured correctly.</p>
            </div>`;
    }
}

/**
 * Renders the execution time chart with build data
 */
function displayExecutionTimeChart(builds) {
    const container = document.getElementById('execution-time-container');
    const ctx = document.getElementById('executionTimeChart');
    
    if (!ctx) {
        console.error('[ExecutionTimeAnalyzer] Chart canvas element not found!');
        return;
    }
    
    // Destroy existing chart instance if it exists
    if (window.executionTimeChartInstance) {
        try {
            window.executionTimeChartInstance.destroy();
        } catch (e) {
            console.error('[ExecutionTimeAnalyzer] Error destroying existing chart:', e);
        }
        window.executionTimeChartInstance = null;
    }
    
    // Clear any previous error messages
    const errorElement = container.querySelector('.alert-danger');
    if (errorElement) errorElement.remove();
    
    // Create the chart
    try {
        window.executionTimeChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Build Duration (ms)',
                    data: builds.map(build => ({
                        x: new Date(build.timestamp),
                        y: build.duration
                    })),
                    backgroundColor: builds.map(build => 
                        build.result === 'SUCCESS' ? '#28a745' : 
                        build.result === 'FAILURE' ? '#dc3545' : '#ffc107'
                    )
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour'
                        },
                        title: {
                            display: true,
                            text: 'Build Time'
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Duration (ms)'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('[ExecutionTimeAnalyzer] Error creating chart:', error);
        container.innerHTML += `
            <div class="alert alert-danger mt-3">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Error creating chart: ${error.message}
            </div>`;
    }
}

// Initialize execution time analyzer when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('[ExecutionTimeAnalyzer] Initializing...');
    
    // Load execution time chart on page load
    if (document.getElementById('execution-time-container')) {
        loadExecutionTimeChart();
        
        // Set up auto-refresh every 5 minutes
        setInterval(loadExecutionTimeChart, 5 * 60 * 1000);
        
        // Add refresh button event handler if exists
        const refreshBtn = document.getElementById('refresh-dashboard');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', loadExecutionTimeChart);
        }
    }
});
