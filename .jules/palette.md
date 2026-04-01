## 2024-05-24 - Interactive Controls Breaking Keyboard Accessibility
**Learning:** Found a pattern in the viewer where interactive controls (like the help button and close help 'X') were implemented using non-semantic HTML elements (`<div>`, `<span>`) and `onpointerdown` event listeners instead of `<button>` and `onclick`. This prevents keyboard users from focusing and activating the buttons with Enter or Space, completely breaking keyboard accessibility for these functions.
**Action:** When implementing or reviewing interactive controls, ensure semantic `<button>` elements are used with `onclick` (or standard `addEventListener('click', ...)`) rather than pointer-specific events unless strictly necessary for custom touch/drag interactions. Add `aria-label` attributes for icon-only buttons.

## 2025-05-15 - Texture Catalog Inaccessibility
**Learning:** The texture catalog thumbnails were implemented as `<div>` elements with `onclick` handlers, which made them invisible to keyboard navigation and screen readers. Even with `onclick` working for mouse users, the lack of a semantic button or `tabindex` prevented any keyboard interaction.
**Action:** Always use `<button>` for grid-based selection elements (like thumbnails). When replacing a `div` with a `button`, ensure default button styling is reset in CSS (padding, border, background) and add specific `:focus-visible` styles to provide a clear focus ring for keyboard users.

## 2025-05-22 - Global Escape Key for Modal/Overlay Management
**Learning:** In complex 3D viewers with multiple overlapping UI layers (tour, help, picker, panels), a global `Escape` key listener is critical for both accessibility and UX intuition. By implementing a prioritized closure logic (closing the topmost layer first) and ensuring active inputs are blurred before closing overlays, we prevent conflicting key behaviors and provide a smooth exit path for users.
**Action:** Always implement a centralized `Escape` key listener that checks for active overlays in a prioritized order. Ensure any open text inputs are blurred first if they are currently focused to prevent unexpected overlay closure while typing or clearing fields.

## 2025-06-12 - Focus Management and CSS Transitions for Modals
**Learning:** When adding new modals (like the PIN modal) or side panels (Showroom panel), relying on `display: none/block` prevents CSS transitions and breaks focus management. Moving to a class-based `.show` toggle with `opacity` and `visibility` allows for delight (scale/fade effects) while maintaining accessibility. Furthermore, programmatically moving focus to the close button on open, and returning it to the trigger on close, is essential for a seamless keyboard experience.
**Action:** Use `.show` classes with `opacity`/`visibility` for all UI overlays. Always implement "focus trapping" entry/exit points: focus the primary action or close button upon opening, and restore focus to the triggering element upon closing.

## 2025-06-25 - Dynamic ARIA Feedback for Icon-Only Actions
**Learning:** For icon-only buttons that trigger state changes (like "Copy PIN" changing to a checkmark), visual changes alone are insufficient for screen reader users. By dynamically updating the `aria-label` (e.g., from "Copy PIN" to "PIN Copied!") and reverting it after a timeout, we provide immediate, non-disruptive confirmation of the action's success.
**Action:** When implementing "Copy" or similar transient actions on icon buttons, use `setAttribute('aria-label', ...)` to provide spoken feedback. Ensure the label is restored to its original state when the visual icon reverts.

## 2025-10-24 - Context Preservation via Focus Restoration in Dynamic Lists
**Learning:** In interfaces where users navigate from a list (e.g., Materials) to a detail/selection view (e.g., Catalog) and back, maintaining the user's scroll and focus position is critical for orientation. Restoring focus to the specific list item that triggered the transition, rather than just the top of the list or the panel itself, prevents "focus reset" disorientation for keyboard and screen reader users.
**Action:** Use `data-index` or similar unique identifiers on list items. When returning from a sub-view, use `requestAnimationFrame` to ensure the list has rendered before programmatically calling `.focus()` on the previously selected item.
