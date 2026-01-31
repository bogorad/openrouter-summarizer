// js/htmlSanitizer.js
// Comprehensive HTML sanitization utilities based on Node-RED cleanup strategies

import { Logger } from "./logger.js";

/**
 * Configuration object for HTML sanitization
 */
export const SANITIZATION_CONFIG = {
  // ========================================
  // CLASSES TO REMOVE - EDIT THIS LIST ONLY
  // ========================================
  // Based on Node-RED cleanup strategy (duplicates removed)
  UNWANTED_CLASSES: [
    'advertising',
    'related-news',
    'metainfo__item',
    'headline__inner',
    'sharebox',
    'ml-subscribe-form',
    'article-newsletter-signup--container',
    'n-content-recommended--single-story',
    'styln-edit-storyline',
    'related-links-block',
    'u_sticky-content',
    'ref-ar',
    'undefined',
    'featNewslettersBorder',
    'single__inline-module',
    'comments-inline-cta',
    'llm-highlight-preview'
  ],
  // ========================================

  // HTML tags to completely remove
  UNWANTED_TAGS: [
    'script', 'style', 'noscript', 'iframe', 'embed', 'object',
    'form', 'input', 'button', 'select', 'textarea',
    'nav', 'aside', 'footer', 'header'
  ],

  // Attributes to remove from all elements
  UNWANTED_ATTRIBUTES: [
    // Event handlers
    'onclick', 'onload', 'onerror', 'onmouseover', 'onmouseout',
    'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
    'onkeydown', 'onkeyup', 'onkeypress',
    
    // Tracking and analytics
    'data-track', 'data-analytics', 'data-gtm', 'data-ga',
    'data-sara-component', 'data-module', 'data-widget',
    'data-testid', 'data-cy'
  ],

  // CSS selectors for specific unwanted elements
  UNWANTED_SELECTORS: [
    '[role="application"]',
    '[role="banner"]', 
    '[role="navigation"]',
    '[role="complementary"]',
    '[id*="feature-bar"]',
    '[id*="sidebar"]',
    '[id*="footer"]',
    '[id*="header"]',
    '[data-sara-component*="related-articles"]',
    'button[type="button"]',
    '.advertisement',
    '.widget',
    '[class*="ad-"]',
    '[class*="promo-"]'
  ],

  // Allowed tags for strict sanitization mode
  ALLOWED_TAGS: [
    'p', 'div', 'span', 'a', 'img', 'br', 'hr', 'strong', 'b', 'em', 'i',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote',
    'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'td', 'th'
  ],

  // Allowed attributes for specific tags
  ALLOWED_ATTRIBUTES: {
    'a': ['href', 'title'],
    'img': ['src', 'alt', 'title', 'width', 'height'],
    'table': ['border', 'cellpadding', 'cellspacing'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan']
  }
};

/**
 * HTML sanitization function - removes unwanted classes and elements
 * @param {string} htmlString - Raw HTML string to sanitize
 * @param {Object} options - Sanitization options
 * @param {boolean} options.debug - Enable debug logging
 * @returns {string} - Sanitized HTML string
 */
/**
 * Removes elements by class name using word-boundary matching
 * @param {Element} container - The container element
 * @param {string[]} classNames - Array of class names to remove
 * @param {boolean} debug - Enable debug logging
 */
const removeElementsByClassNames = (container, classNames, debug = false) => {
  classNames.forEach(className => {
    if (!className || typeof className !== 'string') return;

    try {
      // Use CSS selector with word boundary matching (~=)
      // This matches elements where the class attribute contains the exact word
      const elements = container.querySelectorAll(`[class~="${className}"]`);
      elements.forEach(el => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    } catch (e) {
      if (debug) Logger.warn("[HTML Sanitizer]", `Invalid class name skipped: ${className}`, e);
    }
  });
};

export function sanitizeHtml(htmlString, options = {}) {
  const {
    debug = false
  } = options;

  if (!htmlString || typeof htmlString !== 'string') {
    if (debug) Logger.warn("[HTML Sanitizer]", "Invalid HTML input for sanitization");
    return '';
  }

  try {
    // Create a temporary DOM container
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlString;

    const startTime = debug ? performance.now() : 0;
    const originalLength = htmlString.length;

    if (debug) {
      Logger.info("[HTML Sanitizer]", "Starting sanitization");
      Logger.info("[HTML Sanitizer]", "Original HTML length:", originalLength);
    }

    // Use the single list of classes to remove
    const classesToRemove = SANITIZATION_CONFIG.UNWANTED_CLASSES;
    const tagsToRemove = SANITIZATION_CONFIG.UNWANTED_TAGS;

    // Remove unwanted tags completely
    tagsToRemove.forEach(tagName => {
      const elements = tempDiv.querySelectorAll(tagName);
      elements.forEach(el => {
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
    });

    // Remove elements by class names using word-boundary matching
    removeElementsByClassNames(tempDiv, classesToRemove, debug);

    // Remove elements by specific selectors
    SANITIZATION_CONFIG.UNWANTED_SELECTORS.forEach(selector => {
      try {
        const elements = tempDiv.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      } catch (e) {
        if (debug) Logger.warn("[HTML Sanitizer]", `Invalid selector: ${selector}`, e);
      }
    });



    // Clean up attributes
    const allElements = tempDiv.querySelectorAll('*');
    allElements.forEach(el => {
      // Remove unwanted attributes
      SANITIZATION_CONFIG.UNWANTED_ATTRIBUTES.forEach(attr => {
        if (el.hasAttribute(attr)) {
          el.removeAttribute(attr);
        }
      });
      
      // Remove tracking data attributes
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-') && 
            (attr.name.includes('track') || 
             attr.name.includes('analytics') || 
             attr.name.includes('gtm') ||
             attr.name.includes('ga-'))) {
          el.removeAttribute(attr.name);
        }
      });


    });

    // Remove empty elements that might be left behind
    const emptyElements = tempDiv.querySelectorAll('div:empty, span:empty, p:empty');
    emptyElements.forEach(el => {
      if (el.parentNode && !el.hasChildNodes()) {
        el.parentNode.removeChild(el);
      }
    });

    const cleanedHtml = tempDiv.innerHTML;

    // Safety check: if sanitization removed all meaningful content, warn and consider fallback
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    const hasImages = tempDiv.querySelectorAll('img').length > 0;
    const hasLinks = tempDiv.querySelectorAll('a').length > 0;

    if (debug) {
      const endTime = performance.now();
      const finalLength = cleanedHtml.length;
      const reduction = ((originalLength - finalLength) / originalLength * 100).toFixed(1);

      Logger.info("[HTML Sanitizer]", "Sanitization complete");
      Logger.info("[HTML Sanitizer]", "Final HTML length:", finalLength);
      Logger.info("[HTML Sanitizer]", "Text content length:", textContent.trim().length);
      Logger.info("[HTML Sanitizer]", "Has images:", hasImages);
      Logger.info("[HTML Sanitizer]", "Has links:", hasLinks);
      Logger.info("[HTML Sanitizer]", "Size reduction:", reduction + "%");
      Logger.info("[HTML Sanitizer]", "Processing time:", (endTime - startTime).toFixed(2) + "ms");

      // Warn if content seems to be completely removed
      if (textContent.trim().length === 0 && !hasImages && !hasLinks) {
        Logger.warn("[HTML Sanitizer]", "WARNING: Sanitization may have removed all meaningful content!");
        Logger.info("[HTML Sanitizer]", "Original HTML preview:", htmlString.substring(0, 200));
        Logger.info("[HTML Sanitizer]", "Cleaned HTML:", cleanedHtml);
      }
    }

    return cleanedHtml;

  } catch (error) {
    Logger.error("[HTML Sanitizer]", "Error during HTML sanitization:", error);
    // Return original HTML as fallback
    return htmlString;
  }
}

/**
 * Quick clean - removes NOTHING (fallback mode)
 * @param {string} htmlString - HTML string
 * @returns {string} - Original HTML with no changes
 */
export function quickCleanHtml(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    return '';
  }

  // DO NOTHING - return original HTML
  return htmlString;
}

/**
 * Sanitize HTML for sharing to external services
 * @param {string} htmlString - HTML string to sanitize
 * @param {boolean} debug - Enable debug logging
 * @returns {string} - Sanitized HTML suitable for sharing
 */
export function sanitizeForSharing(htmlString, debug = false) {
  return sanitizeHtml(htmlString, {
    debug: debug
  });
}
