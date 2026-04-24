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

    // Inline execution/style surfaces
    'style', 'srcdoc',
    
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

export const SANITIZER_VARIANTS = Object.freeze({
  DISPLAY_HTML: 'displayHtml',
  SHARING_HTML: 'sharingHtml',
  INERT_TEXT: 'inertText'
});

const SAFE_HREF_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);
const SAFE_SRC_PROTOCOLS = new Set(['http:', 'https:']);
const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background']);
const GLOBAL_ALLOWED_ATTRIBUTES = new Set(['title', 'alt', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'colspan', 'rowspan']);

const SANITIZER_POLICIES = Object.freeze({
  [SANITIZER_VARIANTS.DISPLAY_HTML]: Object.freeze({
    variant: SANITIZER_VARIANTS.DISPLAY_HTML,
    unwrapUnknownTags: true,
    removeEmptyTextContainers: true
  }),
  [SANITIZER_VARIANTS.SHARING_HTML]: Object.freeze({
    variant: SANITIZER_VARIANTS.SHARING_HTML,
    unwrapUnknownTags: true,
    removeEmptyTextContainers: true
  })
});

/**
 * Escapes HTML so sanitizer failures return inert text instead of unsafe markup.
 * @param {string} value - Raw fallback text.
 * @returns {string} HTML-escaped fallback text.
 */
const escapeHtmlFallback = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/**
 * Converts unknown or unsafe content into inert text.
 * @param {string} value - Raw fallback text.
 * @returns {string} Escaped inert HTML text.
 */
export const sanitizeInertText = (value) => {
  if (value === null || value === undefined) return '';
  return escapeHtmlFallback(value);
};

/**
 * Compatibility name for sanitizer failure fallbacks.
 * @param {string} value - Raw fallback text.
 * @returns {string} Escaped inert HTML text.
 */
export const sanitizeFallbackText = (value) => sanitizeInertText(value);

/**
 * Gets a stable base URL for validating relative URL attribute values.
 * @returns {string} Base URL for URL parsing.
 */
const getSanitizerBaseUrl = () => {
  if (typeof document !== 'undefined' && document.baseURI) {
    return document.baseURI;
  }

  if (typeof window !== 'undefined' && window.location?.href) {
    return window.location.href;
  }

  return 'https://example.invalid/';
};

/**
 * Checks whether an href/src value is safe to keep on sanitized HTML.
 * @param {string} attrName - Attribute name being checked.
 * @param {string} attrValue - Attribute value being checked.
 * @returns {boolean} True when the URL uses an allowed protocol.
 */
const isSafeUrlAttributeValue = (attrName, attrValue) => {
  const value = String(attrValue || '').trim();
  if (!value) return false;

  const normalizedValue = value.replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (!normalizedValue) return false;

  try {
    const url = new URL(normalizedValue, getSanitizerBaseUrl());
    if (attrName === 'href' || attrName === 'xlink:href') return SAFE_HREF_PROTOCOLS.has(url.protocol);
    if (URL_ATTRIBUTES.has(attrName)) return SAFE_SRC_PROTOCOLS.has(url.protocol);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Checks whether an attribute is safe for the configured output policy.
 * @param {string} tagName - Lowercase element tag name.
 * @param {Attr} attr - Attribute to validate.
 * @returns {boolean} True when the attribute can remain.
 */
const isAllowedAttribute = (tagName, attr) => {
  const attrName = attr.name.toLowerCase();
  if (SANITIZATION_CONFIG.UNWANTED_ATTRIBUTES.includes(attrName)) return false;
  if (attrName.startsWith('on')) return false;
  if (attrName === 'style' || attrName === 'srcdoc') return false;
  if (URL_ATTRIBUTES.has(attrName)) return isSafeUrlAttributeValue(attrName, attr.value);
  if (attrName.startsWith('data-')) return false;

  const allowedForTag = SANITIZATION_CONFIG.ALLOWED_ATTRIBUTES[tagName] || [];
  return allowedForTag.includes(attrName) || GLOBAL_ALLOWED_ATTRIBUTES.has(attrName);
};

/**
 * Removes unsafe attributes according to the central sanitizer policy.
 * @param {Element} el - Element whose attributes should be checked.
 */
const removeUnsafeAttributes = (el) => {
  const tagName = el.tagName.toLowerCase();

  Array.from(el.attributes).forEach(attr => {
    if (!isAllowedAttribute(tagName, attr)) {
      el.removeAttribute(attr.name);
    }
  });
};

/**
 * Removes elements not present in the allow-list while keeping their text/children.
 * @param {Element} container - Container to clean.
 */
const unwrapUnsupportedTags = (container) => {
  const allowedTags = new Set(SANITIZATION_CONFIG.ALLOWED_TAGS);
  const elements = Array.from(container.querySelectorAll('*')).reverse();

  elements.forEach(el => {
    const tagName = el.tagName.toLowerCase();
    if (allowedTags.has(tagName) || !el.parentNode) return;
    el.replaceWith(...Array.from(el.childNodes));
  });
};

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

/**
 * HTML sanitization function - removes unwanted classes and elements
 * @param {string} htmlString - Raw HTML string to sanitize
 * @param {Object} options - Sanitization options
 * @param {boolean} options.debug - Enable debug logging
 * @returns {string} - Sanitized HTML string
 */
const sanitizeHtmlWithPolicy = (htmlString, policy, options = {}) => {
  const {
    debug = false
  } = options;

  if (!htmlString || typeof htmlString !== 'string') {
    if (debug) Logger.warn("[HTML Sanitizer]", "Invalid HTML input for sanitization");
    return '';
  }

  try {
    if (typeof document === 'undefined') {
      if (debug) Logger.warn("[HTML Sanitizer]", "Document unavailable; returning inert fallback");
      return sanitizeInertText(htmlString);
    }

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

    if (policy.unwrapUnknownTags) {
      unwrapUnsupportedTags(tempDiv);
    }

    // Clean up attributes
    const allElements = tempDiv.querySelectorAll('*');
    allElements.forEach(el => {
      removeUnsafeAttributes(el);
    });

    // Remove empty elements that might be left behind
    if (policy.removeEmptyTextContainers) {
      const emptyElements = tempDiv.querySelectorAll('div:empty, span:empty, p:empty');
      emptyElements.forEach(el => {
        if (el.parentNode && !el.hasChildNodes()) {
          el.parentNode.removeChild(el);
        }
      });
    }

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
    return sanitizeFallbackText(htmlString);
  }
};

/**
 * Sanitizes HTML for extension display surfaces.
 * @param {string} htmlString - Raw HTML string to sanitize.
 * @param {Object} options - Sanitization options.
 * @param {boolean} options.debug - Enable debug logging.
 * @returns {string} Sanitized display HTML.
 */
export function sanitizeDisplayHtml(htmlString, options = {}) {
  return sanitizeHtmlWithPolicy(htmlString, SANITIZER_POLICIES[SANITIZER_VARIANTS.DISPLAY_HTML], options);
}

/**
 * Sanitizes HTML for external sharing surfaces.
 * @param {string} htmlString - Raw HTML string to sanitize.
 * @param {Object} options - Sanitization options.
 * @param {boolean} options.debug - Enable debug logging.
 * @returns {string} Sanitized sharing HTML.
 */
export function sanitizeSharingHtml(htmlString, options = {}) {
  return sanitizeHtmlWithPolicy(htmlString, SANITIZER_POLICIES[SANITIZER_VARIANTS.SHARING_HTML], options);
}

/**
 * HTML sanitization function - removes unsafe and unwanted content for display.
 * @param {string} htmlString - Raw HTML string to sanitize
 * @param {Object} options - Sanitization options
 * @param {boolean} options.debug - Enable debug logging
 * @returns {string} - Sanitized HTML string
 */
export function sanitizeHtml(htmlString, options = {}) {
  return sanitizeDisplayHtml(htmlString, options);
}

/**
 * Quick clean fallback that still returns sanitized HTML.
 * @param {string} htmlString - HTML string
 * @returns {string} - Sanitized HTML
 */
export function quickCleanHtml(htmlString) {
  if (!htmlString || typeof htmlString !== 'string') {
    return '';
  }

  return sanitizeDisplayHtml(htmlString);
}

/**
 * Sanitize HTML for sharing to external services
 * @param {string} htmlString - HTML string to sanitize
 * @param {boolean} debug - Enable debug logging
 * @returns {string} - Sanitized HTML suitable for sharing
 */
export function sanitizeForSharing(htmlString, debug = false) {
  return sanitizeSharingHtml(htmlString, {
    debug
  });
}
