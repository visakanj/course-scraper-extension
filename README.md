# Thinkific Course Scraper

A Chrome extension for extracting course content from Thinkific platforms for migration, backup, and archival purposes.

## Features

- Extracts course structure (chapters and lessons)
- Scrapes text/HTML lesson content
- Extracts video metadata and URLs (HTML5, Vimeo, YouTube, Wistia, AWS S3)
- Captures downloadable file links (PDFs, ZIPs, documents)
- **Real-time progress tracking** with live progress bar and percentage
- **Functional Cancel button** - gracefully stop scraping at any time
- **Current lesson display** - see which lesson is being scraped in real-time
- Robust multi-level selector fallback system
- Automatic retry logic with exponential backoff
- Comprehensive error logging and reporting
- Exports structured JSON data

## Installation

### Load Unpacked Extension

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top-right corner)
4. Click "Load unpacked"
5. Select the `course-scraper` directory
6. The extension icon should appear in your Chrome toolbar

### Grant Permissions

When you first use the extension on a Thinkific site, Chrome will ask for permission to:
- Access data on `*.thinkific.com` domains
- Access data on `*.amazonaws.com` (for AWS S3 hosted content)

Click "Allow" to grant these permissions.

## Usage

### Step 1: Navigate to Course Curriculum (Instructor View)

1. Log in to your Thinkific account **as an instructor**
2. Navigate to the **course curriculum management page** (the page where you edit the course structure)
3. Make sure you're viewing the full course outline with all chapters and lessons visible in the left sidebar
4. **Important**: You must be on the instructor/admin curriculum page, not the student view

### Step 2: Start Scraping

1. Click the Thinkific Course Scraper extension icon in your Chrome toolbar
2. The popup will open showing:
   - Instructions
   - "Start Scraping" button
   - Status message
3. Click **"Start Scraping"** button
4. The extension will:
   - Build a course map (extract all chapter/lesson structure from the sidebar)
   - Stay on the curriculum page (no navigation away from the page)
   - Click through each lesson in the sidebar sequentially
   - Wait for each lesson to load in the right-hand editor panel
   - Extract text content from the editor area
   - Display progress in the browser console

### Step 3: Monitor Progress

The popup shows **real-time updates** as scraping progresses:
- **Progress bar**: Visual progress indicator that fills as lessons are completed
- **Lesson count**: "X / Y lessons" (e.g., "5 / 20 lessons")
- **Percentage**: Overall completion percentage (e.g., "25%")
- **Status messages**: Shows current operation:
  - "Scanning lessons..." - Building course structure
  - "Scraping: [Lesson Title]" - Currently extracting this lesson
  - "Scraping complete. Downloading JSON..." - Finished successfully
  - "Scraping cancelled. No file downloaded." - Cancelled by user
- **Cancel button**: Click to stop scraping gracefully (finishes current lesson then stops)
- **Error log**: Expandable list of any errors encountered (if applicable)

### Step 4: Download Results

When scraping completes:
- A JSON file is automatically downloaded
- Filename format: `thinkific_[course_name]_[timestamp].json`
- File contains:
  - Course metadata (title, curriculum URL, timestamps)
  - All chapters and lessons
  - Extracted content for each lesson
  - Error log (if any)

### Cancelling Scraping

You can stop the scraping process at any time:

1. Click the **"Cancel"** button in the popup
2. The scraper will finish extracting the current lesson
3. The scraping process will stop gracefully
4. **No file is downloaded** when scraping is cancelled
5. Status will display: "Scraping cancelled. No file downloaded."
6. The "Start Scraping" button becomes enabled again for a new attempt

**Note**: Partial data is not saved when you cancel. To get a complete export, let the scraping finish or restart from the beginning.

## Output Format

The extension generates a JSON file with the following structure:

```json
{
  "cancelled": false,
  "courseTitle": "Course Name",
  "curriculumUrl": "https://your-site.thinkific.com/manage/courses/...",
  "extractedAt": "2025-11-30T12:00:00.000Z",
  "totalChapters": 5,
  "totalLessons": 32,
  "chapters": [
    {
      "chapterTitle": "Chapter 1: Introduction",
      "chapterIndex": 0,
      "lessons": [
        {
          "title": "Lesson 1: Getting Started",
          "type": "text",
          "url": "https://your-site.thinkific.com/manage/courses/.../items/.../edit",
          "chapterIndex": 0,
          "lessonIndex": 0,
          "content": "<p>Full HTML content from the lesson</p>",
          "textContent": "Full HTML content from the lesson",
          "plainTextContent": "Full HTML content from the lesson"
        },
        {
          "title": "Lesson 2: Video Tutorial",
          "type": "video",
          "url": "https://your-site.thinkific.com/manage/courses/.../items/.../edit",
          "chapterIndex": 0,
          "lessonIndex": 1,
          "content": null,
          "textContent": null,
          "plainTextContent": null
        }
      ]
    }
  ]
}
```

### Top-Level Fields

- **cancelled**: Boolean flag indicating if scraping was cancelled by the user (`true` = cancelled, `false` = completed normally)
- **courseTitle**: The course title extracted from the page
- **curriculumUrl**: The URL of the curriculum management page
- **extractedAt**: ISO 8601 timestamp of when the scraping occurred
- **totalChapters**: Total number of chapters found
- **totalLessons**: Total number of lessons across all chapters
- **chapters**: Array of chapter objects (see below)

### Lesson Fields

Each lesson object contains:

- **title**: Lesson title (string)
- **type**: Detected lesson type: `text`, `video`, `quiz`, `download`, or `unknown` (string)
- **url**: Lesson edit URL (string or null)
- **chapterIndex**: Index of the chapter containing this lesson (number)
- **lessonIndex**: Index within the chapter (number)
- **content**: Raw HTML content from the lesson (string or null)
- **textContent**: Plain text version of the content (string or null)
- **plainTextContent**: Plain text content with normalized whitespace (string or null)
- **error** (optional): Error message if content extraction failed (string)

### Content Extraction

**Text Lessons**: The extension extracts the `text_html` field from the lesson edit page, which contains the full HTML content created in the WYSIWYG editor.

**Other Lesson Types**: Currently, only text lesson content is extracted. Video, quiz, and download lessons will have `content`, `textContent`, and `plainTextContent` set to `null`. The lesson `type` field indicates what kind of lesson it is.

## How It Works

### Architecture

The extension uses a Chrome MV3 click-through DOM scraping architecture:

1. **popup.js**: Main orchestration controller (runs in extension context)
2. **selectors.js**: Multi-level fallback selector system (injected into page)
3. **utils.js**: Shared utilities for DOM operations (injected into page)
4. **clickThroughAndScrapeCourse()**: Injected function that runs in the page context

### Scraping Process

1. **Inject Scripts**:
   - Extension injects `selectors.js` and `utils.js` into the Thinkific curriculum page
   - Extension then injects and executes `clickThroughAndScrapeCourse()` function

2. **Build Course Structure**:
   - Function finds all chapter containers in the sidebar
   - Extracts chapter titles and lesson cards
   - Builds a course plan with chapters and lessons

3. **Progress Tracking & Cancellation**:
   - Sends `tcs-init` message to popup with total lesson count
   - Before each lesson, checks `window.__TCS_CANCELLED` flag
   - If cancelled: sends `tcs-cancelled` message, stops loop, returns partial data
   - After each lesson: increments counter, sends `tcs-progress` message with lesson title
   - At completion: sends `tcs-done` message (if not cancelled)
   - Popup receives messages via `chrome.runtime.onMessage` and updates UI in real-time

4. **Click Through Lessons** (stays on curriculum page):
   - For each lesson in the course plan:
     - **Check cancellation flag first** - exit gracefully if Cancel was clicked
     - Finds the lesson card in the sidebar by matching title
     - Scrolls the card into view
     - Simulates real mouse click (pointerdown → mousedown → mouseup → click)
     - Waits for the right-hand editor panel to load with that lesson
     - Extracts text content from the editor area
     - Populates `content`, `textContent`, and `plainTextContent`
     - **Sends progress message** to update popup UI

6. **Wait for Lesson Load**:
   - `waitForLessonLoaded()` polls the editor panel title
   - Compares normalized title with expected lesson title
   - Waits up to 12 seconds for the lesson to appear
   - Logs editor title on each poll for debugging
   - Adds extra 500ms delay for editor content to render

7. **Extract Lesson Text**:
   - `extractLessonText()` looks for the lesson text editor element
   - Tries direct `contenteditable` div first (e.g., Froala `.fr-element.fr-view`)
   - Falls back to iframe access if editor is in an iframe
   - Extracts both HTML (`innerHTML`) and plain text (`innerText`)

8. **Error Handling**: If a lesson fails:
   - Logs the error to console
   - Sets `content`, `textContent`, and `plainTextContent` to `null`
   - Sets `error` field with error message
   - Continues with the next lesson

9. **Download**:
   - Generate JSON with `cancelled` flag
   - **Check if scraping was cancelled** (`courseData.cancelled` or `wasCancelled`)
   - If cancelled: Skip download, show "Scraping cancelled. No file downloaded."
   - If completed: Download JSON using Chrome downloads API

### DOM Scraping Solution

This architecture avoids cross-origin issues by:

1. **Everything runs in page context**: The entire scraping function executes inside the Thinkific page, not in the extension popup
2. **No navigation required**: Stays on the curriculum page and uses DOM manipulation
3. **Direct DOM access**: Clicks lesson cards and reads editor content directly from the DOM
4. **Same-origin**: All DOM elements are on the same Thinkific domain, so no CORS issues

## Troubleshooting

### "No chapters found" Error

**Problem**: Extension can't find course structure

**Solutions**:
- Make sure you're on the **curriculum page** (not inside a lesson)
- Wait for page to fully load before clicking "Start Scraping"
- Check browser console for selector errors
- Try refreshing the page

### "Failed to build course map" Error

**Problem**: Course structure extraction failed

**Solutions**:
- Verify you're logged in to the course
- Check if the course has any lessons
- Look for JavaScript errors in browser console
- Try different Thinkific course

### Lessons Missing Content

**Problem**: Some lessons show empty content or errors

**Common Causes**:
- **Cross-origin iframe**: Content is in iframe from different domain
- **Dynamic loading**: Content loads after scraper runs
- **Protected content**: DRM or copy-protection prevents extraction

**Solutions**:
- Check error log for specific error messages
- Wait longer before starting scrape (let page fully load)
- Manually verify content is visible on the page

### Extension Doesn't Work on Course

**Problem**: Extension fails or shows errors on specific course

**Possible Reasons**:
- Thinkific updated their HTML structure
- Custom Thinkific theme with different selectors
- Course uses custom LMS features

**Solutions**:
- Check browser console for specific errors
- Report issue with course URL (if shareable)
- Selectors may need updating in `selectors.js`

### Slow Scraping

**Problem**: Extension takes a long time

**Expected Behavior**:
- Sequential processing: one lesson at a time
- 2.5 second delay between lessons
- Estimated time: 2-3 minutes for 50 lessons

**This is intentional** to:
- Avoid overwhelming Thinkific servers
- Prevent rate limiting or IP blocking
- Ensure reliable content extraction

## Known Limitations

1. **Text Lessons Only**: Currently only extracts text lesson content from the editor. Video, quiz, and download lessons are detected but their content is not extracted.

2. **Requires Instructor Access**: You must be logged in as a course instructor/admin and be on the curriculum management page.

3. **DOM Dependency**: The extension relies on finding specific DOM elements (lesson cards, editor panels). If Thinkific changes their HTML structure, selectors may need updates.

4. **No Video Downloads**: Does not download video files, only extracts text content.

5. **Sequential Processing**: Processes one lesson at a time by clicking through them sequentially. This is intentional to allow the editor panel to load properly.

6. **Authentication Required**: Assumes you're already logged in (no automatic login).

7. **Single Tab**: The extension must run while the Thinkific tab is active. Do not switch tabs or close the browser during scraping.

8. **Lesson Title Matching**: Lessons are identified by title matching. If multiple lessons have identical titles, the scraper may not handle them correctly.

## Privacy & Security

- All scraping happens **locally in your browser**
- No data is sent to external servers
- Extension only accesses the Thinkific pages you're viewing
- Scraped data is downloaded directly to your computer
- No analytics or tracking

## Permissions Explained

- **activeTab**: Access the current Thinkific tab
- **scripting**: Inject content scripts to extract course data
- **downloads**: Save JSON file to your downloads folder
- **host_permissions (*.thinkific.com)**: Access Thinkific course pages
- **host_permissions (*.amazonaws.com)**: Access AWS S3 hosted content

## Development

### File Structure

```
course-scraper/
├── manifest.json           # Chrome extension configuration (MV3)
├── popup.html             # Extension popup UI
├── popup.js               # Main controller + clickThroughAndScrapeCourse() function
├── styles.css             # Popup UI styles
├── selectors.js           # Multi-level selector fallbacks (injected into page)
├── utils.js               # Shared utilities (injected into page)
├── content-scraper.js     # (Legacy - not used in click-through architecture)
├── lesson-scraper.js      # (Legacy - not used in click-through architecture)
└── README.md              # This file
```

### Testing

1. Load extension in Chrome
2. Navigate to Thinkific course curriculum
3. Open browser console (F12) for detailed logs
4. Click "Start Scraping"
5. Monitor console for detailed execution logs
6. Check downloaded JSON for content

### Debugging

All console logs are prefixed with component names:
- `[Popup]`: popup.js orchestration and message handling
- `[Scraper]`: clickThroughAndScrapeCourse() function running in page context
- `[Plan]`: Course plan building with lesson details
- `[Debug]`: Diagnostic information (lesson matching, DOM queries)
- `[FindElement]`: Selector matching (from selectors.js)
- `[FindElements]`: Multiple element matching (from selectors.js)

**Runtime Messages** (for progress tracking):
- `tcs-init`: Sent when course plan is built (includes total lesson count)
- `tcs-progress`: Sent after each lesson (includes completed count and lesson title)
- `tcs-done`: Sent when all lessons completed successfully
- `tcs-cancelled`: Sent when user clicks Cancel

To debug:
1. Open Chrome DevTools (F12) on the Thinkific curriculum page
2. Go to the Console tab
3. Click "Start Scraping" in the extension popup
4. Watch the console for detailed logs:
   - `[Plan]` logs: Each lesson as it's added to the course plan
   - `[Scraper]` logs: Processing each lesson with chapter/lesson indices
   - `[Debug]` logs: DOM query results, title comparisons, match attempts
   - `[Scraper]` logs: Click targets, editor title polling, content extraction
   - Runtime message sends: `tcs-init`, `tcs-progress`, etc.
5. Watch the popup UI update in real-time (progress bar, lesson count, status)
6. Check the downloaded JSON to verify content extraction

**Tip**: You can watch the extension click through lessons in real-time by keeping the Thinkific tab visible while scraping. The popup will show which lesson is currently being processed.

## Contributing

### Updating Selectors

If Thinkific updates their HTML structure, update `selectors.js`:

1. Inspect the new Thinkific HTML in Chrome DevTools
2. Identify new CSS selectors for elements
3. Add new selectors to appropriate arrays in `SELECTORS` object
4. Test on live Thinkific course

### Reporting Issues

When reporting issues, please include:
- Chrome version
- Extension version (check manifest.json)
- Thinkific course URL (if shareable)
- Browser console errors
- Specific error messages from extension

## License

MIT License - feel free to modify and use as needed.

## Disclaimer

This tool is for educational and backup purposes. Ensure you have the right to access and download course content. Respect copyright and terms of service.

## Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Version**: 2.0
**Last Updated**: November 2025
**Author**: Built with Claude Code
