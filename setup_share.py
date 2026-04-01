import re

print("Applying share button to viewer.html...")
with open('public/viewer.html', 'r') as f:
    html = f.read()

share_btn = '''
        <div style="display: flex; gap: 10px;">
            <button id="share-btn" class="ui-panel" aria-label="Share Link" style="width: 32px; height: 32px; font-weight: bold; display: flex; align-items: center; justify-content: center; background: #fff; border: 1px solid #000; border-radius: 50%; cursor: pointer;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
            </button>
            <button id="help-btn" class="ui-panel" aria-label="Help">?</button>
        </div>
'''
html = re.sub(r'<button id="help-btn"[^>]*>\?</button>', share_btn.strip(), html)

share_modal = '''
    <!-- Share Link Modal -->
    <div id="share-modal" role="dialog" aria-modal="true" style="position: fixed; inset: 0; z-index: 10000; background: rgba(0,0,0,0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.25s ease, visibility 0.25s;">
        <div class="pin-modal-content">
            <h3 id="share-title" style="color: #3b82f6; margin-bottom: 10px;">Share Link</h3>
            <p style="color: #aaa; font-size: 0.9em; margin-bottom: 12px;">Copy this link to view your job directly:</p>
            <div class="pin-display-container" style="flex-direction: column; gap: 15px;">
                <div id="share-link-display" class="pin-code" style="font-size: 1.1em; letter-spacing: normal; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 12px;">-----</div>
                <button id="copy-share-link-btn" class="copy-btn" aria-label="Copy Link" title="Copy Link" style="width: 100%; height: 45px; flex-direction: row; gap: 8px;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                    <span>Copy Link</span>
                </button>
            </div>
            <button id="share-modal-close" class="pin-modal-btn" style="background: #3b82f6; width: 100%;">Close</button>
        </div>
    </div>
'''
html = html.replace('<div id="canvas-container"></div>', share_modal + '\n    <div id="canvas-container"></div>')

with open('public/viewer.html', 'w') as f:
    f.write(html)


print("Applying styles to viewer.css...")
with open('public/css/viewer.css', 'r') as f:
    css = f.read()

css += '''
#share-btn:focus-visible,
#share-modal-close:focus-visible,
#copy-share-link-btn:focus-visible {
    outline: 3px solid #3b82f6;
    outline-offset: 2px;
}

#share-modal.show {
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: auto !important;
}

#share-modal.show .pin-modal-content {
    transform: scale(1) translateY(0);
}
'''
with open('public/css/viewer.css', 'w') as f:
    f.write(css)


print("Applying JS logic to viewer.js...")
with open('public/js/viewer.js', 'r') as f:
    js = f.read()

share_logic = '''
    // --- SHARE LINK LOGIC ---
    const shareBtn = document.getElementById('share-btn');
    const shareModal = document.getElementById('share-modal');
    const shareModalClose = document.getElementById('share-modal-close');
    const shareLinkDisplay = document.getElementById('share-link-display');
    const copyShareLinkBtn = document.getElementById('copy-share-link-btn');

    const toggleShare = (show) => {
        if (shareModal) {
            shareModal.classList.toggle('show', show);
            if (show) {
                // Generate absolute URL with current params
                const fullUrl = window.location.origin + window.location.pathname + window.location.search;
                if (shareLinkDisplay) shareLinkDisplay.textContent = fullUrl;

                // Reset copy button
                if (copyShareLinkBtn) {
                    copyShareLinkBtn.classList.remove('copied');
                    copyShareLinkBtn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copy Link</span>
                    `;
                }
                if (shareModalClose) shareModalClose.focus();
            } else {
                if (shareBtn) shareBtn.focus();
            }
        }
    };

    if (shareBtn) {
        if (!isShowroomMode) {
            shareBtn.onclick = () => toggleShare(true);
        } else {
            shareBtn.style.display = 'none'; // Don't show in showroom
        }
    }
    if (shareModalClose) shareModalClose.onclick = () => toggleShare(false);

    if (copyShareLinkBtn && shareLinkDisplay) {
        let shareCopyTimeout = null;
        copyShareLinkBtn.onclick = () => {
            const link = shareLinkDisplay.textContent;
            navigator.clipboard.writeText(link).then(() => {
                if (shareCopyTimeout) clearTimeout(shareCopyTimeout);
                copyShareLinkBtn.classList.add('copied');
                copyShareLinkBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Copied!</span>
                `;
                shareCopyTimeout = setTimeout(() => {
                    copyShareLinkBtn.classList.remove('copied');
                    copyShareLinkBtn.innerHTML = `
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copy Link</span>
                    `;
                    shareCopyTimeout = null;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy share link:', err);
            });
        };
    }
'''

# Find a safe injection point inside `init()`
insert_target = "const closeHelpBtn = document.getElementById('close-help-btn');"
js = js.replace(insert_target, insert_target + "\n" + share_logic + "\n")

# Update Escape key handler
escape_target = "if (helpModal?.classList.contains('show')) return toggleHelp(false);"
escape_inject = escape_target + "\n        if (document.getElementById('share-modal')?.classList.contains('show')) return toggleShare(false);"
js = js.replace(escape_target, escape_inject)

with open('public/js/viewer.js', 'w') as f:
    f.write(js)

print("Done setting up!")
