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
    const container = document.getElementById('execution-time-container');
    
    if (!container) {
        console.error('[ExecutionTimeAnalyzer] Container element not found!');
        return;
    }
    
    // Show loading state
    container.innerHTML = '<div class="d-flex justify-content-center align-items-center" style="height: 200px;"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div></div>';
    
    try {
        // Call our new API endpoint to get recent builds data
        const response = await fetch('/api/jenkins/recent_builds');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
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
    
    // Create canvas element if it doesn't exist
    let canvas = document.getElementById('executionTimeChart');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'executionTimeChart';
        container.innerHTML = '';
        container.appendChild(canvas);
    }
    
    // Get context
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('[ExecutionTimeAnalyzer] Failed to get canvas context');
        return;
    }
    
    // Destroy existing chart instance if it exists
    if (window.executionTimeChartInstance) {
        window.executionTimeChartInstance.destroy();
    }
    
    // Format data for the chart
    const chartData = builds.map(build => ({
        x: build.timestamp, // Timestamp as x
        y: build.duration ? build.duration / 1000 : 0 // Duration in seconds as y
    }));
    
    // Create the chart
    window.executionTimeChartInstance = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Build Execution Time (seconds)',
                data: chartData,
                backgroundColor: builds.map(b => b.result === 'SUCCESS' ? '#198754' : '#dc3545') // Color by result
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour',
                        tooltipFormat: 'MMM d, yyyy HH:mm', // Format for tooltip
                        displayFormats: {
                            hour: 'HH:mm' // Display format for the axis labels
                        }
                    },
                    title: {
                        display: true,
                        text: 'Time'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Duration (seconds)'
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const buildIndex = context.dataIndex;
                            const build = builds[buildIndex]; // Find corresponding build
                            let label = `${build.job} #${build.number}` || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += `${context.parsed.y.toFixed(2)} seconds`;
                            }
                            label += ` (${build.result})`;
                            return label;
                        }
                    }
                }
            }
        }
    });
    
    console.log('[ExecutionTimeAnalyzer] Chart displayed successfully');
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
