# Plan: Fix CSS Isolation with Shadow DOM

## 1. Executive Summary
**Problem:** The summary popup and floating icon are injected directly into the host page's DOM, inheriting global CSS styles (fonts, colors, z-index) that break the UI on many websites.

**Solution:** Migrate UI components (`summaryPopup.js` and `floatingIcon.js`) to use **Shadow DOM**. This will encapsulate the components, preventing page styles from leaking in and component styles from leaking out.

**Target Files:**
- `summaryPopup.js`
- `floatingIcon.js`
- `pageInteraction.css` (partially obsolete, will be migrated)

---

## 2. Technical Implementation Details

### Phase 1: Modify `summaryPopup.js`

#### 1.1. Update Template Generation
**Current:**
```javascript
// Creates a DOM element from template string
const template = document.createElement("template");
template.innerHTML = POPUP_TEMPLATE_HTML.trim();
popup = template.content.firstChild.cloneNode(true);
```

**New:**
```javascript
// Create a host element
const host = document.createElement("div");
host.style.position = "fixed";
host.style.zIndex = "2147483647"; // Max z-index
// ... other positioning styles ...

// Attach Shadow DOM
const shadow = host.attachShadow({ mode: "open" });

// Inject Styles into Shadow DOM
const styleTag = document.createElement("style");
styleTag.textContent = CSS_CONTENT_STRING; // Move all CSS here
shadow.appendChild(styleTag);

// Inject Template into Shadow DOM
shadow.innerHTML += POPUP_TEMPLATE_HTML.trim();

// Append host to document body
document.body.appendChild(host);

// Return the shadow root for querying, but track 'host' for removal
```

#### 1.2. Refactor Selectors and Event Listeners
**Current:** Uses global `document.querySelector`.
**New:** Must use `shadowRoot.querySelector` to find buttons inside the template.

**Example:**
```javascript
// Old
const copyBtn = popup.querySelector(`.${POPUP_COPY_BTN_CLASS}`);

// New
const copyBtn = shadow.querySelector(`.${POPUP_COPY_BTN_CLASS}`);
```

#### 1.3. Handle Global Events (Keydown)
**Current:** `document.addEventListener("keydown", ...)`
**New:** The keydown listener must remain on `document` to catch keystrokes globally, but it will query the shadow DOM to find buttons.

#### 1.4. Cleanup Logic
**Current:** Removes the `popup` element.
**New:** Must remove the `host` element.

---

### Phase 2: Modify `floatingIcon.js`

Follow the exact same pattern as `summaryPopup.js`.

#### 2.1. Extract CSS
Move CSS from `pageInteraction.css` (related to floating icon) into a JS string constant inside `floatingIcon.js`.

#### 2.2. Wrap in Shadow DOM
Apply the `host.attachShadow({ mode: "open" })` pattern.

---

### Phase 3: Modify `pageInteraction.css`

**Action:** Remove all styles that target `.summarizer-popup`, `.floating-icon`, and related child elements.

**Rationale:** These styles will now live inside the Shadow DOM. Keeping them in the global CSS file is redundant and won't apply anymore due to the Shadow DOM boundary.

---

## 3. Step-by-Step Implementation Instructions

### Step 1: Prepare Constants
In `summaryPopup.js`, define a constant string `POPUP_STYLES` containing all CSS required for the popup.

### Step 2: Rewrite `showPopup` function
1. Create `const host = document.createElement('div')`.
2. Set styles on `host` (position, zIndex, etc.).
3. `const shadow = host.attachShadow({mode: 'open'})`.
4. `shadow.innerHTML = '<style>' + POPUP_STYLES + '</style>' + POPUP_TEMPLATE_HTML`.
5. `document.body.appendChild(host)`.
6. Update internal references (e.g., `this.shadow = shadow`) to help other functions find elements.

### Step 3: Update Helper Functions
Update `updatePopupContent`, `hidePopup`, and button handlers to query `shadow` instead of `popup`.

### Step 4: Repeat for `floatingIcon.js`
1. Extract CSS to a string.
2. Implement Shadow DOM wrapping.
3. Update internal logic.

### Step 5: Cleanup CSS
Delete the corresponding rules from `pageInteraction.css`.

---

## 4. Code Snippets for Reference

### 4.1. CSS Extraction Example (summaryPopup.js)
```javascript
const POPUP_STYLES = `
  .summarizer-popup {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    color: black;
    /* ... all other styles ... */
  }
`;
```

### 4.2. Shadow DOM Setup Example
```javascript
function createPopup() {
  const host = document.createElement('div');
  host.id = 'summarizer-host';

  // Critical styles to ensure visibility
  host.style.cssText = `
    position: fixed;
    z-index: 999999;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  `;

  const shadow = host.attachShadow({mode: 'open'});
  shadow.innerHTML = `<style>${POPUP_STYLES}</style>${POPUP_TEMPLATE}`;

  document.body.appendChild(host);
  return shadow;
}
```

---

## 5. Testing Plan

1.  **Load Extension:** Load the unpacked extension.
2.  **Test on Clean Page:** Verify popup looks correct on `example.com` (no styles).
3.  **Test on Styled Page:** Verify popup looks correct on `github.com` (heavy global styles).
    - Check fonts, colors, and layout are consistent with the extension's design.
4.  **Test Interaction:**
    - Summarize a paragraph.
    - Click "Copy".
    - Press `Y` to copy.
    - Press `Escape` to close.
5.  **Test Floating Icon:**
    - Hover over element (Alt+hover).
    - Verify icon is visible and styled correctly.
6.  **Test Multiple Popups:** Ensure old popups are removed before new ones appear.

---

## 6. Rollback Strategy
If the Shadow DOM approach causes issues with click propagation or specific browser behaviors:
1. Revert to `main` branch.
2. Alternative: Use `iframe` solution (more robust against DOM structure but harder to style).

