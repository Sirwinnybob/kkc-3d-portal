## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - High-Contrast Modified Status Highlights
**Learning:** In design-heavy applications with many customizable surfaces, users benefit from a quick way to scan which items they've already modified. High-contrast accents (using the project's primary blue #007bff) and increased font weight for "Modified" status labels provide effective visual anchors for state changes in catalog lists.
**Action:** Apply `.is-modified` class with primary blue color and bold weight to status indicators for user-driven state changes.
