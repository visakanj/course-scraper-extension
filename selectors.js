/**
 * Thinkific Course Scraper - Selector System
 * Multi-level fallback selectors for robust DOM traversal
 *
 * Selector Priority:
 * Level 1: Data attributes (data-qa, data-testid) - Most stable
 * Level 2: Partial class matching - Moderately stable
 * Level 3: Structural selectors - Less stable
 * Level 4: Semantic/ARIA selectors - Fallback
 */

const SELECTORS = {
    // Chapter/Section containers
    chapterContainer: [
        // Select full chapter container (contains both header and content)
        '.chapter-card_FVZUV',
        '[class*="chapter-card"]',
        '.accordion.course-tree-chapters_m1XqK',
        '[class*="accordion"].course-tree-chapters',

        // Accordion-based layout fallbacks
        '[class*="accordion__header"]',
        '[class*="accordion"][role="button"]',
        'div[role="button"]:has([data-qa="accordion-title"])',

        // Traditional container-based layout
        '[data-qa="chapter-container"]',
        '[data-testid="chapter-card"]',
        '[class*="chapter"]',
        '.course-tree__chapters > div',
        'div[role="region"]',
        '.curriculum-section'
    ],

    // Chapter title/heading
    chapterTitle: [
        '[data-qa="accordion-title"]',
        '[data-qa="chapter-title"]',
        '[class*="accordion-title"]',
        '[class*="chapter-title"]',
        'span[aria-expanded]',
        '.chapter-header',
        'h2, h3, h4'
    ],

    // Lesson/Content cards
    lessonCard: [
        // Exact match from user's HTML structure
        '.content-card_kNCsI',
        '[data-qa="curriculum-lesson-card"]',
        '[data-qa="lesson-card"]',
        '[data-testid="lesson-card"]',
        '[class*="content-card"]',
        '[class*="lesson-card"]',
        '[class*="curriculum-item"]',
        'div[role="button"]',
        '.lesson-item'
    ],

    // Clickable element within lesson card
    clickableLesson: [
        '[data-qa="curriculum-lesson-card"]',
        '[data-testid="lesson-card"]',
        'button[role="button"]',
        'div[role="button"]',
        'a[href]',
        '[class*="content-card"]',
        '[class*="lesson-card"]'
    ],

    // Lesson title
    lessonTitle: [
        // Modern Thinkific specific classes
        '.content-card__name_GVtnt',
        '[class*="content-card__name"]',

        // Generic selectors
        '[data-qa="lesson-title"]',
        '[class*="lesson__name"]',
        '[class*="lesson-title"]',
        '.lesson-name',
        'span, p'
    ],

    // Lesson type icon (video, text, quiz, download)
    lessonIcon: [
        '[data-qa="lesson-icon"]',
        '[class*="icon"]',
        'svg',
        'i[class*="fa-"]'
    ],

    // Iframe containing lesson content
    iframe: [
        'iframe[id^="fr-iframe"]',
        'iframe[id*="lesson"]',
        'iframe[name*="lesson"]',
        'iframe[src*="thinkific"]',
        'iframe.lesson-iframe',
        'iframe'
    ],

    // Text content within iframe
    iframeTextContent: [
        '.fr-element.fr-view',
        '[class*="fr-view"]',
        '[class*="fr-element"]',
        '.lesson-content',
        '.text-content',
        'article',
        'main',
        '.content'
    ],

    // Video player elements
    videoPlayer: [
        'video',
        'video source',
        '[data-video-url]',
        '[data-video-src]',
        'iframe[src*="vimeo"]',
        'iframe[src*="youtube"]',
        'iframe[src*="youtu.be"]',
        'iframe[src*="wistia"]',
        '.video-player',
        '.wistia_embed'
    ],

    // Download links
    downloadLinks: [
        'a[download]',
        'a[href*=".pdf"]',
        'a[href*=".zip"]',
        'a[href*=".doc"]',
        'a[href*=".docx"]',
        'a[href*=".xls"]',
        'a[href*=".xlsx"]',
        'a[href*=".ppt"]',
        'a[href*=".pptx"]',
        '[class*="download"]',
        'a[href*="amazonaws.com"]',
        'a[href*="/download"]'
    ],

    // Course title
    courseTitle: [
        '[data-qa="course-title"]',
        'h1',
        '.course-title',
        '[class*="course-name"]'
    ],

    // Curriculum/course page indicator
    curriculumPage: [
        '[data-qa="curriculum"]',
        '[class*="curriculum"]',
        '[class*="course-content"]',
        '.course-player'
    ],

    // Lesson page indicator
    lessonPage: [
        '[data-qa="lesson-page"]',
        '[class*="lesson-page"]',
        '[class*="lesson-view"]',
        '.lesson-container'
    ],

    // Lesson text editor (right-hand panel on curriculum page)
    lessonTextEditor: [
        // Froala editor (what you showed in the example)
        '.fr-element.fr-view',
        '[class*="fr-view"]',
        '[class*="fr-element"]',

        // TinyMCE alternatives
        '.tox-edit-area__iframe',
        'iframe[id*="tiny"]',

        // Generic editor selectors
        '[data-qa="lesson-text-editor"]',
        '[data-qa="lesson-text"]',
        '[data-qa="text-editor"]',
        '[contenteditable="true"]',
        '[class*="editor-content"]',
        '[class*="lesson-text"]',
        '.text-editor',
        '.lesson-editor'
    ],

    // Lesson title in the right-hand editor panel
    lessonEditorTitle: [
        '[data-qa="lesson-title"]',
        '[data-qa="item-title"]',
        '[class*="lesson-title"]',
        '[class*="item-title"]',
        '.lesson-header h1',
        '.lesson-header h2',
        'h1',
        'h2'
    ]
};

/**
 * Try selectors in order and return first matching element
 * @param {Array<string>} selectorArray - Array of CSS selectors to try
 * @param {Document|Element} context - DOM context to search within (default: document)
 * @returns {Element|null} - First matching element or null
 */
function findElement(selectorArray, context = document) {
    if (!Array.isArray(selectorArray)) {
        selectorArray = [selectorArray];
    }

    for (const selector of selectorArray) {
        try {
            const element = context.querySelector(selector);
            if (element) {
                console.log(`[FindElement] Match found: ${selector}`);
                return element;
            }
        } catch (error) {
            console.warn(`[FindElement] Selector failed: ${selector}`, error);
        }
    }

    console.warn(`[FindElement] No match found for selectors:`, selectorArray);
    return null;
}

/**
 * Try selectors in order and return all matching elements
 * @param {Array<string>} selectorArray - Array of CSS selectors to try
 * @param {Document|Element} context - DOM context to search within (default: document)
 * @returns {Array<Element>} - Array of matching elements (empty if none found)
 */
function findElements(selectorArray, context = document) {
    if (!Array.isArray(selectorArray)) {
        selectorArray = [selectorArray];
    }

    for (const selector of selectorArray) {
        try {
            const elements = context.querySelectorAll(selector);
            if (elements.length > 0) {
                console.log(`[FindElements] Found ${elements.length} elements with: ${selector}`);
                return Array.from(elements);
            }
        } catch (error) {
            console.warn(`[FindElements] Selector failed: ${selector}`, error);
        }
    }

    console.warn(`[FindElements] No matches found for selectors:`, selectorArray);
    return [];
}

/**
 * Extract text content from element using fallback selectors
 * @param {Element} container - Container element to search within
 * @param {Array<string>} selectorArray - Array of selectors for text container
 * @returns {string} - Extracted text content
 */
function extractText(container, selectorArray) {
    const textElement = findElement(selectorArray, container);
    if (textElement) {
        return textElement.textContent?.trim() || '';
    }
    // Fallback: use container's direct text
    return container.textContent?.trim() || '';
}

/**
 * Detect lesson type from icon or other indicators
 * @param {Element} lessonElement - Lesson card element
 * @returns {string} - Lesson type (video|text|quiz|download|unknown)
 */
function detectLessonType(lessonElement) {
    // Try to find icon element
    const iconElement = findElement(SELECTORS.lessonIcon, lessonElement);

    if (!iconElement) {
        return 'unknown';
    }

    // Check SVG classes for type indicators
    const iconHTML = iconElement.outerHTML.toLowerCase();
    const iconClasses = iconElement.className.toLowerCase();

    // Video indicators
    if (iconHTML.includes('video') ||
        iconHTML.includes('play') ||
        iconClasses.includes('video') ||
        iconClasses.includes('play')) {
        return 'video';
    }

    // Text/document indicators
    if (iconHTML.includes('text') ||
        iconHTML.includes('document') ||
        iconHTML.includes('file-text') ||
        iconClasses.includes('text') ||
        iconClasses.includes('document')) {
        return 'text';
    }

    // Quiz indicators
    if (iconHTML.includes('quiz') ||
        iconHTML.includes('question') ||
        iconHTML.includes('test') ||
        iconClasses.includes('quiz') ||
        iconClasses.includes('question')) {
        return 'quiz';
    }

    // Download indicators
    if (iconHTML.includes('download') ||
        iconHTML.includes('arrow-down') ||
        iconClasses.includes('download')) {
        return 'download';
    }

    // Fallback: check lesson element itself for type hints
    const lessonHTML = lessonElement.outerHTML.toLowerCase();
    if (lessonHTML.includes('type="video"') || lessonHTML.includes('data-type="video"')) {
        return 'video';
    }
    if (lessonHTML.includes('type="text"') || lessonHTML.includes('data-type="text"')) {
        return 'text';
    }

    return 'unknown';
}

/**
 * Get lesson URL from lesson card element
 * @param {Element} lessonElement - Lesson card element
 * @returns {string|null} - Lesson URL or null
 */
function getLessonUrl(lessonElement) {
    console.log('[Debug] getLessonUrl called for lesson element:', lessonElement.outerHTML);

    // Method 1: Check for direct link
    const link = lessonElement.querySelector('a[href]');
    console.log('[Debug] Method 1 link:', link && link.href);
    if (link && link.href) {
        console.log('[Debug] Returning from Method 1:', link.href);
        return link.href;
    }

    // Method 2: Check for data attribute
    const url = lessonElement.getAttribute('data-url') ||
                lessonElement.getAttribute('data-href') ||
                lessonElement.getAttribute('data-lesson-url');
    console.log('[Debug] Method 2 data-url/data-href/data-lesson-url:', url);
    if (url) {
        const finalUrl = url.startsWith('http') ? url : window.location.origin + url;
        console.log('[Debug] Returning from Method 2:', finalUrl);
        return finalUrl;
    }

    // Method 3: Check if element itself is clickable and has onclick
    const onclick = lessonElement.getAttribute('onclick');
    console.log('[Debug] Method 3 onclick:', onclick);
    if (onclick) {
        const urlMatch = onclick.match(/['"]([^'"]*lessons[^'"]*)['"]/);
        console.log('[Debug] Method 3 urlMatch:', urlMatch);
        if (urlMatch) {
            const finalUrl = urlMatch[1].startsWith('http') ? urlMatch[1] : window.location.origin + urlMatch[1];
            console.log('[Debug] Returning from Method 3:', finalUrl);
            return finalUrl;
        }
    }

    console.log('[Debug] getLessonUrl returning null - no URL found');
    return null;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SELECTORS,
        findElement,
        findElements,
        extractText,
        detectLessonType,
        getLessonUrl
    };
}
