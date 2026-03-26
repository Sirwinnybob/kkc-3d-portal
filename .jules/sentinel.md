## 2024-11-20 - [Fix XSS Vulnerability in Tagger Dropdowns]
**Vulnerability:** DOM-based Cross-Site Scripting (XSS) via unescaped file paths injected into `innerHTML`.
**Learning:** Found multiple instances where dynamic file paths and names (`f.file`, `f.name`) returned from the backend were inserted directly into `<option>` tags via `innerHTML` without escaping in `public/js/tagger.js`.
**Prevention:** Always use the `escapeHtml` utility function (already available in the codebase) when rendering server-provided data or user input directly into the DOM using `.innerHTML`.
