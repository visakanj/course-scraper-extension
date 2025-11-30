# Thinkific Course Scraper

A Chrome extension for extracting course content from Thinkific platforms for migration, backup, and archival purposes.

## Features

- Extracts course structure (chapters and lessons)
- Scrapes text/HTML lesson content
- Extracts video metadata and URLs (HTML5, Vimeo, YouTube, Wistia, AWS S3)
- Captures downloadable file links (PDFs, ZIPs, documents)
- Robust multi-level selector fallback system
- Automatic retry logic with exponential backoff
- Real-time progress tracking
- Error logging and reporting
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

### Step 1: Navigate to Course Curriculum

1. Log in to your Thinkific course
2. Navigate to the **course curriculum page** (the page that shows all chapters and lessons)
3. Make sure you're viewing the full course outline

### Step 2: Start Scraping

1. Click the Thinkific Course Scraper extension icon in your Chrome toolbar
2. The popup will open showing:
   - Instructions
   - "Start Scraping" button
   - Status message
3. Click **"Start Scraping"** button
4. The extension will:
   - Build a course map (extract all chapter/lesson structure)
   - Navigate through each lesson sequentially
   - Extract content based on lesson type
   - Return to curriculum page between lessons
   - Display real-time progress

### Step 3: Monitor Progress

The popup shows:
- **Progress bar**: Visual progress indicator
- **Lesson count**: "X / Y lessons" completed
- **Percentage**: Overall completion percentage
- **Current lesson**: "Chapter → Lesson" being scraped
- **Status messages**: Current operation status
- **Error log**: Expandable list of any errors encountered

### Step 4: Download Results

When scraping completes:
- A JSON file is automatically downloaded
- Filename format: `thinkific_[course_name]_[timestamp].json`
- File contains:
  - Course metadata (title, curriculum URL, timestamps)
  - All chapters and lessons
  - Extracted content for each lesson
  - Error log (if any)

### Cancelling

- Click the **"Cancel"** button to stop scraping mid-process
- Already scraped lessons will be saved
- Partial results can still be downloaded

## Output Format

The extension generates a JSON file with the following structure:

```json
{
  "courseTitle": "Course Name",
  "curriculumUrl": "https://...",
  "totalChapters": 5,
  "totalLessons": 32,
  "extractedAt": "2025-11-30T12:00:00.000Z",
  "chapters": [
    {
      "chapterTitle": "Chapter 1: Introduction",
      "chapterIndex": 0,
      "lessons": [
        {
          "title": "Lesson 1: Getting Started",
          "type": "text|video|download|quiz",
          "url": "https://...",
          "content": {
            "type": "text",
            "html": "<full HTML content>",
            "plainText": "Plain text version"
          },
          "scrapedAt": "2025-11-30T12:01:00.000Z"
        }
      ]
    }
  ],
  "scrapedLessons": [...],
  "errors": [
    {
      "context": "Lesson: XYZ",
      "message": "Error description",
      "timestamp": "2025-11-30T12:02:00.000Z"
    }
  ],
  "completedAt": "2025-11-30T12:30:00.000Z"
}
```

### Content Types

**Text Lessons:**
```json
{
  "type": "text",
  "html": "<div>HTML content from iframe</div>",
  "plainText": "Plain text content"
}
```

**Video Lessons:**
```json
{
  "type": "video",
  "sources": [
    {
      "url": "https://example.com/video.mp4",
      "type": "html5|embed|aws-s3"
    }
  ],
  "provider": "vimeo|youtube|wistia|aws-s3|html5",
  "embedUrl": "https://player.vimeo.com/video/123456",
  "videoId": "123456",
  "thumbnail": "https://..."
}
```

**Download Lessons:**
```json
{
  "type": "download",
  "files": [
    {
      "url": "https://example.com/file.pdf",
      "filename": "file.pdf",
      "fileType": "pdf",
      "linkText": "Download PDF",
      "isAwsS3": true
    }
  ]
}
```

## How It Works

### Architecture

The extension uses a multi-component architecture:

1. **popup.js**: Orchestrates the scraping process
2. **content-scraper.js**: Builds course map from curriculum page
3. **lesson-scraper.js**: Extracts content from individual lessons
4. **selectors.js**: Multi-level fallback selector system
5. **utils.js**: Shared utilities (retry logic, navigation, etc.)

### Scraping Process

1. **Build Course Map**: Inject `content-scraper.js` into curriculum page to extract:
   - All chapter titles
   - All lesson titles and types
   - Direct URLs to each lesson

2. **Sequential Scraping**: For each lesson:
   - Navigate to lesson URL (direct navigation, not history.back)
   - Inject `lesson-scraper.js`
   - Extract content based on type (text/video/download)
   - Handle iframe content using `allFrames: true` injection
   - Navigate back to curriculum
   - Wait 2.5 seconds before next lesson

3. **Error Handling**: If a lesson fails:
   - Retry up to 3 times with exponential backoff (1s, 2s, 4s)
   - Log error and continue with next lesson
   - Include error in final output

4. **Download**: Generate JSON and download using Chrome downloads API

### Iframe Content Extraction

The extension solves the cross-origin iframe problem using:

1. **Primary Method**: `chrome.scripting.executeScript({ allFrames: true })`
   - Injects script into both main page and iframe contexts
   - Script running in iframe has direct DOM access
   - Returns content to main context

2. **Fallback Method**: Check main page DOM
   - If iframe injection fails
   - Search for content in main page structure

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

1. **Quiz Content**: Quiz questions and answers are not fully extracted (detected but not parsed)

2. **SCORM Packages**: Cannot extract SCORM/xAPI content via DOM scraping

3. **Video Files**: Only captures video URLs and metadata, does not download actual video files

4. **Protected Content**: Cannot extract DRM-protected or copy-protected content

5. **Authentication**: Assumes you're already logged in (no automatic login)

6. **Rate Limiting**: No built-in rate limiting (uses fixed 2.5s delays)

7. **Thinkific Updates**: CSS selectors may break if Thinkific updates their frontend

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
├── manifest.json           # Chrome extension configuration
├── popup.html             # Extension popup UI
├── popup.js               # Main orchestration controller
├── styles.css             # Popup UI styles
├── content-scraper.js     # Course map builder
├── lesson-scraper.js      # Lesson content extractor
├── selectors.js           # Multi-level selector fallbacks
├── utils.js               # Shared utilities
├── index.html             # (Legacy API approach - unused)
├── popup-test.html        # (Test file - unused)
└── popup-test.js          # (Test file - unused)
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
- `[Popup]`: popup.js orchestration
- `[ContentScraper]`: Course map building
- `[LessonScraper]`: Lesson content extraction
- `[IframeScraper]`: Iframe content extraction
- `[FindElement]`: Selector matching
- `[Navigate]`: Navigation operations
- `[Retry]`: Retry logic

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
