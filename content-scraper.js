/**
 * Thinkific Course Scraper - Content Scraper
 * Builds course map from curriculum page (chapters + lessons with URLs)
 *
 * This script is injected into the Thinkific curriculum page to extract
 * the course structure without navigating to individual lessons.
 */

/**
 * Build complete course map from curriculum page
 * @returns {Promise<Object>} Course map with chapters and lessons
 */
async function buildCourseMap() {
    console.log('[ContentScraper] Starting course map extraction...');

    try {
        // Store curriculum URL for reliable navigation back
        const curriculumUrl = window.location.href;
        console.log('[ContentScraper] Curriculum URL:', curriculumUrl);

        // Extract course title
        const courseTitle = extractCourseTitle();
        console.log('[ContentScraper] Course title:', courseTitle);

        // Find all chapter containers
        const chapterElements = findElements(SELECTORS.chapterContainer);
        console.log(`[ContentScraper] Found ${chapterElements.length} chapters`);

        if (chapterElements.length === 0) {
            console.error('[ContentScraper] No chapters found!');
            console.error('[ContentScraper] Tried selectors:', SELECTORS.chapterContainer);
            console.error('[ContentScraper] Current page HTML structure:');
            console.error('[ContentScraper] - Body classes:', document.body.className);
            console.error('[ContentScraper] - URL:', window.location.href);

            // Try to help debug by showing what IS on the page
            const possibleChapters = [
                ...document.querySelectorAll('[role="button"]'),
                ...document.querySelectorAll('[class*="accordion"]'),
                ...document.querySelectorAll('[data-qa*="chapter"]'),
                ...document.querySelectorAll('[data-qa*="accordion"]')
            ];

            if (possibleChapters.length > 0) {
                console.warn(`[ContentScraper] Found ${possibleChapters.length} potential chapter elements on page`);
                console.warn('[ContentScraper] First potential element:', possibleChapters[0]);
                console.warn('[ContentScraper] Classes:', possibleChapters[0]?.className);
                console.warn('[ContentScraper] Data attributes:', Array.from(possibleChapters[0]?.attributes || [])
                    .filter(attr => attr.name.startsWith('data-'))
                    .map(attr => `${attr.name}="${attr.value}"`)
                );
            }

            throw new Error('No chapters found. Make sure you are on the course curriculum page. Check console for debug info.');
        }

        // Extract chapter and lesson data
        const chapters = [];
        let totalLessons = 0;

        for (let chapterIndex = 0; chapterIndex < chapterElements.length; chapterIndex++) {
            // chapterElement is the full chapter container (e.g., .chapter-card_FVZUV)
            // which contains both the accordion header AND the accordion content
            const chapterElement = chapterElements[chapterIndex];
            console.log(`[ContentScraper] Processing chapter ${chapterIndex + 1}/${chapterElements.length}...`);

            // Extract chapter title from nested header element within the container
            const chapterTitle = extractText(chapterElement, SELECTORS.chapterTitle) ||
                                `Chapter ${chapterIndex + 1}`;

            // Find lessons within this chapter container (searches full container including accordion__content)
            const lessonElements = findElements(SELECTORS.lessonCard, chapterElement);
            console.log(`[ContentScraper] Found ${lessonElements.length} lessons in "${chapterTitle}"`);

            const lessons = [];

            for (let lessonIndex = 0; lessonIndex < lessonElements.length; lessonIndex++) {
                const lessonElement = lessonElements[lessonIndex];

                try {
                    // Extract lesson data
                    const lessonTitle = extractText(lessonElement, SELECTORS.lessonTitle) ||
                                      `Lesson ${lessonIndex + 1}`;

                    const lessonType = detectLessonType(lessonElement);

                    // Try to get lesson URL
                    let lessonUrl = getLessonUrl(lessonElement);

                    // If URL not found, try clicking and capturing URL change
                    if (!lessonUrl) {
                        console.warn(`[ContentScraper] No URL found for "${lessonTitle}", attempting click method...`);
                        lessonUrl = await captureLessonUrlByClick(lessonElement, curriculumUrl);
                    }

                    if (!lessonUrl) {
                        console.error(`[ContentScraper] Failed to get URL for "${lessonTitle}"`);
                        // Still add lesson to map, but mark URL as unavailable
                        lessonUrl = null;
                    }

                    lessons.push({
                        title: lessonTitle,
                        type: lessonType,
                        url: lessonUrl,
                        chapterIndex: chapterIndex,
                        lessonIndex: lessonIndex
                    });

                    totalLessons++;

                } catch (error) {
                    console.error(`[ContentScraper] Error extracting lesson ${lessonIndex}:`, error);
                    lessons.push({
                        title: `Lesson ${lessonIndex + 1}`,
                        type: 'unknown',
                        url: null,
                        error: error.message
                    });
                }
            }

            chapters.push({
                chapterTitle: chapterTitle,
                lessons: lessons,
                chapterIndex: chapterIndex
            });
        }

        const courseMap = {
            courseTitle: courseTitle,
            curriculumUrl: curriculumUrl,
            totalChapters: chapters.length,
            totalLessons: totalLessons,
            chapters: chapters,
            extractedAt: new Date().toISOString()
        };

        console.log('[ContentScraper] Course map extraction complete:', courseMap);
        return courseMap;

    } catch (error) {
        console.error('[ContentScraper] Fatal error building course map:', error);
        throw error;
    }
}

/**
 * Extract course title from page
 * @returns {string} Course title
 */
function extractCourseTitle() {
    // Try to get from page title first
    const pageTitle = document.title;
    if (pageTitle && !pageTitle.includes('Thinkific')) {
        return pageTitle.split('|')[0].trim();
    }

    // Try to find course title element
    const titleElement = findElement(SELECTORS.courseTitle);
    if (titleElement) {
        return titleElement.textContent.trim();
    }

    // Fallback: use domain name
    return window.location.hostname.split('.')[0];
}

/**
 * Capture lesson URL by clicking and observing URL change
 * WARNING: This method navigates away from curriculum page
 * @param {Element} lessonElement - Lesson card element to click
 * @param {string} curriculumUrl - Original curriculum URL to return to
 * @returns {Promise<string|null>} Lesson URL or null
 */
async function captureLessonUrlByClick(lessonElement, curriculumUrl) {
    try {
        const urlBefore = window.location.href;

        // Click the lesson element
        lessonElement.click();

        // Wait for URL to change
        await sleep(1000);

        const urlAfter = window.location.href;

        if (urlAfter !== urlBefore) {
            console.log('[ContentScraper] Captured lesson URL:', urlAfter);

            // Navigate back to curriculum
            window.location.href = curriculumUrl;
            await waitForNavigation();
            await sleep(1000); // Extra wait for curriculum to reload

            return urlAfter;
        }

        return null;

    } catch (error) {
        console.error('[ContentScraper] Error capturing URL by click:', error);

        // Try to return to curriculum on error
        try {
            window.location.href = curriculumUrl;
            await waitForNavigation();
        } catch (navError) {
            console.error('[ContentScraper] Failed to return to curriculum:', navError);
        }

        return null;
    }
}

/**
 * Verify we're on a curriculum page
 * @returns {boolean}
 */
function isOnCurriculumPage() {
    // Check for curriculum indicators
    const hasCurriculumElement = findElement(SELECTORS.curriculumPage) !== null;
    const hasChapters = findElements(SELECTORS.chapterContainer).length > 0;
    const urlIndicatesCurriculum = window.location.href.includes('curriculum') ||
                                   window.location.href.includes('courses');

    return hasCurriculumElement || hasChapters || urlIndicatesCurriculum;
}

/**
 * Wait for curriculum page to fully load
 * @returns {Promise<void>}
 */
async function waitForCurriculumLoad() {
    console.log('[ContentScraper] Waiting for curriculum page to load...');

    // Wait for chapters to appear
    await waitForElement(SELECTORS.chapterContainer, 15000);

    // Additional wait for dynamic content
    await sleep(2000);

    console.log('[ContentScraper] Curriculum page loaded');
}

// Export main function
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        buildCourseMap,
        isOnCurriculumPage,
        waitForCurriculumLoad,
        extractCourseTitle
    };
}
