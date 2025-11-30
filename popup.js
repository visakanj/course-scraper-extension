/**
 * Thinkific Course Scraper - Popup Controller
 * Simplified single-injection approach with fallback selectors
 */

document.addEventListener('DOMContentLoaded', function() {
    console.log('[Popup] Initializing...');

    const startButton = document.getElementById('startBtn');
    const statusDiv = document.getElementById('status');

    if (!startButton) {
        console.error('[Popup] Start button not found!');
        return;
    }

    if (!statusDiv) {
        console.error('[Popup] Status div not found!');
        return;
    }

    statusDiv.textContent = 'Ready to start scraping.';

    startButton.addEventListener('click', async function() {
        console.log('[Popup] Button clicked!');

        try {
            // Update status
            statusDiv.textContent = 'Initializing scraper... Please wait.';
            startButton.disabled = true;

            // Get active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab) {
                throw new Error('No active tab found');
            }

            if (!tab.url.includes('thinkific')) {
                throw new Error('Please navigate to a Thinkific course page first');
            }

            statusDiv.textContent = 'Injecting scraper script...';

            // Inject the comprehensive scraper function
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: scrapeCourseContent
            });

            console.log('[Popup] Script execution results:', results);

            const courseData = results[0].result;

            if (!courseData) {
                throw new Error('Failed to extract course data');
            }

            statusDiv.textContent = 'Creating download file...';

            // Create and download the JSON file
            const jsonData = JSON.stringify(courseData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const courseTitle = (courseData.courseTitle || 'course')
                .replace(/[^a-z0-9]/gi, '_')
                .toLowerCase();
            const filename = `thinkific_${courseTitle}_${Date.now()}.json`;

            await chrome.downloads.download({
                url: url,
                filename: filename
            });

            statusDiv.textContent = `Complete! ${filename} has been downloaded.`;

        } catch (error) {
            console.error('[Popup] Error during scraping:', error);
            statusDiv.textContent = `Error: ${error.message}`;
        } finally {
            startButton.disabled = false;
        }
    });
});

/**
 * Main scraper function that will be injected into the page
 * Uses clicking to navigate through lessons (not URLs)
 */
async function scrapeCourseContent() {
    // Helper function for delays
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper: Find element with fallback selectors
    function findElement(selectors, context = document) {
        if (!Array.isArray(selectors)) {
            selectors = [selectors];
        }

        for (const selector of selectors) {
            try {
                const el = context.querySelector(selector);
                if (el) {
                    console.log(`[Scraper] Found element with: ${selector}`);
                    return el;
                }
            } catch (e) {
                console.warn(`[Scraper] Selector failed: ${selector}`, e);
            }
        }

        console.warn('[Scraper] No element found for selectors:', selectors);
        return null;
    }

    // Helper: Find all elements with fallback selectors
    function findElements(selectors, context = document) {
        if (!Array.isArray(selectors)) {
            selectors = [selectors];
        }

        for (const selector of selectors) {
            try {
                const els = context.querySelectorAll(selector);
                if (els.length > 0) {
                    console.log(`[Scraper] Found ${els.length} elements with: ${selector}`);
                    return Array.from(els);
                }
            } catch (e) {
                console.warn(`[Scraper] Selector failed: ${selector}`, e);
            }
        }

        console.warn('[Scraper] No elements found for selectors:', selectors);
        return [];
    }

    // Define selectors with fallbacks
    const SELECTORS = {
        chapterContainer: [
            '.chapter-card_FVZUV',
            '[class*="chapter-card"]',
            '.accordion.course-tree-chapters_m1XqK',
            '[class*="accordion"].course-tree-chapters',
            '[data-qa="chapter-container"]'
        ],
        chapterTitle: [
            '[data-qa="accordion-title"]',
            '[class*="accordion-title"]',
            '[class*="chapter-title"]',
            'h2', 'h3'
        ],
        lessonCard: [
            '.content-card_kNCsI',
            '[data-qa="curriculum-lesson-card"]',
            '[class*="content-card"]',
            '[class*="lesson-card"]'
        ],
        lessonTitle: [
            '.content-card__name_GVtnt',
            '[class*="content-card__name"]',
            '[class*="lesson__name"]',
            'span', 'p'
        ],
        clickableLesson: [
            '[data-qa="curriculum-lesson-card"]',
            'div[role="button"]',
            'a'
        ],
        iframe: [
            'iframe[id^="fr-iframe"]',
            'iframe[id*="lesson"]',
            'iframe[src*="thinkific"]',
            'iframe'
        ],
        textContent: [
            '.fr-element.fr-view',
            '[class*="fr-view"]',
            '[class*="fr-element"]',
            '.lesson-content',
            '.text-content',
            'article', 'main'
        ],
        sidebar: [
            '.course-tree__chapters_Rs2Sc',
            '[class*="course-tree"]',
            '[class*="curriculum"]',
            '[class*="sidebar"]'
        ]
    };

    try {
        console.log('[Scraper] Starting course scraping...');

        // Step 1: Build course map from curriculum page
        const chapterContainers = findElements(SELECTORS.chapterContainer);
        console.log(`[Scraper] Found ${chapterContainers.length} chapters`);

        if (chapterContainers.length === 0) {
            throw new Error('No chapters found. Make sure you are on the curriculum page.');
        }

        const coursePlan = [];

        for (const chapterContainer of chapterContainers) {
            const chapterTitleEl = findElement(SELECTORS.chapterTitle, chapterContainer);
            const chapterTitle = chapterTitleEl?.textContent.trim() || 'Untitled Chapter';

            const lessonCards = findElements(SELECTORS.lessonCard, chapterContainer);
            console.log(`[Scraper] Found ${lessonCards.length} lessons in "${chapterTitle}"`);

            const lessons = [];

            for (const lessonCard of lessonCards) {
                const lessonTitleEl = findElement(SELECTORS.lessonTitle, lessonCard);
                const lessonTitle = lessonTitleEl?.textContent.trim() || 'Untitled Lesson';

                lessons.push({
                    title: lessonTitle,
                    content: null,
                    textContent: null,
                    plainTextContent: null
                });
            }

            coursePlan.push({
                chapterTitle: chapterTitle,
                lessons: lessons
            });
        }

        // Step 2: Click through and scrape each lesson sequentially
        let totalLessons = 0;
        let processedLessons = 0;

        // Count total lessons for progress tracking
        coursePlan.forEach(chapter => {
            totalLessons += chapter.lessons.length;
        });

        console.log(`[Scraper] Total lessons to scrape: ${totalLessons}`);

        for (const chapter of coursePlan) {
            for (const lesson of chapter.lessons) {
                try {
                    processedLessons++;
                    console.log(`[Scraper] Processing lesson ${processedLessons}/${totalLessons}: "${lesson.title}"`);

                    // Find the lesson card again in the current DOM (by title)
                    const lessonCards = findElements(SELECTORS.lessonCard);
                    let targetLessonCard = null;

                    for (const card of lessonCards) {
                        const titleElement = findElement(SELECTORS.lessonTitle, card);
                        if (titleElement && titleElement.textContent.trim() === lesson.title) {
                            targetLessonCard = card;
                            break;
                        }
                    }

                    if (!targetLessonCard) {
                        lesson.content = 'Error: Could not find lesson card in DOM';
                        lesson.textContent = 'Error: Could not find lesson card in DOM';
                        lesson.plainTextContent = 'Error: Could not find lesson card in DOM';
                        continue;
                    }

                    // Find and click the clickable lesson element
                    const clickableElement = findElement(SELECTORS.clickableLesson, targetLessonCard) || targetLessonCard;

                    console.log(`[Scraper] Clicking lesson: "${lesson.title}"`);
                    clickableElement.click();
                    await sleep(2000); // Wait for navigation

                    // Wait for iframe to appear (lesson content is in iframe)
                    let iframe = null;
                    let attempts = 0;
                    const maxAttempts = 10;

                    while (!iframe && attempts < maxAttempts) {
                        iframe = findElement(SELECTORS.iframe);
                        if (!iframe) {
                            await sleep(1000);
                            attempts++;
                        }
                    }

                    if (iframe) {
                        try {
                            // Wait for iframe content to load
                            await sleep(2000);

                            // Try to access iframe content (same-origin)
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;

                            if (iframeDoc) {
                                const bodyContent = iframeDoc.body;

                                if (bodyContent) {
                                    // Get the full iframe content
                                    lesson.content = bodyContent.innerHTML;

                                    // Also specifically extract the text section content
                                    const textSection = findElement(SELECTORS.textContent, iframeDoc);
                                    if (textSection) {
                                        lesson.textContent = textSection.innerHTML;
                                        lesson.plainTextContent = textSection.textContent || textSection.innerText;
                                        console.log(`[Scraper] Extracted text content (${lesson.plainTextContent.length} chars)`);
                                    } else {
                                        lesson.textContent = 'No text section found';
                                        lesson.plainTextContent = 'No text section found';
                                    }
                                } else {
                                    lesson.content = 'Error: Could not access iframe body content';
                                    lesson.textContent = 'Error: Could not access iframe body content';
                                    lesson.plainTextContent = 'Error: Could not access iframe body content';
                                }
                            } else {
                                throw new Error('Could not access iframe document');
                            }
                        } catch (iframeError) {
                            console.error('[Scraper] Iframe access error:', iframeError);
                            lesson.content = `Error accessing iframe: ${iframeError.message}`;
                            lesson.textContent = `Error accessing iframe: ${iframeError.message}`;
                            lesson.plainTextContent = `Error accessing iframe: ${iframeError.message}`;
                        }
                    } else {
                        // If no iframe, try to get content directly from page
                        console.log('[Scraper] No iframe found, trying main page content');
                        const contentContainer = findElement(['.lesson-content', '.content-container', 'main', 'article']);

                        if (contentContainer) {
                            lesson.content = contentContainer.innerHTML;

                            // Try to find text section on main page too
                            const textSection = findElement(SELECTORS.textContent, contentContainer);
                            if (textSection) {
                                lesson.textContent = textSection.innerHTML;
                                lesson.plainTextContent = textSection.textContent || textSection.innerText;
                            } else {
                                lesson.textContent = 'No text section found';
                                lesson.plainTextContent = 'No text section found';
                            }
                        } else {
                            lesson.content = 'Error: Could not find lesson content container or iframe';
                            lesson.textContent = 'Error: Could not find lesson content container or iframe';
                            lesson.plainTextContent = 'Error: Could not find lesson content container or iframe';
                        }
                    }

                    // Navigate back to curriculum page
                    console.log('[Scraper] Navigating back to curriculum');
                    window.history.back();
                    await sleep(2000); // Wait for page to load

                    // Wait for curriculum sidebar to reappear
                    let sidebarVisible = false;
                    attempts = 0;

                    while (!sidebarVisible && attempts < maxAttempts) {
                        const sidebar = findElement(SELECTORS.sidebar);
                        if (sidebar) {
                            sidebarVisible = true;
                        } else {
                            await sleep(1000);
                            attempts++;
                        }
                    }

                    if (!sidebarVisible) {
                        throw new Error('Failed to return to curriculum page');
                    }

                } catch (lessonError) {
                    console.error(`[Scraper] Error processing lesson "${lesson.title}":`, lessonError);
                    lesson.content = `Error processing lesson: ${lessonError.message}`;
                    lesson.textContent = `Error processing lesson: ${lessonError.message}`;
                    lesson.plainTextContent = `Error processing lesson: ${lessonError.message}`;

                    // Try to get back to curriculum page
                    try {
                        window.history.back();
                        await sleep(2000);
                    } catch (backError) {
                        console.error('[Scraper] Failed to navigate back after error:', backError);
                        // Continue anyway - might already be on curriculum page
                    }
                }

                // Small delay between lessons to be respectful to the server
                await sleep(500);
            }
        }

        // Step 3: Return the final data
        const finalData = {
            courseTitle: document.title || 'Unknown Course',
            extractedAt: new Date().toISOString(),
            totalChapters: coursePlan.length,
            totalLessons: totalLessons,
            chapters: coursePlan
        };

        console.log('[Scraper] Course scraping complete:', finalData);
        return finalData;

    } catch (error) {
        console.error('[Scraper] Fatal error:', error);
        throw new Error(`Course scraping failed: ${error.message}`);
    }
}
