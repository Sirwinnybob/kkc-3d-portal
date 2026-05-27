## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Discoverable Keyboard Shortcuts
**Learning:** Keyboard shortcuts improve power-user efficiency but remain "hidden features" unless explicitly surfaced. Pairing shortcuts with visual hints in tooltips (`title` attribute) and a dedicated section in the Help guide ensures discoverability and accessibility.
**Action:** When adding global shortcuts, always update associated button titles/ARIA labels and the application's help/documentation modal.
