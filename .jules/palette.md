## 2024-05-24 - Interactive Controls Breaking Keyboard Accessibility
**Learning:** Found a pattern in the viewer where interactive controls (like the help button and close help 'X') were implemented using non-semantic HTML elements (`<div>`, `<span>`) and `onpointerdown` event listeners instead of `<button>` and `onclick`. This prevents keyboard users from focusing and activating the buttons with Enter or Space, completely breaking keyboard accessibility for these functions.
**Action:** When implementing or reviewing interactive controls, ensure semantic `<button>` elements are used with `onclick` (or standard `addEventListener('click', ...)`) rather than pointer-specific events unless strictly necessary for custom touch/drag interactions. Add `aria-label` attributes for icon-only buttons.

## 2025-05-15 - Texture Catalog Inaccessibility
**Learning:** The texture catalog thumbnails were implemented as `<div>` elements with `onclick` handlers, which made them invisible to keyboard navigation and screen readers. Even with `onclick` working for mouse users, the lack of a semantic button or `tabindex` prevented any keyboard interaction.
**Action:** Always use `<button>` for grid-based selection elements (like thumbnails). When replacing a `div` with a `button`, ensure default button styling is reset in CSS (padding, border, background) and add specific `:focus-visible` styles to provide a clear focus ring for keyboard users.

## 2025-05-20 - Global Escape Key for Overlay Management
**Learning:** In complex 3D viewers with multiple overlapping UI elements (catalog, help modals, menus), users expect a global 'Escape' key to dismiss the most relevant active overlay. This is a critical micro-UX pattern that improves the feeling of control and accessibility.
**Action:** Implement a global `keydown` listener for the 'Escape' key that dismisses overlays in a prioritized order (e.g., Modals > Panels > Menus). Always ensure focus is returned to the appropriate trigger element upon dismissal to maintain keyboard navigation continuity.
