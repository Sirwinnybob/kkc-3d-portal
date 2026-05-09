## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Modified Status Visual Cue
**Learning:** In design-heavy applications with many customizable surfaces, users benefit from a quick way to scan which items they've already modified. High-contrast accents (using the project's primary blue #007bff) and increased font weight for "Modified" status labels provide effective visual anchors for state changes in catalog lists.
**Action:** Use brand-aligned visual highlights for "active" or "modified" states in list views to reduce cognitive load during multi-step customization tasks.
