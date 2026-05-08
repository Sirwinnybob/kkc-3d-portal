## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2026-05-08 - High-Contrast Feedback for Customized States
**Learning:** In design-heavy applications with many customizable surfaces, users benefit from a quick way to scan which items they've already modified. High-contrast accents (using the project's primary blue #007bff) and increased font weight for "Modified" status labels provide effective visual anchors for state changes in catalog lists.
**Action:** Use distinct color and typography states to communicate "customized" vs "default" status in material lists to improve visual scanning efficiency.
