- **Version 3.8.0:** 🎯 **Major Architecture Update - Native HTML Summary Format**
  - **Native HTML Summaries:** LLM now returns properly formatted HTML bullet lists directly, eliminating JSON parsing errors and improving reliability
  - **Dynamic Bullet Count:** The bullet count setting (3-8) now actually works! Uses `$$$bulletCount$$$` placeholder in prompt templates
  - **Enhanced Copy Functionality:** Preserves bold formatting in both rich text (HTML) and plain text (markdown) when copying summaries
  - **Fixed Chat Integration:** Chat window now properly handles HTML summaries without parsing errors
  - **Fixed NewsBlur Sharing:** Sharing to NewsBlur now works correctly with the new HTML format
  - **Fixed Notification System:** "Sending note to Joplin..." messages now properly clear and don't persist indefinitely
  - **Comprehensive Debug Logging:** Added extensive debug logging throughout the codebase, especially for language detection and summary processing
  - **Improved Language Detection:** Enhanced logging shows exactly when and how language detection occurs
  - **Streamlined Architecture:** Simplified data flow eliminates unnecessary JSON parsing and HTML rebuilding

- **Version 3.7.17:** Added keyboard shortcuts for summary popup (Y/C/N/Escape) and new Copy HTML icon in floating menu for copying complete element HTML to clipboard. Enhanced Joplin dialog with Enter/Escape hotkeys. Improved error handling robustness.
- **Version 3.7.10:** Added max_tokens=4096 to OR call in `chat` so that more expensive models don't fail.
- **Version 3.7.9:** Force popup window to use fonts from CSS.
- **Version 3.7.8:** Remember the last used Joplin notbook.
- **Version 3.7.7:** Fixed masking of API keys in console debug.
- **Version 3.7.6:** Implemented Escape key functionality to close the summary popup, mirroring the behavior of the "Close" button for improved usability.

* **Version 3.7.5:** Implemented the dual-sharing workflow. When sharing to NewsBlur, if the corresponding option is checked, the same content is now also sent to Joplin.
* **Version 3.7.4:** Added a checkbox in Options > API to automatically send content to Joplin when sharing to NewsBlur. This option is enabled and auto-checked when a NewsBlur token is present.
* **Version 3.7.3:** Refactored NewsBlur sharing to send a combined HTML block containing both the summary and the original content in the `content` field, with an empty `comments` field.
* **Version 3.5:** Updated to version 3.5. (v3.5)
