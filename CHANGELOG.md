- **Version 3.7.10:** Added max_tokens=4096 to OR call in `chat` so that more expensive models don't fail.
- **Version 3.7.9:** Force popup window to use fonts from CSS.
- **Version 3.7.8:** Remember the last used Joplin notbook.
- **Version 3.7.7:** Fixed masking of API keys in console debug.
- **Version 3.7.6:** Implemented Escape key functionality to close the summary popup, mirroring the behavior of the "Close" button for improved usability.

* **Version 3.7.5:** Implemented the dual-sharing workflow. When sharing to NewsBlur, if the corresponding option is checked, the same content is now also sent to Joplin.
* **Version 3.7.4:** Added a checkbox in Options > API to automatically send content to Joplin when sharing to NewsBlur. This option is enabled and auto-checked when a NewsBlur token is present.
* **Version 3.7.3:** Refactored NewsBlur sharing to send a combined HTML block containing both the summary and the original content in the `content` field, with an empty `comments` field.
* **Version 3.5:** Updated to version 3.5. (v3.5)
