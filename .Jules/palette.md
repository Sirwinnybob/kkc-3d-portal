## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Global Keyboard Shortcuts for 3D Viewers
**Learning:** In immersive 3D web applications, keyboard shortcuts significantly improve navigation speed and accessibility. Using single-key triggers (M, T, C, etc.) is intuitive but must be carefully gated to avoid firing when the user is typing in form fields (INPUT, TEXTAREA, SELECT) or using browser-level shortcuts (Ctrl/Cmd modifiers).
**Action:** Implement a centralized keydown listener in `UIManager` that checks `document.activeElement` and modifier keys before dispatching to UI actions. Always document these shortcuts visually (tooltips, help modals) to ensure discoverability.
