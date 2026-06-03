## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Global Shortcut & Input Collision Pattern
**Learning:** In applications with rich 3D interactions and many overlays, global keyboard shortcuts (like 'M' for menu) can easily collide with user input in forms or browser-level shortcuts (like Ctrl+S). A robust implementation must: 1) exclude all text-entry elements (INPUT, TEXTAREA, SELECT), 2) check for modifier keys (Ctrl, Meta, Alt) to avoid hijacking browser features, and 3) ensure discoverability by mirroring shortcuts in tooltips and help documentation.
**Action:** Always wrap global keydown listeners with a check for active input elements and modifier keys, and documentation for the shortcuts should be added to the primary UI guidance (e.g., a Help modal).
