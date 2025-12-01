/**
 * Thinkific Course Scraper - Popup Controller
 * Click-through DOM scraping architecture: stays on curriculum page,
 * clicks each lesson, and extracts text from the editor panel
 */

// Module-level state for cancellation and progress tracking
let isScraping = false;
let currentTabId = null;
let totalLessonsGlobal = 0;
let wasCancelled = false;

document.addEventListener('DOMContentLoaded', () => {
  const startButton = document.getElementById('startBtn');
  const cancelButton = document.getElementById('cancelBtn');
  const statusDiv = document.getElementById('status');
  const progressSection = document.getElementById('progressSection');
  const progressText = document.getElementById('progressText');
  const progressPercent = document.getElementById('progressPercent');
  const progressBar = document.getElementById('progressBar');
  const currentLessonDiv = document.getElementById('currentLesson');
  const errorLogSection = document.getElementById('errorLogSection');
  const errorSummary = document.getElementById('errorSummary');
  const errorList = document.getElementById('errorList');

  if (!startButton) {
    console.error('[Popup] startBtn not found');
    return;
  }

  startButton.addEventListener('click', () => {
    runScrape().catch(err => {
      console.error('[Popup] Unhandled error in runScrape:', err);
      setStatus(`Error: ${err.message}`);
    });
  });

  // Cancel button handler
  if (cancelButton) {
    cancelButton.addEventListener('click', async () => {
      if (!isScraping || !currentTabId) {
        return;
      }

      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTabId },
          func: () => {
            window.__TCS_CANCELLED = true;
          }
        });
        setStatus('Cancel requested... Finishing current lesson.');
      } catch (err) {
        console.error('[Popup] Error requesting cancel:', err);
        setStatus('Error requesting cancel. See console.');
      }
    });
  }

  function setStatus(msg) {
    if (statusDiv) statusDiv.textContent = msg;
    console.log('[Popup] Status:', msg);
  }

  function updateProgress(completed, total) {
    if (!progressSection || !progressText || !progressPercent || !progressBar) return;

    const safeTotal = total || 0;
    const safeCompleted = Math.min(completed || 0, safeTotal);

    progressSection.classList.remove('hidden');
    progressText.textContent = `${safeCompleted} / ${safeTotal} lessons`;

    const pct = safeTotal > 0 ? Math.round((safeCompleted / safeTotal) * 100) : 0;
    progressPercent.textContent = `${pct}%`;
    progressBar.style.width = `${pct}%`;
  }

  function resetErrors() {
    if (!errorList || !errorSummary || !errorLogSection) return;
    errorList.innerHTML = '';
    errorSummary.textContent = 'Errors (0)';
    errorLogSection.classList.add('hidden');
  }

  // Listen for progress messages from the injected scraper
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    switch (message.type) {
      case 'tcs-init':
        wasCancelled = false;  // Reset on new run
        totalLessonsGlobal = message.totalLessons || 0;
        updateProgress(0, totalLessonsGlobal);
        setStatus('Scanning lessons...');
        break;

      case 'tcs-progress':
        totalLessonsGlobal = message.totalLessons || totalLessonsGlobal;
        updateProgress(message.completed || 0, totalLessonsGlobal);
        if (message.lessonTitle) {
          setStatus(`Scraping: ${message.lessonTitle}`);
        }
        break;

      case 'tcs-done':
        wasCancelled = false;  // Explicitly mark as not cancelled
        isScraping = false;
        if (startButton) startButton.disabled = false;
        if (cancelButton) cancelButton.disabled = true;
        updateProgress(message.completed || totalLessonsGlobal, message.totalLessons || totalLessonsGlobal);
        setStatus('Scraping complete. Downloading JSON...');
        break;

      case 'tcs-cancelled':
        wasCancelled = true;  // Mark as cancelled
        isScraping = false;
        if (startButton) startButton.disabled = false;
        if (cancelButton) cancelButton.disabled = true;
        updateProgress(message.completed || 0, message.totalLessons || totalLessonsGlobal);
        setStatus('Scraping cancelled. No file downloaded.');
        break;
    }
  });

  async function runScrape() {
    resetErrors();
    setStatus('Preparing to scrape...');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id || !tab.url) {
        setStatus('No active tab found.');
        return;
      }

      if (!/thinkific\.com/.test(tab.url)) {
        setStatus('Please navigate to a Thinkific course curriculum page before starting.');
        return;
      }

      // Set state and update UI
      isScraping = true;
      currentTabId = tab.id;
      wasCancelled = false;  // Reset cancellation flag for new run

      if (startButton) startButton.disabled = true;
      if (cancelButton) cancelButton.disabled = false;

      // Reset progress UI
      totalLessonsGlobal = 0;
      if (progressSection) progressSection.classList.remove('hidden');
      if (progressText) progressText.textContent = '0 / 0 lessons';
      if (progressPercent) progressPercent.textContent = '0%';
      if (progressBar) progressBar.style.width = '0%';

      setStatus('Injecting scraper scripts into Thinkific page...');

      // Inject selectors and utils into the page
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['selectors.js', 'utils.js']
      });

      setStatus('Starting click-through scraping...');

      // Execute the click-through scraper in the page context
      const [{ result: courseData }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: clickThroughAndScrapeCourse
      });

      if (!courseData) {
        setStatus('No data returned from scraper.');
        isScraping = false;
        if (startButton) startButton.disabled = false;
        if (cancelButton) cancelButton.disabled = true;
        return;
      }

      console.log('[Popup] Course data received:', courseData);

      // If the scraper marked this run as cancelled, or we saw a cancellation message,
      // do NOT download a file.
      if (courseData.cancelled || wasCancelled) {
        console.log('[Popup] Scrape was cancelled; skipping download.');
        setStatus('Scraping cancelled. No file downloaded.');
        isScraping = false;
        if (startButton) startButton.disabled = false;
        if (cancelButton) cancelButton.disabled = true;
        return;
      }

      // Normal successful path: download JSON
      setStatus('Creating download file...');

      const blob = new Blob([JSON.stringify(courseData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const safeTitle = (courseData.courseTitle || 'course').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `thinkific_${safeTitle}_${Date.now()}.json`;

      await chrome.downloads.download({ url, filename });

      // Reset state and update UI
      isScraping = false;
      if (startButton) startButton.disabled = false;
      if (cancelButton) cancelButton.disabled = true;
      setStatus(`Complete! ${filename} has been downloaded.`);

    } catch (error) {
      console.error('[Popup] Error during scraping:', error);
      setStatus(`Error: ${error.message}`);
    } finally {
      // Reset state (unless already reset by message handler)
      isScraping = false;
      if (startButton) startButton.disabled = false;
      if (cancelButton) cancelButton.disabled = true;
    }
  }
});

/**
 * This function runs in the Thinkific page context.
 * It clicks through each lesson and extracts text content.
 *
 * @returns {Promise<Object>} Complete course data with lesson content
 */
async function clickThroughAndScrapeCourse() {
  console.log('[Scraper] Starting click-through course scraping...');

  // Initialize cancellation flag
  window.__TCS_CANCELLED = window.__TCS_CANCELLED || false;

  // Helper: Sleep
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Helper: Normalize text for comparison
  const normalizeText = (text) => {
    if (!text) return '';
    return text.trim().replace(/\s+/g, ' ').toLowerCase();
  };

  /**
   * Simulate a real mouse click with full event sequence
   * @param {Element} element - Element to click
   */
  function simulateRealClick(element) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const eventOptions = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY
    };

    const events = ['pointerdown', 'mousedown', 'mouseup', 'click'];

    for (const type of events) {
      const evt = new MouseEvent(type, eventOptions);
      element.dispatchEvent(evt);
    }
  }

  /**
   * Wait for the lesson editor panel to load with a specific lesson
   * @param {string} expectedTitle - The expected lesson title
   * @param {number} timeoutMs - Max wait time in ms
   * @returns {Promise<boolean>} - True if loaded, false if timeout
   */
  async function waitForLessonLoaded(expectedTitle, timeoutMs = 10000) {
    console.log('[Scraper] Waiting for lesson "' + expectedTitle + '" to load in editor...');

    const start = Date.now();
    const normalize = (s) => (s || '').trim().replace(/\s+/g, ' ');

    const normalizedExpected = normalize(expectedTitle);

    while (Date.now() - start < timeoutMs) {
      // Try more specific selectors first if available
      const editorTitleSelectors = [
        '[data-qa="lesson-title"]',
        '[data-qa*="lesson-title"]',
        '.lesson-title',
        '.content-form-header h1',
        '.content-form h1',
        'h1'
      ];

      let titleEl = null;
      for (const sel of editorTitleSelectors) {
        try {
          const candidate = document.querySelector(sel);
          if (candidate) {
            titleEl = candidate;
            break;
          }
        } catch (e) {
          console.warn('[Scraper] Selector failed in waitForLessonLoaded:', sel, e);
        }
      }

      const currentText = titleEl ? normalize(titleEl.textContent) : '';
      if (titleEl) {
        console.log('[Scraper] Editor title candidate:', currentText);
      } else {
        console.log('[Scraper] No editor title element found yet');
      }

      if (titleEl && currentText === normalizedExpected) {
        console.log('[Scraper] Lesson "' + expectedTitle + '" loaded in editor.');
        // Extra wait for editor content to render
        await sleep(500);
        return true;
      }

      await sleep(500);
    }

    console.warn('[Scraper] Timeout waiting for lesson "' + expectedTitle + '"');
    return false;
  }

  /**
   * Extract lesson text content from the editor panel
   * @returns {Object|null} - { html, plainText } or null
   */
  function extractLessonText() {
    console.log('[Scraper] Attempting to extract lesson text...');

    // Strategy 1: Try direct content-editable div (like Froala .fr-element.fr-view)
    const editorEl = findElement(SELECTORS.lessonTextEditor);

    if (editorEl) {
      // Check if it's an iframe
      if (editorEl.tagName === 'IFRAME') {
        try {
          console.log('[Scraper] Found iframe editor, attempting to access content...');
          const iframeDoc = editorEl.contentDocument || editorEl.contentWindow?.document;

          if (iframeDoc && iframeDoc.body) {
            const html = iframeDoc.body.innerHTML;
            const plainText = iframeDoc.body.innerText || iframeDoc.body.textContent || '';

            console.log(`[Scraper] Extracted from iframe: ${html.length} chars HTML, ${plainText.length} chars text`);
            return { html, plainText, source: 'iframe_body' };
          }
        } catch (err) {
          console.warn('[Scraper] iframe access blocked (cross-origin):', err.message);
          return null;
        }
      } else {
        // Direct div with contenteditable
        const html = editorEl.innerHTML;
        const plainText = editorEl.innerText || editorEl.textContent || '';

        console.log(`[Scraper] Extracted from direct element: ${html.length} chars HTML, ${plainText.length} chars text`);
        return { html, plainText, source: 'direct_div' };
      }
    }

    console.warn('[Scraper] Could not find lesson text editor element');
    return null;
  }

  try {
    // Get course title and URL
    const courseTitle = document.title || 'Unknown Course';
    const curriculumUrl = window.location.href;

    console.log('[Scraper] Course title:', courseTitle);
    console.log('[Scraper] Curriculum URL:', curriculumUrl);

    // Build course structure by finding chapters and lessons
    const chapterElements = findElements(SELECTORS.chapterContainer);
    console.log(`[Scraper] Found ${chapterElements.length} chapters`);

    if (chapterElements.length === 0) {
      throw new Error('No chapters found. Make sure you are on the curriculum page.');
    }

    const chapters = [];
    let totalLessons = 0;

    // Build course plan (chapters + lessons)
    for (let chapterIndex = 0; chapterIndex < chapterElements.length; chapterIndex++) {
      const chapterElement = chapterElements[chapterIndex];

      const chapterTitleEl = findElement(SELECTORS.chapterTitle, chapterElement);
      const chapterTitle = chapterTitleEl?.textContent.trim() || `Chapter ${chapterIndex + 1}`;

      const lessonCards = findElements(SELECTORS.lessonCard, chapterElement);
      console.log(`[Scraper] Chapter "${chapterTitle}": found ${lessonCards.length} lessons`);

      const lessons = [];

      for (let lessonIndex = 0; lessonIndex < lessonCards.length; lessonIndex++) {
        const lessonCard = lessonCards[lessonIndex];
        const lessonTitleEl = findElement(SELECTORS.lessonTitle, lessonCard);
        const lessonTitle = lessonTitleEl?.textContent.trim() || `Lesson ${lessonIndex + 1}`;
        const lessonType = detectLessonType(lessonCard);

        // DIAGNOSTIC: Log each lesson as we build the plan
        console.log(`[Plan] chapterIndex=${chapterIndex} lessonIndex=${lessonIndex} title="${lessonTitle}" type="${lessonType}"`);
        if (lessonIndex === 0) {
          const htmlSnippet = lessonCard.outerHTML.substring(0, 200);
          console.log(`[Plan] First lesson card HTML snippet:`, htmlSnippet);
        }

        lessons.push({
          chapterIndex,
          lessonIndex,
          title: lessonTitle,
          type: lessonType,
          content: null,
          textContent: null,
          plainTextContent: null
        });

        totalLessons++;
      }

      chapters.push({
        chapterTitle,
        chapterIndex,
        lessons
      });
    }

    console.log(`[Scraper] Built course plan: ${chapters.length} chapters, ${totalLessons} lessons`);

    // Send init message with total lesson count
    let completed = 0;
    try {
      chrome.runtime && chrome.runtime.sendMessage({
        type: 'tcs-init',
        totalLessons
      });
    } catch (e) {
      console.warn('[Scraper] Failed to send init message:', e);
    }

    // Now click through each lesson and extract content
    let processedLessons = 0;
    let cancelled = false;

    for (const chapter of chapters) {
      if (cancelled) break;

      for (const lesson of chapter.lessons) {
        try {
          // Check cancellation flag
          if (window.__TCS_CANCELLED) {
            console.warn('[Scraper] Cancellation flag set; stopping after completing', completed, 'lessons');
            try {
              chrome.runtime && chrome.runtime.sendMessage({
                type: 'tcs-cancelled',
                completed,
                totalLessons
              });
            } catch (e) {
              console.warn('[Scraper] Failed to send cancellation message:', e);
            }
            cancelled = true;
            break;
          }

          processedLessons++;
          console.log(`[Scraper] Processing lesson ${processedLessons}/${totalLessons}: title="${lesson.title}" chapterIndex=${lesson.chapterIndex} lessonIndex=${lesson.lessonIndex}`);

          // Find the lesson card in the current DOM by title
          const lessonCards = findElements(SELECTORS.lessonCard);

          // DIAGNOSTIC: Log how many cards we found globally
          console.log(`[Debug] Global lessonCard query returned ${lessonCards.length} elements`);

          // DIAGNOSTIC: Log the first few lesson titles we can see in the DOM
          const visibleTitles = [];
          for (let i = 0; i < Math.min(5, lessonCards.length); i++) {
            const titleEl = findElement(SELECTORS.lessonTitle, lessonCards[i]);
            if (titleEl) {
              visibleTitles.push(titleEl.textContent.trim());
            }
          }
          console.log(`[Debug] First ${visibleTitles.length} lesson titles in DOM:`, visibleTitles);

          let targetLessonCard = null;
          const normalizedTarget = normalizeText(lesson.title);
          console.log(`[Debug] Looking for normalized title: "${normalizedTarget}"`);

          for (const card of lessonCards) {
            const titleElement = findElement(SELECTORS.lessonTitle, card);
            if (titleElement) {
              const normalizedCard = normalizeText(titleElement.textContent);

              // DIAGNOSTIC: Log each comparison attempt for first 3 cards
              if (lessonCards.indexOf(card) < 3) {
                console.log(`[Debug] Comparing card title: "${normalizedCard}" vs target: "${normalizedTarget}" → match=${normalizedCard === normalizedTarget}`);
              }

              if (normalizedCard === normalizedTarget) {
                targetLessonCard = card;
                console.log(`[Debug] ✓ Match found at card index ${lessonCards.indexOf(card)}`);
                break;
              }
            }
          }

          if (!targetLessonCard) {
            console.error(`[Scraper] Could not find lesson card for "${lesson.title}"`);

            // DIAGNOSTIC: Log ALL visible titles when we fail to find a match
            console.error(`[Debug] Complete list of ${lessonCards.length} lesson titles currently in DOM:`);
            for (let i = 0; i < lessonCards.length; i++) {
              const titleEl = findElement(SELECTORS.lessonTitle, lessonCards[i]);
              if (titleEl) {
                console.error(`[Debug]   ${i}: "${titleEl.textContent.trim()}" (normalized: "${normalizeText(titleEl.textContent)}")`);
              }
            }

            lesson.content = null;
            lesson.textContent = null;
            lesson.plainTextContent = null;
            lesson.error = 'Could not find lesson card in DOM';
            continue;
          }

          // Find the truly clickable element within the card
          let clickableElement =
            findElement(SELECTORS.clickableLesson, targetLessonCard) ||
            targetLessonCard.querySelector('button, [role="button"]') ||
            targetLessonCard;

          console.log('[Scraper] Click target:', clickableElement, 'for lesson:', lesson.title);

          // Scroll into view and wait for layout to settle
          clickableElement.scrollIntoView({ block: 'center', behavior: 'smooth' });
          await sleep(200);

          console.log(`[Scraper] Clicking lesson: "${lesson.title}"`);
          simulateRealClick(clickableElement);
          await sleep(500);

          // Wait for the lesson to load in the editor panel
          const loaded = await waitForLessonLoaded(lesson.title, 12000);

          if (!loaded) {
            console.error(`[Scraper] Lesson "${lesson.title}" did not load in editor panel`);
            lesson.content = null;
            lesson.textContent = null;
            lesson.plainTextContent = null;
            lesson.error = 'Lesson did not load in editor panel (timeout)';
            continue;
          }

          // Extract text content from the editor
          const textResult = extractLessonText();

          if (textResult) {
            lesson.content = textResult.html || null;
            lesson.textContent = textResult.plainText || null;
            lesson.plainTextContent = textResult.plainText || null;
            console.log(`[Scraper] Successfully extracted content for "${lesson.title}"`);
          } else {
            lesson.content = null;
            lesson.textContent = null;
            lesson.plainTextContent = null;
            lesson.error = 'Could not extract text from editor';
            console.warn(`[Scraper] Failed to extract content for "${lesson.title}"`);
          }

          // Increment completed count and send progress message
          completed++;
          try {
            chrome.runtime && chrome.runtime.sendMessage({
              type: 'tcs-progress',
              completed,
              totalLessons,
              lessonTitle: lesson.title
            });
          } catch (e) {
            console.warn('[Scraper] Failed to send progress message:', e);
          }

          // Small delay between lessons
          await sleep(500);

        } catch (lessonError) {
          console.error(`[Scraper] Error processing lesson "${lesson.title}":`, lessonError);
          lesson.content = null;
          lesson.textContent = null;
          lesson.plainTextContent = null;
          lesson.error = lessonError.message || 'Unknown error';
        }
      }
    }

    // DIAGNOSTIC: Count successes and failures
    let successCount = 0;
    let failureCount = 0;
    for (const chapter of chapters) {
      for (const lesson of chapter.lessons) {
        if (lesson.error) {
          failureCount++;
        } else if (lesson.content || lesson.textContent) {
          successCount++;
        } else {
          failureCount++;
        }
      }
    }

    console.log(`[Scraper] ===== SCRAPING SUMMARY =====`);
    console.log(`[Scraper] Total lessons: ${totalLessons}`);
    console.log(`[Scraper] Successfully scraped: ${successCount}`);
    console.log(`[Scraper] Failed to scrape: ${failureCount}`);
    console.log(`[Scraper] ============================`);

    // Send done message (if not cancelled)
    if (!cancelled) {
      try {
        chrome.runtime && chrome.runtime.sendMessage({
          type: 'tcs-done',
          completed,
          totalLessons
        });
      } catch (e) {
        console.warn('[Scraper] Failed to send done message:', e);
      }
    }

    // Return final course data
    const finalData = {
      cancelled,                  // Include cancellation flag
      courseTitle,
      curriculumUrl,
      extractedAt: new Date().toISOString(),
      totalChapters: chapters.length,
      totalLessons: totalLessons,
      chapters
    };

    console.log('[Scraper] Course scraping complete:', finalData);
    return finalData;

  } catch (error) {
    console.error('[Scraper] Fatal error:', error);
    throw new Error(`Course scraping failed: ${error.message}`);
  }
}
