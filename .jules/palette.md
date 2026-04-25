## 2025-05-14 - Modal Backdrop Closure Pattern
**Learning:** For web-based 3D viewers, users expect modals to be dismissible by clicking the surrounding backdrop, especially when touch navigation is used. Implementing this requires ensuring the event listener targets the backdrop container itself (e.g., via `e.target === backdrop`) to avoid closing the modal when the content area is clicked.
**Action:** Always implement backdrop closure alongside keyboard Escape listeners for non-critical modals, ensuring focus is returned to the trigger button for accessibility.

## 2025-05-15 - Global Zoom Shortcut Synchronization
**Learning:** In 3D viewers with custom zoom UI (like a joystick), implementing global keyboard shortcuts improves accessibility but can be disorienting if the visual state of the UI doesn't reflect the keyboard input. Synchronizing the joystick handle's position and ARIA attributes with keyboard-driven zoom provides crucial visual feedback and maintains UI consistency.
**Action:** Always link global keyboard shortcuts to their corresponding UI components' visual states and accessibility attributes to ensure a consistent experience across different input methods.
