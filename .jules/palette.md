## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Unified Interactive Feedback Pattern
**Learning:** In a mixed-rendering environment (static HTML + dynamic JS), interactive elements like buttons often lack consistent feedback if styles are inlined. Centralizing these into a single CSS class allows for uniform :hover and :active states, which significantly improves the perceived "tactility" of the interface.
**Action:** Always prefer CSS classes over inline styles for interactive elements, even for simple utility buttons, to ensure state transitions (scale, background) are consistent across the app.
