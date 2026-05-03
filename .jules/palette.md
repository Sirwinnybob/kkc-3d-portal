## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Material Modification Status Highlight
**Learning:** In design-heavy applications with many customizable surfaces, users need a quick way to scan which items they've already modified. High-contrast colors and increased font weight for "Modified" status labels provide effective visual anchors.
**Action:** Use high-contrast accents (e.g., #3b82f6) and semantic CSS classes (e.g., .is-modified) for state changes in catalog lists.
