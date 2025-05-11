*   **Immediate Save on Model and Bullet Point Selection:** Added immediate saving of options when selecting models for summary or chat, and when changing the number of bullet points, ensuring settings are updated without manual save. (v3.4.3)
*   **Auto-Save Options After API Key Entry:** Implemented automatic saving of settings after a successful API key entry, ensuring that the configuration is preserved immediately upon validation. (v3.4.2)
*   **Model Refresh on API Key Input:** Added functionality to trigger a model refresh immediately after the user enters their API key in the options page, ensuring the latest model data is available. (v3.4.1)
*   **Markdown Normalization for Summaries:** Added normalization of markdown syntax in LLM responses to ensure consistent rendering of bold text in summaries, handling both valid and malformed JSON. (v3.3.8)
*   **Fallback for Malformed JSON:** Added a fallback mechanism to extract summary points from malformed JSON responses, ensuring content is preserved even with formatting errors. (v3.3.7)
*   **Relocated Request Price Limit and Added Behavior Options:** Moved the Request Price Limit section to Model Selection and added radio buttons for behavior when max price is reached (Fail and Report or Truncate Output). (v3.3.6)
*   **Text Extraction with Turndown.js:** Added functionality to convert selected HTML to Markdown using Turndown.js before sending to the LLM, reducing token usage and improving summary quality. (v3.3.4)
*   **Removed Unicode Content Checks:** Simplified token estimation by removing Unicode detection and adjustments, using a uniform calculation based on content size. (v3.3.3)
*   **Removed Structured Outputs Filter:** Broadened model compatibility by eliminating the `structured_outputs` filter, allowing all OpenRouter models to be used. (v3.3.3)
*   **Added Pricing Data Check for Models:** Implemented a new function `checkPricingData()` in `options.js` to ensure pricing data for all configured models is checked and updated if necessary. (v3.3.2)
*   **Simplified Error Message:** Removed 'accessible via extension icon > Options' from error messages to make them more concise. (v3.2.21)
*   **Consistent Options Button on Errors:** Updated `pageInteraction.js` to ensure 'OPTIONS' button appears for all error states in the summary popup by consistently setting `errorState = true`. (v3.2.20)
*   **Fixed Missing Callback in Popup:** Updated `validateAndSendToLLM` to include `onOptions` callback in `showPopup`, resolving error for missing callbacks, and removed duplicate function. (v3.2.19)
*   **Dynamic Chat/Options Button:** Replaced 'CHAT' button with 'OPTIONS' in summary popup for max price exceeded and configuration issues, guiding users to adjust settings. (v3.2.18)
*   **Removed Automatic Options Page Opening:** Changed behavior to prevent automatic opening of the options page when max price is exceeded, updating the error message to guide users instead. (v3.2.17)
*   **Fixed Missing Constant in Background:** Imported `STORAGE_KEY_MAX_REQUEST_PRICE` in `background.js` to resolve a reference error for max request price settings. (v3.2.16)
*   **Fixed Missing Constant in Options:** Imported `DEFAULT_MAX_REQUEST_PRICE` in `options.js` to resolve a reference error for max request price settings. (v3.2.15)
*   **Fixed Reference Error for Max Request Price:** Defined `STORAGE_KEY_MAX_REQUEST_PRICE` in `constants.js` to resolve a reference error, ensuring proper handling of max request price settings with a default value of $0.001. (v3.2.14)
*   **Enhanced Price Limits with Unicode Detection:** Improved cost estimation by detecting Unicode content in the first 1024 bytes of selected HTML, adjusting token estimates to prevent exceeding the max request price. (v3.2.13)
*   **Implemented Price Limits:** Added cost estimation and validation against user-defined max request price before sending summary requests, with Unicode detection for accurate token estimation. (v3.2.12)
*   **Corrected Default Price:** Updated the default Max Request Price to $0.001 to match the enforced minimum for finer cost control. (v3.2.11)
*   **Enforced Minimum Price:** Set a minimum value of $0.001 for Max Request Price to prevent disabling requests with paid models. (v3.2.10)
*   **Increased Price Precision:** Changed max request price precision to three decimal places, allowing a minimum price of $0.001 for finer cost control. (v3.2.9)
*   **Fixed Reference Error in Options:** Removed residual reference to `maxRequestPriceInput` in `calculateKbLimitForSummary` to prevent initialization errors. (v3.2.8)
*   **Zero Price Handling for KB Limit:** Updated logic to treat a max request price of zero as valid, setting KB limit to zero for paid models (no budget) and "No limit" for free models. (v3.2.7)
*   **Extended Pricing Cache Expiry:** Increased the pricing data cache expiration from 24 hours to 7 days for better performance and reduced API calls. (v3.2.6)
*   **Efficient Model Pricing Update:** Implemented a new mechanism to update pricing data for all configured models using a single API call to `/api/v1/models`, improving performance over individual model requests. (v3.2.5)
*   **Price Limit for Summary Requests:** Added an advanced option to set a maximum price (in USD) for summary requests, displaying an approximate KB limit based on the selected summary model's pricing. (v3.2.4)
*   **Smarter Summaries:**
    *   Initial summaries are now requested in the original text's language.
    *   Fixed a bug preventing the correct summary model from being passed to and shown in the chat context.
*   **Robust Summary/Chat Parsing:**
    *   Improved logic to reliably parse LLM responses, correctly handling summaries or chat messages containing multiple or embedded JSON arrays, even without code fences.
    *   Structured JSON array output (5 items) is now requested from the LLM.
*   **Enhanced Chat Functionality:**
    *   Implemented a "Stop" button to cancel ongoing chat requests.
    *   Fixed issues with the Stop button remaining visible or error messages persisting incorrectly.
    *   Resolved bugs related to chat submission (Send button and Ctrl+Enter).
    *   Ensured clicking language flags correctly initiates translation requests in the chat.
    *   Improved chat UI rendering for better message display and consistency.
    *   Assistant responses containing JSON arrays are now rendered as structured HTML lists.
    *   Fixed parsing of the initial summary context when opening the chat.
*   **Removed Health Check:** The explicit health check message from the content script has been removed. Configuration validation is now handled directly within the summary request processing in the background script.
*   **Flag Busy State:** Language flags in the chat interface are now visually dimmed and show a "busy" tooltip while the LLM is processing a request. (v3.0.15)
*   **Temporary Error Messages:** Temporary error messages (like "Chat is busy") now automatically disappear after a short duration. (v3.0.16)
