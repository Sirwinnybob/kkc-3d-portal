const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

// Mock a minimal browser environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="material-list"></div><div id="texture-grid"></div><div id="texture-panel"></div><div id="catalog-title"></div></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.HTMLCanvasElement = dom.window.HTMLCanvasElement;
global.navigator = dom.window.navigator;
global.Event = dom.window.Event;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Mocking getContext and toDataURL for simulation
dom.window.HTMLCanvasElement.prototype.getContext = function() {
    return {
        clearRect: () => {},
        drawImage: () => {}
    };
};
dom.window.HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
    this._lastType = type;
    this._lastQuality = quality;
    return `data:${type};base64,mock`;
};

// Re-defining for the test context
const MaterialManagerModule = fs.readFileSync(path.join(__dirname, '../public/js/materialManager.js'), 'utf8');

// Simple ESM to CJS "transpilation" for testing
const transpiled = MaterialManagerModule.replace('export class MaterialManager', 'class MaterialManager') + '\nmodule.exports = { MaterialManager };';

const tempFile = path.join(__dirname, 'temp_materialManager.js');
fs.writeFileSync(tempFile, transpiled);
const { MaterialManager } = require(tempFile);

test('MaterialManager Performance Optimizations', async (t) => {
    const config = {
        detectedMaterials: [
            { name: 'Mat1', hasTexture: true, material: { color: { getHexString: () => 'ff0000' } } },
            { name: 'Mat2', hasTexture: true, urlLow: '/low.jpg', material: { color: { getHexString: () => '00ff00' } } }
        ],
        callbacks: {}
    };

    const mm = new MaterialManager(config);

    await t.test('_getMaterialPreview prioritizes urlLow', () => {
        const preview = mm._getMaterialPreview(config.detectedMaterials[1]);
        assert.ok(preview.includes('src="/low.jpg"'), 'Should use urlLow if available');
        assert.ok(preview.includes('loading="lazy"'), 'Should have lazy loading');
    });

    await t.test('_getMaterialPreview uses shared canvas and JPEG fallback', () => {
        const mat = config.detectedMaterials[0];
        mat.material.map = { image: {} }; // Mock image exists

        const preview = mm._getMaterialPreview(mat);
        assert.ok(mm._previewCanvas, 'Should have created shared canvas');
        assert.equal(mm._previewCanvas._lastType, 'image/jpeg', 'Should use JPEG encoding');
        assert.equal(mm._previewCanvas._lastQuality, 0.7, 'Should use 0.7 quality');
        assert.ok(preview.includes('data:image/jpeg'), 'Preview should contain JPEG data URL');
    });

    await t.test('loadCategoryTextures skipRender logic', async () => {
        // Mock fetch
        global.fetch = async () => ({
            ok: true,
            json: async () => ({ success: true, textures: [{ name: 'Tex1', url: '/t1.jpg' }] })
        });

        let renderCalled = false;
        const originalRender = mm.renderTextureGrid;
        mm.renderTextureGrid = () => { renderCalled = true; };

        await mm.loadCategoryTextures('Colors', true);
        assert.strictEqual(renderCalled, false, 'Should skip render when skipRender is true');

        await mm.loadCategoryTextures('Colors', false);
        assert.strictEqual(renderCalled, true, 'Should call render when skipRender is false');

        mm.renderTextureGrid = originalRender;
    });
});

// Cleanup
test.after(() => {
    if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
});
