## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-14 - High-Contrast Status Anchors
**Learning:** In design-heavy applications with many customizable surfaces, users benefit from a quick way to scan which items they've already modified. High-contrast accents (using the project's primary blue #007bff) and increased font weight for "Modified" status labels provide effective visual anchors for state changes in catalog lists.
**Action:** Use distinct brand colors and semi-bold typography for state indicators in list items to improve information hierarchy and scanability.

## 2025-05-14 - Unified Button Interaction Pattern
**Learning:** Mixing inline styles with class-based interactions for circular buttons leads to inconsistent tactile feedback. Consolidating these into a single `.round-btn-style` class ensures predictable hover backgrounds, border transitions, and active scaling across the UI.
**Action:** Prefer shared CSS interaction classes over inline styles for repeating UI elements to maintain a cohesive user experience.
