## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Visual Transition and A11y Polish
**Learning:** Using `display: none` for modals prevents CSS transitions. A more robust pattern for this design system is `opacity: 0`, `visibility: hidden`, and `pointer-events: none`, which allows for scale/fade animations while correctly removing the element from the accessibility tree. Additionally, always verify `aria-label` strings for nested HTML tags which can occur during copy-paste errors and break screen readers.
**Action:** Use the opacity/visibility pattern for all new overlays and audit existing `aria-labels` for malformed HTML.
