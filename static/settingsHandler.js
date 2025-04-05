document.addEventListener('DOMContentLoaded', function() {
    const timelineIgnoreListTextArea = document.getElementById('timeline-ignore-list');

    // --- Local Storage Keys ---
    const TIMELINE_IGNORE_LIST_KEY = 'timelineIgnoreList';

    // --- Load Settings ---
    function loadSettings() {
        // Load Timeline Ignore List
        const savedIgnoreList = localStorage.getItem(TIMELINE_IGNORE_LIST_KEY);
        if (savedIgnoreList && timelineIgnoreListTextArea) {
            timelineIgnoreListTextArea.value = savedIgnoreList;
        }
    }

    // --- Save Settings ---
    function saveTimelineIgnoreList() {
        if (timelineIgnoreListTextArea) {
            const ignoreListValue = timelineIgnoreListTextArea.value;
            localStorage.setItem(TIMELINE_IGNORE_LIST_KEY, ignoreListValue);
            console.log('Timeline ignore list saved.'); // Optional: Add feedback
            // Add a visual feedback if desired (e.g., a temporary "Saved!" message)
        } else {
            console.warn('Timeline ignore list textarea not found for saving.');
        }
    }

    // --- Event Listeners ---
    if (timelineIgnoreListTextArea) {
        // Save on blur (when the user clicks away)
        timelineIgnoreListTextArea.addEventListener('blur', saveTimelineIgnoreList);
        // Consider adding a dedicated "Save" button if blur feels too implicit
    } else {
        console.warn('Timeline ignore list textarea element not found on page load.');
    }

    // --- Initial Load ---
    // Ensure this runs only on the settings page
    if (window.location.pathname.includes('/settings')) {
        loadSettings();
    }
});
