// Simple test version to debug extension loading
document.addEventListener('DOMContentLoaded', function() {
    console.log('TEST: Popup script loaded');

    const startButton = document.getElementById('startScrapeBtn');
    const statusDiv = document.getElementById('status');

    if (!startButton) {
        console.error('TEST: Start button not found!');
        alert('Start button not found!');
        return;
    }

    if (!statusDiv) {
        console.error('TEST: Status div not found!');
        alert('Status div not found!');
        return;
    }

    console.log('TEST: Elements found successfully');
    statusDiv.textContent = 'Extension loaded. Click button to test.';

    startButton.addEventListener('click', function() {
        console.log('TEST: Button clicked!');
        statusDiv.textContent = 'Button click detected!';

        // Test Chrome APIs
        if (typeof chrome === 'undefined') {
            statusDiv.textContent = 'ERROR: Chrome object not available';
            return;
        }

        if (!chrome.tabs) {
            statusDiv.textContent = 'ERROR: chrome.tabs not available';
            return;
        }

        statusDiv.textContent = 'Chrome APIs available!';

        // Test getting active tab
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (chrome.runtime.lastError) {
                statusDiv.textContent = 'ERROR: ' + chrome.runtime.lastError.message;
                return;
            }

            if (tabs.length === 0) {
                statusDiv.textContent = 'ERROR: No active tab found';
                return;
            }

            const tab = tabs[0];
            statusDiv.textContent = `SUCCESS: Found tab: ${tab.url}`;
        });
    });
});