const fs = require('fs');
let html = fs.readFileSync('public/viewer.html', 'utf8');

// The replacement should change the `#quick-picker-header` section
const searchBlock = `
                <button id="qp-search-btn" title="Search Textures" aria-label="Search" style="display:none;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                </button>
                <button id="qp-search-btn" title="Search Textures" aria-label="Search" style="display:none;">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </button>
`;

const replaceBlock = `
                <div class="search-container qp-search-container" style="margin-bottom:0; display:flex; align-items:center;">
                    <input type="text" id="qp-search-input" placeholder="Search..." autocomplete="off" aria-label="Search quick textures" style="width:100px; padding:4px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.2); background:rgba(0,0,0,0.3); color:white; font-size:0.85em; transition: width 0.2s;" onfocus="this.style.width='160px'" onblur="this.style.width='100px'">
                    <button id="qp-clear-search" aria-label="Clear search" style="display:none; background:none; border:none; color:rgba(255,255,255,0.6); margin-left:-20px; cursor:pointer;">&times;</button>
                </div>
`;

html = html.replace(searchBlock, replaceBlock);
fs.writeFileSync('public/viewer.html', html);
