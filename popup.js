document.addEventListener('DOMContentLoaded', function() {
    console.log('Popup script loaded');

    const startButton = document.getElementById('startScrapeBtn');
    const statusDiv = document.getElementById('status');

    if (!startButton) {
        console.error('Start button not found!');
        return;
    }

    if (!statusDiv) {
        console.error('Status div not found!');
        return;
    }

    // Test if button works
    statusDiv.textContent = 'Ready to start scraping.';

    startButton.addEventListener('click', async function() {
        console.log('Button clicked!');

        try {
            // Update status immediately
            statusDiv.textContent = 'Initializing agent... Please wait.';

            // Check if chrome APIs are available
            if (!chrome || !chrome.tabs) {
                statusDiv.textContent = 'Error: Chrome extension APIs not available.';
                return;
            }

            // Get the active tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            console.log('Active tab:', tab);

            if (!tab) {
                statusDiv.textContent = 'Error: No active tab found.';
                return;
            }

            if (!tab.url.includes('thinkific')) {
                statusDiv.textContent = 'Error: Please navigate to a Thinkific course page first.';
                return;
            }

            statusDiv.textContent = 'Injecting scraper script...';

            // Inject the comprehensive scraper function
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: scrapeCourseContent
            });

            console.log('Script execution results:', results);

            const courseData = results[0].result;

            if (!courseData) {
                statusDiv.textContent = 'Error: Failed to extract course data.';
                return;
            }

            statusDiv.textContent = 'Creating download file...';

            // Create and download the JSON file
            const jsonData = JSON.stringify(courseData, null, 2);
            const blob = new Blob([jsonData], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            await chrome.downloads.download({
                url: url,
                filename: 'migration_plan.json'
            });

            statusDiv.textContent = 'Complete! migration_plan.json has been downloaded.';

        } catch (error) {
            console.error('Error during scraping:', error);
            statusDiv.textContent = `Error: ${error.message}`;
        }
    });
});

// Main scraper function that will be injected into the page
async function scrapeCourseContent() {
    // Helper function for delays
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    try {
        // Step 1: Build the course map
        const chapterContainers = document.querySelectorAll('div.chapter-card_FVZUV');
        const coursePlan = [];

        for (const chapterContainer of chapterContainers) {
            // Extract chapter title
            const chapterTitleElement = chapterContainer.querySelector('span[data-qa="accordion-title"]');
            const chapterTitle = chapterTitleElement ? chapterTitleElement.textContent.trim() : 'Untitled Chapter';

            // Find all lesson cards within this chapter
            const lessonCards = chapterContainer.querySelectorAll('div.content-card_kNCsI');
            const lessons = [];

            for (const lessonCard of lessonCards) {
                // Extract lesson title
                const lessonTitleElement = lessonCard.querySelector('span.content-card__name_GVtnt');
                const lessonTitle = lessonTitleElement ? lessonTitleElement.textContent.trim() : 'Untitled Lesson';

                // Determine lesson type from icon
                const iconContainer = lessonCard.querySelector('div.content-card__body-icon_vSZ_r svg');
                let lessonType = 'unknown';

                if (iconContainer) {
                    const iconClass = iconContainer.getAttribute('class') || '';
                    if (iconClass.includes('content-video')) {
                        lessonType = 'video';
                    } else if (iconClass.includes('content-text')) {
                        lessonType = 'text';
                    } else if (iconClass.includes('content-quiz')) {
                        lessonType = 'quiz';
                    } else if (iconClass.includes('content-download')) {
                        lessonType = 'download';
                    }
                }

                lessons.push({
                    title: lessonTitle,
                    type: lessonType,
                    content: null, // Will be populated during scraping
                    textContent: null, // HTML content from the "Add text" section
                    plainTextContent: null // Plain text from the "Add text" section
                });
            }

            coursePlan.push({
                chapterTitle: chapterTitle,
                lessons: lessons
            });
        }

        // Step 2: Scrape each lesson's content sequentially
        let totalLessons = 0;
        let processedLessons = 0;

        // Count total lessons for progress tracking
        coursePlan.forEach(chapter => {
            totalLessons += chapter.lessons.length;
        });

        for (const chapter of coursePlan) {
            for (const lesson of chapter.lessons) {
                try {
                    processedLessons++;

                    // Find the lesson card again in the current DOM
                    const lessonCards = document.querySelectorAll('div.content-card_kNCsI');
                    let targetLessonCard = null;

                    for (const card of lessonCards) {
                        const titleElement = card.querySelector('span.content-card__name_GVtnt');
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
                    const clickableElement = targetLessonCard.querySelector('div[data-qa="curriculum-lesson-card"]');
                    if (!clickableElement) {
                        lesson.content = 'Error: Could not find clickable lesson element';
                        lesson.textContent = 'Error: Could not find clickable lesson element';
                        lesson.plainTextContent = 'Error: Could not find clickable lesson element';
                        continue;
                    }

                    // Click the lesson
                    clickableElement.click();
                    await sleep(2000); // Wait for navigation

                    // Wait for iframe to appear (lesson content is in iframe)
                    let iframe = null;
                    let attempts = 0;
                    const maxAttempts = 10;

                    while (!iframe && attempts < maxAttempts) {
                        iframe = document.querySelector('iframe[id^="fr-iframe"]');
                        if (!iframe) {
                            await sleep(1000);
                            attempts++;
                        }
                    }

                    if (iframe) {
                        try {
                            // Wait a bit more for iframe content to load
                            await sleep(2000);

                            // Extract content from iframe
                            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                            const bodyContent = iframeDoc.body;

                            if (bodyContent) {
                                // Get the full iframe content
                                lesson.content = bodyContent.innerHTML;

                                // Also specifically extract the "Add text" section content
                                const textSection = iframeDoc.querySelector('.fr-element.fr-view');
                                if (textSection) {
                                    lesson.textContent = textSection.innerHTML;
                                    lesson.plainTextContent = textSection.textContent || textSection.innerText;
                                } else {
                                    lesson.textContent = 'No text section found';
                                    lesson.plainTextContent = 'No text section found';
                                }
                            } else {
                                lesson.content = 'Error: Could not access iframe body content';
                                lesson.textContent = 'Error: Could not access iframe body content';
                                lesson.plainTextContent = 'Error: Could not access iframe body content';
                            }
                        } catch (iframeError) {
                            lesson.content = `Error accessing iframe: ${iframeError.message}`;
                            lesson.textContent = `Error accessing iframe: ${iframeError.message}`;
                            lesson.plainTextContent = `Error accessing iframe: ${iframeError.message}`;
                        }
                    } else {
                        // If no iframe, try to get content directly from page
                        const contentContainer = document.querySelector('.lesson-content, .content-container, main, article');
                        if (contentContainer) {
                            lesson.content = contentContainer.innerHTML;

                            // Try to find text section on main page too
                            const textSection = contentContainer.querySelector('.fr-element.fr-view');
                            if (textSection) {
                                lesson.textContent = textSection.innerHTML;
                                lesson.plainTextContent = textSection.textContent || textSection.innerText;
                            } else {
                                lesson.textContent = 'No text section found';
                                lesson.plainTextContent = 'No text section found';
                            }
                        } else {
                            lesson.content = 'Error: Could not find lesson content container';
                            lesson.textContent = 'Error: Could not find lesson content container';
                            lesson.plainTextContent = 'Error: Could not find lesson content container';
                        }
                    }

                    // Navigate back to curriculum page
                    window.history.back();
                    await sleep(2000); // Wait for page to load

                    // Wait for curriculum sidebar to reappear
                    let sidebarVisible = false;
                    attempts = 0;

                    while (!sidebarVisible && attempts < maxAttempts) {
                        const sidebar = document.querySelector('div.course-tree__chapters_Rs2Sc');
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
                    lesson.content = `Error processing lesson: ${lessonError.message}`;
                    lesson.textContent = `Error processing lesson: ${lessonError.message}`;
                    lesson.plainTextContent = `Error processing lesson: ${lessonError.message}`;

                    // Try to get back to curriculum page
                    try {
                        window.history.back();
                        await sleep(2000);
                    } catch (backError) {
                        // If we can't get back, this is a critical error
                        throw new Error('Failed to navigate back to curriculum after error');
                    }
                }

                // Small delay between lessons to be respectful to the server
                await sleep(500);
            }
        }

        // Step 3: Return the final data
        return {
            courseTitle: document.title || 'Unknown Course',
            extractedAt: new Date().toISOString(),
            totalChapters: coursePlan.length,
            totalLessons: totalLessons,
            chapters: coursePlan
        };

    } catch (error) {
        throw new Error(`Course scraping failed: ${error.message}`);
    }
}