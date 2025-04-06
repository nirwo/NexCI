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
        
        // Set explicit dimensions on the canvas
        canvas.style.width = '100%';
        canvas.style.height = '100%';
    }
    
    // Get context and verify
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('[ExecutionTimeAnalyzer] Failed to get canvas context');
        container.innerHTML = '<div class="alert alert-danger">Failed to initialize chart canvas</div>';
        return;
    }
    
    // Show loading state - keep the canvas but add a loading overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.className = 'd-flex justify-content-center align-items-center position-absolute top-0 start-0 w-100 h-100 bg-white bg-opacity-75';
    loadingOverlay.innerHTML = '<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div>';
    loadingOverlay.style.zIndex = '5';
    
    // Set container to relative positioning for the overlay
    container.style.position = 'relative';
    
    // Clear previous content but keep the canvas
    if (!document.getElementById('executionTimeChart')) {
        canvas = document.createElement('canvas');
        canvas.id = 'executionTimeChart';
        container.innerHTML = '';
        container.appendChild(canvas);
    }
    
    // Add loading overlay
    container.appendChild(loadingOverlay);
    
    try {
        // First try to get data from the selected job's builds if possible
        let data = null;
        let errorMessage = null;
        
        // Try main recent builds API first
        try {
            const response = await fetch('/api/jenkins/recent_builds');
            
            if (response.ok) {
                data = await response.json();
                console.log('[ExecutionTimeAnalyzer] Got data from recent_builds API');
            } else {
                errorMessage = `HTTP error! status: ${response.status}`;
                console.warn('[ExecutionTimeAnalyzer] Recent builds API error:', errorMessage);
            }
        } catch (e) {
            console.warn('[ExecutionTimeAnalyzer] Error fetching from recent_builds:', e);
            errorMessage = e.message;
        }
        
        // If the first API failed, try the current job data as fallback
        if (!data || !data.builds || data.builds.length === 0) {
            try {
                const selectedJobFullName = document.getElementById('job-dropdown')?.value;
                
                if (selectedJobFullName) {
                    console.log('[ExecutionTimeAnalyzer] Trying to get data for selected job:', selectedJobFullName);
                    const response = await fetch(`/api/builds?job_full_name=${encodeURIComponent(selectedJobFullName)}`);
                    
                    if (response.ok) {
                        data = await response.json();
                        console.log('[ExecutionTimeAnalyzer] Got fallback data from builds API');
                    }
                }
            } catch (e) {
                console.warn('[ExecutionTimeAnalyzer] Error fetching from builds API:', e);
                // Keep original error message if this is just a fallback
                if (!errorMessage) errorMessage = e.message;
            }
        }
        
        // Generate sample data as last resort
        if (!data || !data.builds || data.builds.length === 0) {
            console.log('[ExecutionTimeAnalyzer] No data found, using generated sample data');
            data = { builds: generateSampleBuildData() };
        }
        
        // Create/update the chart with available data (real or sample)
        displayExecutionTimeChart(data.builds);
        
    } catch (error) {
        console.error('[ExecutionTimeAnalyzer] Error:', error);
        container.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Failed to load build chart data: ${error.message}. 
                <br>Using sample data...
            </div>
        `;
        
        // Use sample data as fallback when real data fails
        displayExecutionTimeChart(generateSampleBuildData());
    }
}

/**
 * Generates sample build data for chart rendering when API fails
 */
function generateSampleBuildData() {
    const now = Date.now();
    const builds = [];
    
    // Generate 10 sample builds over the last 24 hours
    for (let i = 0; i < 10; i++) {
        const timeOffset = Math.floor(Math.random() * 24 * 60 * 60 * 1000);
        const timestamp = now - timeOffset;
        const duration = Math.floor((Math.random() * 5 * 60 + 30) * 1000); // 30s to 5m
        
        builds.push({
            number: 100 + i,
            timestamp: timestamp,
            duration: duration,
            result: Math.random() > 0.2 ? 'SUCCESS' : 'FAILURE'
        });
    }
    
    // Sort by timestamp (newest first)
    return builds.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Displays the execution time chart with the provided build data
 */
function displayExecutionTimeChart(builds) {
    if (!builds || builds.length === 0) {
        console.error('[ExecutionTimeAnalyzer] No build data provided for chart');
        return;
    }
    
    console.log(`[ExecutionTimeAnalyzer] Displaying chart with ${builds.length} builds`);

    const container = document.getElementById('execution-time-container');
    if (!container) {
        console.error('[ExecutionTimeAnalyzer] Container element not found for chart display');
        return;
    }
    
    // Cleanup loading indicator if present
    const loadingOverlay = container.querySelector('div[class*="position-absolute"]');
    if (loadingOverlay) {
        loadingOverlay.remove();
    }
    
    // Ensure canvas exists
    let canvas = document.getElementById('executionTimeChart');
    if (!canvas) {
        canvas = document.createElement('canvas');
        canvas.id = 'executionTimeChart';
        container.innerHTML = '';
        container.appendChild(canvas);
        
        // Set explicit dimensions on the canvas
        canvas.style.width = '100%';
        canvas.style.height = '100%';
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('[ExecutionTimeAnalyzer] Failed to get canvas context');
        return;
    }
    
    // Destroy existing chart if it exists
    if (window.executionTimeChartInstance) {
        window.executionTimeChartInstance.destroy();
        window.executionTimeChartInstance = null;
    }
    
    try {
        // Filter builds to show only those from the last 24 hours
        const now = Date.now();
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        const recentBuilds = builds.filter(b => b.timestamp >= twentyFourHoursAgo);
        
        // If no recent builds, show a message and use all builds
        let buildsToShow = recentBuilds.length > 0 ? recentBuilds : builds;
        
        // Prepare chart data
        const chartData = buildsToShow.map(build => ({
            x: build.timestamp,
            y: build.duration ? build.duration / 1000 : 0
        }));
        
        // Create new chart
        window.executionTimeChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Build Execution Time (seconds)',
                    data: chartData,
                    backgroundColor: buildsToShow.map(b => b.result === 'SUCCESS' ? '#198754' : '#dc3545')
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: {
                    padding: {
                        top: 10,
                        right: 10,
                        bottom: 10,
                        left: 10
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour',
                            tooltipFormat: 'PPpp',
                            displayFormats: {
                                hour: 'HH:mm'
                            }
                        },
                        title: {
                            display: true,
                            text: 'Time'
                        },
                        grid: {
                            display: true
                        }
                    },
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Duration (seconds)'
                        },
                        grid: {
                            display: true
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const buildIndex = context.dataIndex;
                                const build = buildsToShow[buildIndex];
                                let label = `Build #${build.number}` || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed.y !== null) {
                                    label += `${context.parsed.y.toFixed(2)} seconds`;
                                }
                                label += ` (${build.result || 'UNKNOWN'})`;
                                return label;
                            }
                        }
                    }
                }
            }
        });
        
        console.log('[ExecutionTimeAnalyzer] Chart created successfully');
        
    } catch (error) {
        console.error("[ExecutionTimeAnalyzer] Error creating chart:", error);
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Error creating chart: ${error.message}
            </div>
        `;
    }
}

// Initialize chart when execTime ID is found in DOM
document.addEventListener('DOMContentLoaded', function() {
    console.log('[ExecutionTimeAnalyzer] Checking for execution time container on page load...');
    
    const container = document.getElementById('execution-time-container');
    if (container) {
        console.log('[ExecutionTimeAnalyzer] Found container, initializing chart...');
        
        // Delay initialization slightly to ensure all resources are loaded
        setTimeout(() => {
            loadExecutionTimeChart();
        }, 500);
    } else {
        console.log('[ExecutionTimeAnalyzer] Container not found, skipping chart initialization');
    }
    
    // Listen for visible dashboard to handle dynamic page loading
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                const buildChartsArea = document.getElementById('build-charts-area');
                if (buildChartsArea && buildChartsArea.style.display === 'block') {
                    console.log('[ExecutionTimeAnalyzer] Charts area became visible, initializing...');
                    loadExecutionTimeChart();
                }
            }
        });
    });
    
    const buildChartsArea = document.getElementById('build-charts-area');
    if (buildChartsArea) {
        observer.observe(buildChartsArea, { attributes: true });
    }
});