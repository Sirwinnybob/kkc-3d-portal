## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Discoverable Keyboard Shortcuts & Intentional Bypassing
**Learning:** In a 3D viewer, power users appreciate single-key shortcuts (M, T, C, L, S, H) for rapid navigation. To make these accessible and discoverable, hints should be included directly in button `title` tooltips and `aria-label` attributes. Crucially, these shortcuts must be bypassed when focus is inside interactive elements like `INPUT`, `TEXTAREA`, or `SELECT` to prevent interference with natural typing and form completion.
**Action:** When adding global hotkeys, always implement a focus-check guard and mirror shortcut hints in user-facing labels/tooltips.
