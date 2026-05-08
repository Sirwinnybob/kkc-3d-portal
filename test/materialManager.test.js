const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

describe('MaterialManager Performance Optimizations', async () => {
    let MaterialManager;
    let dom;

    before(async () => {
        // Mock browser environment
        dom = new JSDOM('<!DOCTYPE html><html><body>' +
            '<div id="texture-btn"></div><div id="texture-panel"></div><div id="close-texture-btn"></div>' +
            '<div id="material-list"></div><div id="texture-grid"></div><div id="texture-search"></div>' +
            '<div id="catalog-title"></div><div id="back-to-materials"></div><div id="clear-texture-search"></div>' +
            '<div id="clear-search-empty"></div><div id="texture-search-empty"></div><div id="tap-replace-sheet"></div>' +
            '<div id="tap-replace-label"></div><div id="tap-replace-all-btn"></div><div id="tap-replace-one-btn"></div>' +
            '<div id="tap-replace-cancel"></div><div id="tap-replace-backdrop"></div><div id="quick-picker"></div>' +
            '<div id="qp-title"></div><div id="qp-categories-back"></div><div id="qp-close"></div>' +
            '<div id="qp-search-input"></div><div id="qp-clear-search"></div><div id="qp-views-container"></div>' +
            '<div id="qp-categories-view"></div><div id="qp-category-grid"></div><div id="qp-textures-view"></div>' +
            '<div id="qp-texture-strip"></div><div id="materials-view"></div><div id="catalog-view"></div>' +
            '</body></html>', { runScripts: "dangerously" });

        global.window = dom.window;
        global.document = dom.window.document;
        global.navigator = dom.window.navigator;
        global.HTMLElement = dom.window.HTMLElement;
        global.Event = dom.window.Event;
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

        const HTMLCanvasElement = dom.window.HTMLCanvasElement;
        if (HTMLCanvasElement) {
            HTMLCanvasElement.prototype.getContext = (type, opts) => ({
                drawImage: () => {},
                fillRect: () => {}
            });
            HTMLCanvasElement.prototype.toDataURL = (type, quality) => {
                return `data:${type};base64,mock`;
            };
        }

        const code = fs.readFileSync(path.join(__dirname, '../public/js/materialManager.js'), 'utf8');
        // JSDOM script execution
        const scriptEl = dom.window.document.createElement("script");
        scriptEl.textContent = code.replace('export class', 'window.MaterialManager = class');
        dom.window.document.body.appendChild(scriptEl);
        MaterialManager = dom.window.MaterialManager;
    });

    test('_getMaterialPreview uses urlLow when available', () => {
        const mm = new MaterialManager({ callbacks: {} });
        const mat = {
            hasTexture: true,
            urlLow: 'http://localhost/low.jpg',
            material: { color: { getHexString: () => 'ff0000' } }
        };
        const preview = mm._getMaterialPreview(mat);
        assert.ok(preview.includes('src="http://localhost/low.jpg"'), 'Should use urlLow');
        assert.ok(preview.includes('loading="lazy"'), 'Should have lazy loading');
    });

    test('_getMaterialPreview fallbacks to canvas with jpeg 0.7', () => {
        const mm = new MaterialManager({ callbacks: {} });
        const mat = {
            hasTexture: true,
            material: {
                map: { image: {} },
                color: { getHexString: () => 'ff0000' }
            }
        };
        const preview = mm._getMaterialPreview(mat);
        assert.ok(preview.includes('data:image/jpeg;base64,mock'), 'Should fallback to canvas with jpeg');
    });

    test('_getMaterialPreview reuses canvas', () => {
        const mm = new MaterialManager({ callbacks: {} });
        const mat = {
            hasTexture: true,
            material: { map: { image: {} } }
        };
        mm._getMaterialPreview(mat);
        const firstCanvas = mm._previewCanvas;
        assert.ok(firstCanvas, 'Canvas should be created');

        const mat2 = {
            hasTexture: true,
            material: { map: { image: {} } }
        };
        mm._getMaterialPreview(mat2);
        assert.strictEqual(mm._previewCanvas, firstCanvas, 'Canvas should be reused');
    });

    test('renderTextureGrid uses urlLow for textures', () => {
        const mm = new MaterialManager({ callbacks: {} });
        mm.currentCategoryTextures = [
            { name: 'Tex1', url: 'high.jpg', urlLow: 'low.jpg' }
        ];
        mm.renderTextureGrid();
        const img = document.querySelector('#texture-grid img');
        assert.strictEqual(img.getAttribute('src'), 'low.jpg', 'Texture grid should use low-res URL');
    });

    test('renderQpStrip uses urlLow for textures', () => {
        const mm = new MaterialManager({ callbacks: {} });
        mm.qpCurrentTextures = [
            { name: 'Tex1', url: 'high.jpg', urlLow: 'low.jpg' }
        ];
        mm.renderQpStrip();
        const img = document.querySelector('#qp-texture-strip img');
        assert.strictEqual(img.getAttribute('src'), 'low.jpg', 'Quick picker strip should use low-res URL');
    });
});
