## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Visual Anchors for State Changes
**Learning:** In interfaces with many customizable items, users need a quick way to distinguish between modified and default states. Using a high-contrast accent color (project primary blue) and increased font weight for "Modified" status labels creates a clear visual anchor that aids in scanning long lists.
**Action:** Apply consistent high-contrast styling to status indicators that represent user-initiated changes to help them track their progress.
