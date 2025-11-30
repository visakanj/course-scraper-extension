/**
 * Thinkific Course Scraper - Utility Functions
 * Shared utilities for sleep, retry logic, DOM waiting, and URL parsing
 */

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.backoffMs - Initial backoff delay in milliseconds (default: 1000)
 * @param {number} options.backoffMultiplier - Backoff multiplier for exponential backoff (default: 2)
 * @param {Function} options.onRetry - Callback function called on each retry (optional)
 * @returns {Promise<any>} - Result of the operation
 * @throws {Error} - If operation fails after all retries
 */
async function retryOperation(operation, options = {}) {
    const {
        maxRetries = 3,
        backoffMs = 1000,
        backoffMultiplier = 2,
        onRetry = null
    } = options;

    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;

            if (attempt < maxRetries - 1) {
                const delay = backoffMs * Math.pow(backoffMultiplier, attempt);
                console.warn(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`, error.message);

                if (onRetry) {
                    onRetry(attempt, error);
                }

                await sleep(delay);
            }
        }
    }

    throw new Error(`Operation failed after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Wait for an element to appear in the DOM
 * @param {string|Array<string>} selector - CSS selector or array of selectors to try
 * @param {number} timeout - Maximum time to wait in milliseconds (default: 10000)
 * @param {Document|Element} context - DOM context to search within (default: document)
 * @returns {Promise<Element>} - The found element
 * @throws {Error} - If element not found within timeout
 */
async function waitForElement(selector, timeout = 10000, context = document) {
    const startTime = Date.now();
    const selectors = Array.isArray(selector) ? selector : [selector];

    while (Date.now() - startTime < timeout) {
        for (const sel of selectors) {
            try {
                const element = context.querySelector(sel);
                if (element) {
                    console.log(`[WaitForElement] Found element: ${sel}`);
                    return element;
                }
            } catch (error) {
                console.warn(`[WaitForElement] Invalid selector: ${sel}`, error);
            }
        }

        await sleep(100);
    }

    const selectorStr = selectors.join(', ');
    throw new Error(`Element not found after ${timeout}ms: ${selectorStr}`);
}

/**
 * Wait for navigation to complete
 * Uses multiple signals to detect when page has finished loading
 * @param {number} timeout - Maximum time to wait in milliseconds (default: 15000)
 * @returns {Promise<void>}
 */
async function waitForNavigation(timeout = 15000) {
    const startTime = Date.now();

    // Wait for document.readyState to be complete or interactive
    while (document.readyState === 'loading') {
        if (Date.now() - startTime > timeout) {
            throw new Error('Navigation timeout: document still loading');
        }
        await sleep(100);
    }

    // Additional wait for dynamic content
    await sleep(1000);

    console.log('[WaitForNavigation] Navigation complete');
}

/**
 * Extract filename from URL
 * @param {string} url - URL to extract filename from
 * @returns {string} - Extracted filename
 */
function extractFilename(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const filename = pathname.split('/').pop().split('?')[0];
        return decodeURIComponent(filename) || 'unknown';
    } catch (error) {
        console.warn('[ExtractFilename] Failed to parse URL:', url, error);
        return 'unknown';
    }
}

/**
 * Extract file extension from URL or filename
 * @param {string} url - URL or filename to extract extension from
 * @returns {string} - File extension (lowercase, without dot)
 */
function extractFileExtension(url) {
    const match = url.match(/\.([a-z0-9]+)(\?|#|$)/i);
    return match ? match[1].toLowerCase() : 'unknown';
}

/**
 * Check if URL points to a video file
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isVideoFile(url) {
    const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'm4v', 'flv', 'wmv'];
    const extension = extractFileExtension(url);
    return videoExtensions.includes(extension);
}

/**
 * Check if URL is from AWS S3
 * @param {string} url - URL to check
 * @returns {boolean}
 */
function isAwsS3Url(url) {
    return url.includes('amazonaws.com') || url.includes('s3.amazonaws.com');
}

/**
 * Log error with context
 * @param {string} context - Context description (e.g., "Lesson: Introduction")
 * @param {Error} error - Error object
 * @returns {Object} - Structured error object
 */
function logError(context, error) {
    const errorObj = {
        context: context,
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    };

    console.error(`[Error] ${context}:`, error);

    return errorObj;
}

/**
 * Navigate to URL and wait for page load
 * @param {string} url - URL to navigate to
 * @param {string|Array<string>} expectedSelector - Selector(s) to wait for after navigation
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<void>}
 */
async function navigateToUrl(url, expectedSelector, maxRetries = 3) {
    return retryOperation(
        async () => {
            console.log(`[Navigate] Going to: ${url}`);
            window.location.href = url;
            await waitForNavigation();

            // Verify expected element loaded
            if (expectedSelector) {
                await waitForElement(expectedSelector, 5000);
            }

            console.log('[Navigate] Navigation successful');
        },
        {
            maxRetries: maxRetries,
            backoffMs: 1000,
            onRetry: (attempt, error) => {
                console.warn(`[Navigate] Retry ${attempt + 1}: ${error.message}`);
            }
        }
    );
}

/**
 * Sanitize text content (remove extra whitespace, trim)
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
    if (!text) return '';
    return text
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .replace(/\n\s*\n/g, '\n')  // Remove empty lines
        .trim();
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sleep,
        retryOperation,
        waitForElement,
        waitForNavigation,
        extractFilename,
        extractFileExtension,
        isVideoFile,
        isAwsS3Url,
        logError,
        navigateToUrl,
        sanitizeText
    };
}
