# DOM Cleanup Implementation

## Overview

This document describes the comprehensive DOM sanitization and cleanup implementation based on Node-RED cleanup strategies. The system removes unwanted content from HTML before processing to ensure cleaner summaries and better LLM performance.

## Implementation Details

### Files Modified/Created

1. **`js/htmlSanitizer.js`** - New modular sanitization utility
2. **`pageInteraction.js`** - Updated to use new sanitization
3. **`README.md`** - Updated documentation
4. **`test-sanitization.html`** - Test page for sanitization functionality

### Key Features

#### 1. Comprehensive Element Removal

**Unwanted Classes Removed:**
- Advertising: `advertising`, `ads`, `ad-container`, `ad-banner`, `sponsored`
- Social Media: `sharebox`, `share-buttons`, `social-share`, `social-media`
- Newsletter: `ml-subscribe-form`, `newsletter`, `subscription`, `signup-form`
- Navigation: `navigation`, `nav-menu`, `breadcrumb`, `pagination`, `sidebar`
- Related Content: `related-news`, `related-articles`, `recommended`, `suggestions`
- Metadata: `metainfo__item`, `metadata`, `byline`, `author-info`, `publish-date`
- Extension-specific: `llm-highlight`, `llm-highlight-preview`

**Unwanted HTML Tags Removed:**
- Scripts: `<script>`, `<noscript>`
- Styles: `<style>`
- Interactive: `<form>`, `<input>`, `<button>`, `<select>`, `<textarea>`
- Embedded: `<iframe>`, `<embed>`, `<object>`
- Structural: `<nav>`, `<aside>`, `<footer>`, `<header>`

**Unwanted Attributes Removed:**
- Event handlers: `onclick`, `onload`, `onerror`, `onmouseover`, etc.
- Tracking: `data-track`, `data-analytics`, `data-gtm`, `data-ga`
- Technical: `data-sara-component`, `data-module`, `data-widget`

#### 2. Flexible Sanitization Modes

**Standard Mode:**
- Removes unwanted elements and attributes
- Preserves content structure
- Used for summary processing

**Strict Mode:**
- Only allows specific HTML tags
- Restricts attributes to safe ones
- Can be enabled for high-security scenarios

**Sharing Mode:**
- Optimized for external service sharing
- Additional cleanup for social platforms
- Used for NewsBlur integration

#### 3. Performance Monitoring

- Tracks processing time
- Measures size reduction percentage
- Debug logging for troubleshooting
- Error handling with fallbacks

### Usage Examples

#### Basic Sanitization
```javascript
import { sanitizeHtml } from './js/htmlSanitizer.js';

const cleanHtml = sanitizeHtml(rawHtml, {
  debug: true,
  strict: false
});
```

#### Strict Mode
```javascript
const cleanHtml = sanitizeHtml(rawHtml, {
  strict: true,
  debug: true
});
```

#### Custom Additional Cleanup
```javascript
const cleanHtml = sanitizeHtml(rawHtml, {
  additionalClassesToRemove: ['custom-unwanted-class'],
  additionalTagsToRemove: ['custom-tag']
});
```

#### Sharing Optimization
```javascript
import { sanitizeForSharing } from './js/htmlSanitizer.js';

const cleanHtml = sanitizeForSharing(rawHtml, true); // debug enabled
```

### Integration Points

#### 1. Summary Processing
- Applied before HTML-to-Markdown conversion
- Reduces noise in LLM input
- Improves summary quality

#### 2. NewsBlur Sharing
- Cleans content before sharing
- Removes extension-specific elements
- Optimizes for external platform

#### 3. Joplin Note Creation
- Sanitizes content before saving
- Preserves important formatting
- Removes tracking and ads

### Configuration

The sanitization behavior is controlled by the `SANITIZATION_CONFIG` object in `js/htmlSanitizer.js`:

```javascript
export const SANITIZATION_CONFIG = {
  UNWANTED_CLASSES: [...],
  UNWANTED_TAGS: [...],
  UNWANTED_ATTRIBUTES: [...],
  UNWANTED_SELECTORS: [...],
  ALLOWED_TAGS: [...],
  ALLOWED_ATTRIBUTES: {...}
};
```

### Benefits

1. **Cleaner Summaries**: Removes distracting content that doesn't contribute to the main article
2. **Better LLM Performance**: Reduces token usage and improves focus on relevant content
3. **Privacy Protection**: Removes tracking scripts and analytics code
4. **Consistent Results**: Standardizes content across different websites
5. **Modular Design**: Easy to extend and customize for specific needs

### Testing

Use the included `test-sanitization.html` file to:
- Visualize before/after sanitization
- Test different content types
- Verify removal of unwanted elements
- Measure performance impact

### Future Enhancements

1. **Site-Specific Rules**: Custom sanitization rules for specific domains
2. **User Configuration**: Allow users to customize cleanup behavior
3. **Machine Learning**: Automatically identify unwanted content patterns
4. **Performance Optimization**: Further optimize for large HTML documents
5. **Content Preservation**: Smarter detection of important content vs. noise

## Comparison with Node-RED Implementation

The browser extension implementation closely follows the Node-RED approach:

### Similarities
- Class-based element removal using partial matching
- XPath-like selector targeting
- Attribute cleanup for tracking removal
- Comprehensive unwanted element lists
- Error handling with fallbacks

### Differences
- Uses DOM API instead of xmldom parser
- Browser-specific optimizations
- Extension-specific class removal
- Modular design for reusability
- Performance monitoring built-in

### Advantages
- Native browser DOM performance
- No external dependencies
- Integrated with extension workflow
- Real-time processing feedback
- Extensible configuration system
