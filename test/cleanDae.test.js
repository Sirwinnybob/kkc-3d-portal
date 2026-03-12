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
        const originalError = console.error;
        let loggedError = '';
        console.error = (msg) => { loggedError = msg; };

        await cleanDae(filePath);

        console.error = originalError;
        assert.ok(loggedError.includes('Error: ENOENT'));
    });

    await t.test('converts simple ph (quad outer, no holes) to two triangles', async () => {
        const filePath = path.join(TEST_DIR, 'test_ph_no_holes.dae');
        // stride=1 (one input), outer is a quad (4 verts) → 2 triangles
        const input = [
            '<polygons count="1">',
            '<input semantic="VERTEX" source="#verts" offset="0"/>',
            '<ph><p>0 1 2 3</p></ph>',
            '</polygons>'
        ].join('\n');
        fs.writeFileSync(filePath, input);
        await cleanDae(filePath);
        const result = fs.readFileSync(filePath, 'utf8');
        // No <ph> or <h> should remain
        assert.ok(!result.includes('<ph>'), 'should not contain <ph>');
        assert.ok(!result.includes('<h>'), 'should not contain <h>');
        // Should contain two <p> triangle entries (3 indices each)
        const pMatches = [...result.matchAll(/<p>([^<]*)<\/p>/g)];
        assert.strictEqual(pMatches.length, 2);
        pMatches.forEach(m => {
            const nums = m[1].trim().split(/\s+/);
            assert.strictEqual(nums.length, 3, 'each triangle <p> should have 3 indices');
        });
        // count attribute must be updated from "1" to "2" (Assimp assertion fix)
        const countMatch = result.match(/<polygons[^>]*count="(\d+)"/);
        assert.ok(countMatch, 'should have count attribute');
        assert.strictEqual(countMatch[1], '2', 'count should be updated to match actual <p> count');
    });

    await t.test('converts ph with one hole into triangulated p elements', async () => {
        const filePath = path.join(TEST_DIR, 'test_ph_one_hole.dae');
        // stride=2 (two inputs: VERTEX offset=0, TEXCOORD offset=1)
        // outer: 4 verts (indices 0-3), hole: 4 verts (indices 4-7) — real VANITIES-style
        const input = [
            '<polygons material="M" count="1">',
            '<input semantic="VERTEX" source="#verts" offset="0"/>',
            '<input offset="1" semantic="TEXCOORD" source="#tc"/>',
            '<ph>',
            '<p>0 0 1 1 2 2 3 3</p>',
            '<h>4 4 5 5 6 6 7 7</h>',
            '</ph>',
            '</polygons>'
        ].join('\n');
        fs.writeFileSync(filePath, input);
        await cleanDae(filePath);
        const result = fs.readFileSync(filePath, 'utf8');

        assert.ok(!result.includes('<ph>'), 'should not contain <ph>');
        assert.ok(!result.includes('<h>'), 'should not contain <h>');

        // Each triangle has 3 tuples × stride(2) = 6 numbers per <p>
        const pMatches = [...result.matchAll(/<p>([^<]*)<\/p>/g)];
        assert.ok(pMatches.length > 0, 'should produce at least one triangle <p>');
        pMatches.forEach(m => {
            const nums = m[1].trim().split(/\s+/);
            assert.strictEqual(nums.length, 6, 'each stride-2 triangle <p> should have 6 numbers');
        });
    });

    await t.test('preserves regular <p> elements inside <polygons> unchanged', async () => {
        const filePath = path.join(TEST_DIR, 'test_regular_p.dae');
        const input = [
            '<polygons count="1">',
            '<input semantic="VERTEX" source="#v" offset="0"/>',
            '<p>0 1 2</p>',
            '</polygons>'
        ].join('\n');
        fs.writeFileSync(filePath, input);
        await cleanDae(filePath);
        const result = fs.readFileSync(filePath, 'utf8');
        assert.ok(result.includes('<p>0 1 2</p>'), 'regular <p> should be preserved');
    });

    await t.test('handles polygons with both regular p and ph elements', async () => {
        const filePath = path.join(TEST_DIR, 'test_mixed.dae');
        const input = [
            '<polygons count="2">',
            '<input semantic="VERTEX" source="#v" offset="0"/>',
            '<p>0 1 2 3</p>',
            '<ph><p>4 5 6 7</p><h>8 9 10 11</h></ph>',
            '</polygons>'
        ].join('\n');
        fs.writeFileSync(filePath, input);
        await cleanDae(filePath);
        const result = fs.readFileSync(filePath, 'utf8');
        // Original <p>0 1 2 3</p> should still be present (unchanged)
        assert.ok(result.includes('<p>0 1 2 3</p>'), 'regular poly <p> should be untouched');
        assert.ok(!result.includes('<ph>'), 'no <ph> should remain');
        assert.ok(!result.includes('<h>'), 'no <h> should remain');
    });
});
