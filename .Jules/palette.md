## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Visual Feedback for Theme Toggles and Interactive Elements
**Learning:** Theme toggles and destructive actions like 'Logout' benefit from clear visual metaphors and tactile feedback. Swapping icons (Sun/Moon) and adding active scaling (`transform: scale(0.98)`) makes the interface feel responsive and high-quality.
**Action:** Use SVG icon swaps for binary state buttons and consistent scaling feedback for all interactive elements.

## 2025-05-15 - Material Status Scanability
**Learning:** Darkening helper text (from `#999` to `#666`) and adding a distinct color/weight highlight (`#3b82f6`) for modified states significantly improves a user's ability to scan a long list of materials for changes.
**Action:** Ensure status indicators meet WCAG AA contrast and use semantic colors to highlight active/modified states.
