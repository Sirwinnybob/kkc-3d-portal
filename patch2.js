const fs = require('fs');
let js = fs.readFileSync('public/js/viewer.js', 'utf8');

// Replace qpSearchBtn with qpSearchInput and add qpClearSearch
js = js.replace(/const qpSearchBtn\s*=\s*document\.getElementById\('qp-search-btn'\);/, `const qpSearchInput    = document.getElementById('qp-search-input');
    const qpClearSearch    = document.getElementById('qp-clear-search');`);

const eventListenerSearchStr = `if (qpSearchBtn) {
        qpSearchBtn.addEventListener('click', () => {
            closeQuickPicker();
            const texBtn = document.getElementById('texture-btn');
            if (texBtn) texBtn.click();
        });
    }`;

const eventListenerReplaceStr = `if (qpSearchInput) {
        qpSearchInput.addEventListener('input', () => {
            const q = qpSearchInput.value.toLowerCase();
            if (qpClearSearch) qpClearSearch.style.display = q ? 'block' : 'none';

            // Search textures within the active view
            const isTexturesView = qpViewsContainer.classList.contains('show-textures');
            if (isTexturesView) {
                const thumbs = qpTextureStrip.querySelectorAll('.qp-tex-item');
                thumbs.forEach(th => {
                    const name = th.querySelector('span')?.textContent?.toLowerCase() || '';
                    th.style.display = name.includes(q) ? '' : 'none';
                });
            } else {
                const cats = qpCategoryGrid.querySelectorAll('.qp-category-btn');
                cats.forEach(btn => {
                    const name = btn.textContent.toLowerCase() || '';
                    btn.style.display = name.includes(q) ? '' : 'none';
                });
            }
        });
    }

    if (qpClearSearch) {
        qpClearSearch.addEventListener('click', () => {
            if (qpSearchInput) {
                qpSearchInput.value = '';
                qpSearchInput.dispatchEvent(new Event('input'));
                qpSearchInput.focus();
            }
        });
    }

    // Reset search when opening quick picker
    const originalOpenQuickPicker = openQuickPicker;
    openQuickPicker = async function() {
        if (qpSearchInput) {
            qpSearchInput.value = '';
            qpSearchInput.dispatchEvent(new Event('input'));
        }
        await originalOpenQuickPicker();
    };
`;

js = js.replace(eventListenerSearchStr, eventListenerReplaceStr);

fs.writeFileSync('public/js/viewer.js', js);
