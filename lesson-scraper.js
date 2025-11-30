/**
 * Thinkific Course Scraper - Lesson Scraper
 * Extracts content from individual lesson pages
 *
 * This script is injected into lesson pages to extract:
 * - Text/HTML content from iframes
 * - Video metadata (URLs, providers, IDs)
 * - Downloadable file links
 */

/**
 * Main function to scrape lesson content
 * This is called from the main page context
 * @param {Object} lessonData - Lesson metadata (title, type, url)
 * @returns {Promise<Object>} Extracted lesson content
 */
async function scrapeLessonContent(lessonData) {
    console.log(`[LessonScraper] Scraping lesson: ${lessonData.title}`);

    try {
        const content = {
            ...lessonData,
            scrapedAt: new Date().toISOString(),
            content: null,
            error: null
        };

        // Wait for lesson page to load
        await waitForNavigation();
        await sleep(2000); // Extra wait for dynamic content

        // Route to appropriate extractor based on lesson type
        switch (lessonData.type) {
            case 'video':
                content.content = await extractVideoContent();
                break;

            case 'text':
                content.content = await extractTextContent();
                break;

            case 'download':
                content.content = await extractDownloadContent();
                break;

            case 'quiz':
                content.content = await extractQuizContent();
                break;

            default:
                // Unknown type - try all extractors
                content.content = await extractAllContent();
                break;
        }

        console.log(`[LessonScraper] Successfully scraped: ${lessonData.title}`);
        return content;

    } catch (error) {
        console.error(`[LessonScraper] Error scraping lesson:`, error);
        return {
            ...lessonData,
            scrapedAt: new Date().toISOString(),
            content: null,
            error: error.message
        };
    }
}

/**
 * Extract text/HTML content from lesson
 * @returns {Promise<Object>} Text content data
 */
async function extractTextContent() {
    console.log('[LessonScraper] Extracting text content...');

    const textData = {
        type: 'text',
        html: null,
        plainText: null
    };

    try {
        // Wait for iframe to appear
        const iframe = await waitForElement(SELECTORS.iframe, 10000).catch(() => null);

        if (iframe) {
            console.log('[LessonScraper] Iframe found, extracting content from iframe...');

            // Try to access iframe content directly (will fail if cross-origin)
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (iframeDoc) {
                    const textElement = findElement(SELECTORS.iframeTextContent, iframeDoc);
                    if (textElement) {
                        textData.html = textElement.innerHTML;
                        textData.plainText = textElement.innerText || textElement.textContent;
                    }
                }
            } catch (crossOriginError) {
                console.warn('[LessonScraper] Cross-origin iframe access blocked:', crossOriginError.message);
                // This is expected - iframe injection will be handled by popup.js using allFrames
                textData.error = 'Cross-origin iframe - content extraction requires allFrames injection';
            }
        }

        // Fallback: check main page for content
        if (!textData.html) {
            console.log('[LessonScraper] Checking main page for text content...');
            const mainContent = findElement(SELECTORS.iframeTextContent);
            if (mainContent) {
                textData.html = mainContent.innerHTML;
                textData.plainText = mainContent.innerText || mainContent.textContent;
                textData.source = 'main_page';
            }
        }

        // Sanitize text content
        if (textData.plainText) {
            textData.plainText = sanitizeText(textData.plainText);
        }

        return textData;

    } catch (error) {
        console.error('[LessonScraper] Error extracting text content:', error);
        return {
            ...textData,
            error: error.message
        };
    }
}

/**
 * Extract content from iframe context
 * This function is meant to be injected into the iframe using allFrames: true
 * @returns {Object} Iframe content
 */
function extractFromIframe() {
    console.log('[IframeScraper] Running inside iframe context');

    try {
        const textElement = findElement(SELECTORS.iframeTextContent);

        if (textElement) {
            return {
                html: textElement.innerHTML,
                plainText: textElement.innerText || textElement.textContent,
                location: window.location.href,
                extractedInIframe: true
            };
        }

        return {
            html: null,
            plainText: null,
            error: 'Text content element not found in iframe',
            extractedInIframe: true
        };

    } catch (error) {
        return {
            html: null,
            plainText: null,
            error: error.message,
            extractedInIframe: true
        };
    }
}

/**
 * Extract video metadata
 * @returns {Promise<Object>} Video metadata
 */
async function extractVideoContent() {
    console.log('[LessonScraper] Extracting video content...');

    const videoData = {
        type: 'video',
        sources: [],
        provider: null,
        embedUrl: null,
        videoId: null,
        thumbnail: null
    };

    try {
        // Strategy 1: HTML5 video element
        const videoElement = findElement(SELECTORS.videoPlayer);

        if (videoElement && videoElement.tagName === 'VIDEO') {
            console.log('[LessonScraper] Found HTML5 video element');

            const sources = videoElement.querySelectorAll('source');
            if (sources.length > 0) {
                sources.forEach(source => {
                    videoData.sources.push({
                        url: source.src,
                        type: source.type || 'unknown'
                    });
                });
            } else if (videoElement.src) {
                videoData.sources.push({
                    url: videoElement.src,
                    type: 'unknown'
                });
            }

            if (videoElement.poster) {
                videoData.thumbnail = videoElement.poster;
            }

            videoData.provider = 'html5';
        }

        // Strategy 2: Embedded video iframes (Vimeo, YouTube, Wistia)
        const videoIframe = document.querySelector('iframe[src*="vimeo"], iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[src*="wistia"]');
        if (videoIframe) {
            const src = videoIframe.src;
            console.log('[LessonScraper] Found video iframe:', src);

            videoData.embedUrl = src;
            videoData.provider = detectVideoProvider(src);
            videoData.videoId = extractVideoId(src, videoData.provider);

            videoData.sources.push({
                url: src,
                type: 'embed',
                provider: videoData.provider
            });
        }

        // Strategy 3: Check for video URLs in data attributes
        const elementsWithVideoData = document.querySelectorAll('[data-video-url], [data-video-src], [data-video-id]');
        elementsWithVideoData.forEach(element => {
            const videoUrl = element.getAttribute('data-video-url') ||
                           element.getAttribute('data-video-src');
            if (videoUrl) {
                videoData.sources.push({
                    url: videoUrl,
                    type: 'data-attribute'
                });
            }
        });

        // Strategy 4: Scan for AWS S3 video URLs in links
        const allLinks = document.querySelectorAll('a[href], source[src], video[src]');
        allLinks.forEach(link => {
            const url = link.href || link.src;
            if (url && isAwsS3Url(url) && isVideoFile(url)) {
                console.log('[LessonScraper] Found AWS S3 video URL:', url);
                videoData.sources.push({
                    url: url,
                    type: 'aws-s3',
                    filename: extractFilename(url)
                });
            }
        });

        // Remove duplicates
        videoData.sources = removeDuplicateSources(videoData.sources);

        return videoData;

    } catch (error) {
        console.error('[LessonScraper] Error extracting video content:', error);
        return {
            ...videoData,
            error: error.message
        };
    }
}

/**
 * Extract downloadable file links
 * @returns {Promise<Object>} Download links data
 */
async function extractDownloadContent() {
    console.log('[LessonScraper] Extracting download content...');

    const downloadData = {
        type: 'download',
        files: []
    };

    try {
        const downloadLinks = findElements(SELECTORS.downloadLinks);
        console.log(`[LessonScraper] Found ${downloadLinks.length} download links`);

        downloadLinks.forEach(link => {
            const url = link.href;
            if (url && url.startsWith('http')) {
                downloadData.files.push({
                    url: url,
                    filename: link.download || extractFilename(url),
                    fileType: extractFileExtension(url),
                    linkText: link.textContent?.trim() || '',
                    isAwsS3: isAwsS3Url(url)
                });
            }
        });

        // Remove duplicates
        downloadData.files = removeDuplicateFiles(downloadData.files);

        return downloadData;

    } catch (error) {
        console.error('[LessonScraper] Error extracting download content:', error);
        return {
            ...downloadData,
            error: error.message
        };
    }
}

/**
 * Extract quiz content (basic - just detects presence)
 * @returns {Promise<Object>} Quiz data
 */
async function extractQuizContent() {
    console.log('[LessonScraper] Quiz content extraction not fully implemented');

    return {
        type: 'quiz',
        message: 'Quiz content extraction not implemented',
        pageUrl: window.location.href
    };
}

/**
 * Extract all content types (when type is unknown)
 * @returns {Promise<Object>} All extracted content
 */
async function extractAllContent() {
    console.log('[LessonScraper] Extracting all content types...');

    const [textContent, videoContent, downloadContent] = await Promise.all([
        extractTextContent(),
        extractVideoContent(),
        extractDownloadContent()
    ]);

    return {
        text: textContent,
        video: videoContent,
        downloads: downloadContent
    };
}

/**
 * Detect video provider from URL
 * @param {string} url - Video URL
 * @returns {string} Provider name
 */
function detectVideoProvider(url) {
    if (!url) return 'unknown';

    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('vimeo.com')) return 'vimeo';
    if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) return 'youtube';
    if (lowerUrl.includes('wistia')) return 'wistia';
    if (lowerUrl.includes('amazonaws.com')) return 'aws-s3';

    return 'unknown';
}

/**
 * Extract video ID from URL based on provider
 * @param {string} url - Video URL
 * @param {string} provider - Video provider
 * @returns {string|null} Video ID
 */
function extractVideoId(url, provider) {
    if (!url) return null;

    try {
        switch (provider) {
            case 'vimeo':
                // Vimeo: /video/123456 or /123456
                const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
                return vimeoMatch ? vimeoMatch[1] : null;

            case 'youtube':
                // YouTube: v=abc123 or /embed/abc123 or youtu.be/abc123
                const youtubeMatch = url.match(/(?:v=|\/embed\/|youtu\.be\/)([^&?\/]+)/);
                return youtubeMatch ? youtubeMatch[1] : null;

            case 'wistia':
                // Wistia: various formats
                const wistiaMatch = url.match(/wistia\.com\/medias\/([^?\/]+)/);
                return wistiaMatch ? wistiaMatch[1] : null;

            default:
                return null;
        }
    } catch (error) {
        console.warn('[LessonScraper] Error extracting video ID:', error);
        return null;
    }
}

/**
 * Remove duplicate video sources
 * @param {Array} sources - Array of source objects
 * @returns {Array} Deduplicated sources
 */
function removeDuplicateSources(sources) {
    const seen = new Set();
    return sources.filter(source => {
        if (seen.has(source.url)) {
            return false;
        }
        seen.add(source.url);
        return true;
    });
}

/**
 * Remove duplicate files
 * @param {Array} files - Array of file objects
 * @returns {Array} Deduplicated files
 */
function removeDuplicateFiles(files) {
    const seen = new Set();
    return files.filter(file => {
        if (seen.has(file.url)) {
            return false;
        }
        seen.add(file.url);
        return true;
    });
}

/**
 * Check if we're on a lesson page
 * @returns {boolean}
 */
function isOnLessonPage() {
    const hasLessonElement = findElement(SELECTORS.lessonPage) !== null;
    const hasIframe = findElement(SELECTORS.iframe) !== null;
    const urlIndicatesLesson = window.location.href.includes('lesson') ||
                               window.location.href.includes('/learn/');

    return hasLessonElement || hasIframe || urlIndicatesLesson;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        scrapeLessonContent,
        extractTextContent,
        extractVideoContent,
        extractDownloadContent,
        extractFromIframe,
        isOnLessonPage
    };
}
