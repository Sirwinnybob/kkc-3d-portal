const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert');
const test = require('node:test');

// Setup JSDOM
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="texture-btn"></div><div id="texture-panel"></div><div id="close-texture-btn"></div><div id="material-list"></div><div id="texture-grid"></div><div id="texture-search"></div><div id="catalog-title"></div><div id="back-to-materials"></div><div id="clear-texture-search"></div><div id="clear-search-empty"></div><div id="texture-search-empty"></div><div id="tap-replace-sheet"></div><div id="tap-replace-label"></div><div id="tap-replace-all-btn"></div><div id="tap-replace-one-btn"></div><div id="tap-replace-cancel"></div><div id="tap-replace-backdrop"></div><div id="quick-picker"></div><div id="qp-title"></div><div id="qp-categories-back"></div><div id="qp-close"></div><div id="qp-search-input"></div><div id="qp-clear-search"></div><div id="qp-views-container"></div><div id="qp-categories-view"></div><div id="qp-category-grid"></div><div id="qp-textures-view"></div><div id="qp-texture-strip"></div></body></html>', {
    runScripts: "dangerously",
    resources: "usable"
});
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Read MaterialManager source and strip export
const sourcePath = path.join(__dirname, '../public/js/materialManager.js');
let source = fs.readFileSync(sourcePath, 'utf8').replace(/^export\s+/gm, '');

// Append to window for easy access
source += "\nwindow.MaterialManager = MaterialManager;";

const scriptEl = dom.window.document.createElement("script");
scriptEl.textContent = source;
dom.window.document.body.appendChild(scriptEl);

const MaterialManager = dom.window.MaterialManager;

test('MaterialManager _getMaterialPreview optimization', async (t) => {
    const mm = new MaterialManager({
        callbacks: {}
    });

    await t.test('prioritizes urlLow over canvas', () => {
        const mat = {
            urlLow: 'http://example.com/low.jpg',
            hasTexture: true,
            material: { map: { image: {} } }
        };
        const preview = mm._getMaterialPreview(mat);
        assert.ok(preview.includes('src="http://example.com/low.jpg"'));
        assert.ok(preview.includes('loading="lazy"'));
        assert.strictEqual(mat.previewCache, preview);
    });

    await t.test('uses shared canvas and jpeg for texture previews', () => {
        // Mock drawImage and toDataURL
        let drawCalled = false;
        let clearCalled = false;
        let toDataURLOptions = [];

        const mockImg = { width: 100, height: 100 };
        const mockCtx = {
            drawImage: () => { drawCalled = true; },
            clearRect: () => { clearCalled = true; }
        };
        const mockCanvas = {
            getContext: () => mockCtx,
            toDataURL: (type, quality) => {
                toDataURLOptions = [type, quality];
                return 'data:image/jpeg;base64,mock';
            },
            width: 64,
            height: 64
        };

        // Inject mock canvas creation
        const originalCreateElement = dom.window.document.createElement;
        dom.window.document.createElement = (tag) => {
            if (tag === 'canvas') return mockCanvas;
            return originalCreateElement.call(dom.window.document, tag);
        };

        const mat = {
            hasTexture: true,
            material: {
                map: { image: mockImg },
                color: { getHexString: () => 'ff0000' }
            }
        };

        const preview = mm._getMaterialPreview(mat);

        assert.ok(drawCalled, 'drawImage should be called');
        assert.ok(clearCalled, 'clearRect should be called');
        assert.strictEqual(toDataURLOptions[0], 'image/jpeg');
        assert.strictEqual(toDataURLOptions[1], 0.7);
        assert.ok(preview.includes('src="data:image/jpeg;base64,mock"'));

        // Verify shared canvas
        assert.strictEqual(mm._previewCanvas, mockCanvas);

        // Restore
        dom.window.document.createElement = originalCreateElement;
    });

    await t.test('falls back to color placeholder if no texture', () => {
        const mat = {
            hasTexture: false,
            material: {
                color: { getHexString: () => '00ff00' }
            }
        };
        const preview = mm._getMaterialPreview(mat);
        assert.ok(preview.includes('background-color: #00ff00'));
    });
});
