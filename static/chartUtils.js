// --- Chart Rendering Functions ---

// Chart instances (scoped to this module)
let buildSuccessChartInstance = null;
let durationTrendChartInstance = null;
let executionTimeChartInstance = null;

// Fetch build insights (used by charts)
async function fetchBuildInsightsData(jobFullName) {
    console.log("[DEBUG] Fetching build insights for charts...");
    try {
        const response = await fetch(`/api/builds?job_full_name=${encodeURIComponent(jobFullName)}`);
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        const data = await response.json();
        console.log("[DEBUG] Build insights data received:", data);
        return data.builds || []; // Return builds array or empty array
    } catch (error) {
        console.error('Error fetching build insights:', error);
        showError(`Failed to load build chart data: ${error.message}`, 'build-charts'); // Assuming an error element with id 'build-charts-error'
        return []; // Return empty array on error
    }
}

// Renders all build-related charts
async function renderBuildCharts(jobFullName) {
    const builds = await fetchBuildInsightsData(jobFullName);
    const buildChartsArea = getElement('build-charts-area');

    if (buildChartsArea) {
         buildChartsArea.style.display = builds && builds.length > 0 ? 'block' : 'none';
    }

    if (!builds || builds.length === 0) {
        console.log("[DEBUG] No build data available to render charts.");
        // Optionally hide chart containers or show a message
        return;
    }

    renderSuccessRateChart(builds);
    renderDurationTrendChart(builds);
    renderExecutionTimeChart(builds);
}

// Render Build Success Rate Chart
function renderSuccessRateChart(builds) {
    const ctx = getElement('buildSuccessChart')?.getContext('2d');
    if (!ctx) return;

    if (buildSuccessChartInstance) {
        buildSuccessChartInstance.destroy();
    }

    const successfulBuilds = builds.filter(b => b.result === 'SUCCESS').length;
    const failedBuilds = builds.length - successfulBuilds; // Includes FAILURE, ABORTED, UNSTABLE etc.

    buildSuccessChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Successful', 'Failed/Other'],
            datasets: [{
                data: [successfulBuilds, failedBuilds],
                backgroundColor: ['#198754', '#dc3545'],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true, // Changed to true
            plugins: {
                legend: {
                    position: 'top',
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed !== null) {
                                label += context.parsed;
                            }
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.parsed / total) * 100).toFixed(1) + '%' : '0%';
                            label += ` (${percentage})`;
                            return label;
                        }
                    }
                }
            }
        }
    });
}


// Render Build Duration Trend Chart
function renderDurationTrendChart(builds) {
    const ctx = getElement('durationTrendChart')?.getContext('2d');
    if (!ctx) return;

    if (durationTrendChartInstance) {
        durationTrendChartInstance.destroy();
    }

    // Sort builds by number ascending for the chart
    const sortedBuilds = [...builds].sort((a, b) => a.number - b.number);

    durationTrendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedBuilds.map(b => `#${b.number}`),
            datasets: [{
                label: 'Build Duration (seconds)',
                data: sortedBuilds.map(b => b.duration ? (b.duration / 1000).toFixed(2) : 0),
                borderColor: '#0d6efd',
                tension: 0.1,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true, // Changed to true
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Duration (seconds)'
                    }
                },
                 x: {
                    title: {
                        display: true,
                        text: 'Build Number'
                    }
                }
            }
        }
    });
}

// Render 24-Hour Build Execution Times Chart
function renderExecutionTimeChart(builds) {
    const container = getElement('execution-time-container');
    const canvas = getElement('executionTimeChart');
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
     if (!ctx) return;

    if (executionTimeChartInstance) {
        executionTimeChartInstance.destroy();
    }

    try {
        // Filter builds within the last 24 hours and prepare data
        const now = Date.now();
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
        const recentBuilds = builds.filter(b => b.timestamp >= twentyFourHoursAgo);

        if (recentBuilds.length === 0) {
             container.innerHTML = '<div class="alert alert-info">No builds in the last 24 hours.</div>';
             return;
        }
        // Ensure canvas is visible before creating chart
        container.innerHTML = '';
        container.appendChild(canvas);

        const chartData = recentBuilds.map(build => ({
            x: build.timestamp, // Timestamp as x
            y: build.duration ? build.duration / 1000 : 0 // Duration in seconds as y
        })); //.sort((a, b) => a.x - b.x); // Ensure data is sorted by time

        executionTimeChartInstance = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'Build Execution Time (seconds)',
                    data: chartData,
                    backgroundColor: recentBuilds.map(b => b.result === 'SUCCESS' ? '#198754' : '#dc3545') // Color by result
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
                             tooltipFormat: 'PPpp', // Example: Sep 4, 2023, 1:55:00 PM
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
                                 const build = recentBuilds[buildIndex]; // Find corresponding build
                                 let label = `Build #${build.number}` || '';
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

    } catch (error) {
        console.error("Error creating execution time chart:", error);
        container.innerHTML = '<div class="alert alert-danger">Error creating chart: ' + error.message + '</div>';
    }
}
