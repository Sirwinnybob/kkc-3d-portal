const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { cleanDae } = require('../server');

const TEST_DIR = path.join(__dirname, 'cleanDae_test_dir');

test('cleanDae behavior', async (t) => {
    t.beforeEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(TEST_DIR, { recursive: true });
    });

    t.afterEach(() => {
        if (fs.existsSync(TEST_DIR)) {
            fs.rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    await t.test('removes <h>...</h> tags and their contents', async () => {
        const filePath = path.join(TEST_DIR, 'test_h.dae');
        fs.writeFileSync(filePath, '<root><h>hidden content</h>visible</root>');
        await cleanDae(filePath);
        const result = fs.readFileSync(filePath, 'utf8');
        assert.strictEqual(result, '<root>visible</root>');
    });

    await t.test('removes <ph> tags but keeps their contents', async () => {
        const filePath = path.join(TEST_DIR, 'test_ph.dae');
        fs.writeFileSync(filePath, '<root><ph>visible content</ph></root>');
        await cleanDae(filePath);
        const result = fs.readFileSync(filePath, 'utf8');
        assert.strictEqual(result, '<root>visible content</root>');
    });

    await t.test('normalizes tabs and multiple spaces to a single space', async () => {
        const filePath = path.join(TEST_DIR, 'test_spaces.dae');
        fs.writeFileSync(filePath, '<root>a\tb  c</root>');
        await cleanDae(filePath);
        const result = fs.readFileSync(filePath, 'utf8');
        assert.strictEqual(result, '<root>a b c</root>');
    });

    await t.test('fixes spaces around tags', async () => {
        const filePath = path.join(TEST_DIR, 'test_tag_spaces.dae');
        fs.writeFileSync(filePath, '<tag> content </tag>');
        await cleanDae(filePath);
        const result = fs.readFileSync(filePath, 'utf8');
        assert.strictEqual(result, '<tag>content</tag>');
    });

    await t.test('combines multiple replacements correctly', async () => {
        const filePath = path.join(TEST_DIR, 'test_combined.dae');
        const original = '<root>\n\t<h>hide this</h> \n\t<ph> keep this </ph> \n</root>';
        fs.writeFileSync(filePath, original);
        await cleanDae(filePath);
        const result = fs.readFileSync(filePath, 'utf8');
        assert.strictEqual(result, '<root>\n \n keep this \n</root>');
    });

    await t.test('does not write to file if content is unchanged', async () => {
        const filePath = path.join(TEST_DIR, 'test_unchanged.dae');
        fs.writeFileSync(filePath, '<root>clean content</root>');
        const initialStat = fs.statSync(filePath);

        // Wait a tiny bit to ensure mtime would be different if written
        await new Promise(resolve => setTimeout(resolve, 50));

        await cleanDae(filePath);
        const finalStat = fs.statSync(filePath);
        assert.strictEqual(initialStat.mtimeMs, finalStat.mtimeMs);
    });

    await t.test('handles non-existent files gracefully', async () => {
        const filePath = path.join(TEST_DIR, 'non_existent.dae');
        // The original cleanDae prints an error to console but doesn't throw.
        // We'll capture console.error to verify
        const originalError = console.error;
        let loggedError = '';
        console.error = (msg) => { loggedError = msg; };

        await cleanDae(filePath);

        console.error = originalError;
        assert.ok(loggedError.includes('Error: ENOENT'));
    });
});
