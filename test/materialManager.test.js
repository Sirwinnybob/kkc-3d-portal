const test = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

// Mock requestAnimationFrame
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

test('MaterialManager optimizations', async (t) => {
    // 1. Setup JSDOM environment
    const html = `
        <!DOCTYPE html>
        <html>
        <body>
            <div id="texture-btn"></div>
            <div id="texture-panel"></div>
            <div id="close-texture-btn"></div>
            <div id="material-list"></div>
            <div id="texture-grid"></div>
            <div id="texture-search"></div>
            <div id="catalog-title"></div>
            <div id="back-to-materials"></div>
            <div id="tap-replace-sheet"></div>
            <div id="tap-replace-label"></div>
            <div id="tap-replace-all-btn"></div>
            <div id="tap-replace-one-btn"></div>
            <div id="tap-replace-cancel"></div>
            <div id="tap-replace-backdrop"></div>
            <div id="quick-picker"></div>
            <div id="qp-title"></div>
            <div id="qp-categories-back"></div>
            <div id="qp-close"></div>
            <div id="qp-search-input"></div>
            <div id="qp-clear-search"></div>
            <div id="qp-views-container"></div>
            <div id="qp-categories-view"></div>
            <div id="qp-category-grid"></div>
            <div id="qp-textures-view"></div>
            <div id="qp-texture-strip"></div>
            <div id="materials-view"></div>
            <div id="catalog-view"></div>
        </body>
        </html>
    `;
    const dom = new JSDOM(html);
    const { window } = dom;

    // 2. Load MaterialManager by stripping 'export'
    const filePath = path.join(__dirname, '../public/js/materialManager.js');
    let code = fs.readFileSync(filePath, 'utf8');
    code = code.replace(/^export\s+/gm, '');

    // Evaluate code in the context of the window
    const MaterialManager = (function(window) {
        const document = window.document;
        const HTMLElement = window.HTMLElement;
        const Event = window.Event;
        const requestAnimationFrame = global.requestAnimationFrame;

        const exports = {};
        // Use eval with a function wrapper to capture the class
        return eval(`(function() { ${code}; return MaterialManager; })()`);
    })(window);

    const mockConfig = {
        detectedMaterials: [
            {
                name: 'Mat1',
                hasTexture: true,
                material: { color: { getHexString: () => 'ff0000' } },
                meshes: ['mesh1']
            }
        ],
        callbacks: {
            onStatusUpdate: () => {},
            onHighlightMesh: () => {},
            onClearHighlight: () => {},
            onApplyTexture: () => {}
        }
    };

    const manager = new MaterialManager(mockConfig);

    await t.test('_getMaterialPreview prioritizes urlLow', () => {
        const mat = {
            urlLow: 'http://example.com/low.jpg',
            hasTexture: true,
            material: { color: { getHexString: () => 'ff0000' } }
        };
        const preview = manager._getMaterialPreview(mat);
        assert.ok(preview.includes('src="http://example.com/low.jpg"'), 'Should use urlLow');
        assert.ok(preview.includes('loading="lazy"'), 'Should have lazy loading');
    });

    await t.test('_getMaterialPreview reuses canvas', () => {
        const mat = {
            hasTexture: true,
            material: {
                color: { getHexString: () => '00ff00' },
                map: { image: { width: 64, height: 64 } }
            }
        };

        // JSDOM canvas mock for toDataURL
        window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,mock';

        manager._getMaterialPreview(mat);
        const canvas1 = manager._previewCanvas;
        assert.ok(canvas1, 'Canvas should be created');

        manager._getMaterialPreview(mat);
        const canvas2 = manager._previewCanvas;
        assert.strictEqual(canvas1, canvas2, 'Should reuse same canvas instance');
    });

    await t.test('renderTextureGrid uses urlLow', () => {
        manager.selectedMaterialIndex = 0;
        manager.currentCategoryTextures = [
            { name: 'Tex1', url: 'high.jpg', urlLow: 'low.jpg' }
        ];
        manager.renderTextureGrid();

        const img = window.document.querySelector('#texture-grid img');
        assert.strictEqual(img.src, 'low.jpg', 'Should use urlLow in grid');
    });

    await t.test('loadCategoryTextures skipRender works', async () => {
        let fetchCalled = false;
        global.fetch = async () => {
            fetchCalled = true;
            return {
                ok: true,
                json: async () => ({
                    success: true,
                    textures: [{ name: 'T1', url: 'u1' }]
                })
            };
        };

        const grid = window.document.getElementById('texture-grid');
        grid.innerHTML = 'initial';

        await manager.loadCategoryTextures('cat1', true);
        assert.strictEqual(grid.innerHTML, 'initial', 'Should NOT have rendered when skipRender is true');

        await manager.loadCategoryTextures('cat1', false);
        assert.notStrictEqual(grid.innerHTML, 'initial', 'Should have rendered when skipRender is false');
    });
});
