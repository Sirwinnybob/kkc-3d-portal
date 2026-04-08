const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { sanitizeGlbSamplers } = require('../server');

function createMockGlb(filepath, gltfData) {
    const jsonString = JSON.stringify(gltfData);
    const jsonLength = Buffer.byteLength(jsonString, 'utf8');
    const padding = (4 - (jsonLength % 4)) % 4;
    const paddedJson = jsonString + ' '.repeat(padding);
    const paddedJsonLength = jsonLength + padding;

    const totalLength = 12 + 8 + paddedJsonLength;
    const buffer = Buffer.alloc(totalLength);

    buffer.writeUInt32LE(0x46546C67, 0); // magic
    buffer.writeUInt32LE(2, 4);          // version
    buffer.writeUInt32LE(totalLength, 8); // total length

    buffer.writeUInt32LE(paddedJsonLength, 12); // chunk length
    buffer.writeUInt32LE(0x4E4F534A, 16);       // chunk type JSON
    buffer.write(paddedJson, 20, paddedJsonLength, 'utf8');

    fs.writeFileSync(filepath, buffer);
}

function readGltfFromGlb(filepath) {
    const buffer = fs.readFileSync(filepath);
    const jsonLength = buffer.readUInt32LE(12);
    const jsonString = buffer.toString('utf8', 20, 20 + jsonLength);
    return JSON.parse(jsonString);
}

test('sanitizeGlbSamplers fixes PBR metallic and roughness', async (t) => {
    const testGlb = path.join(__dirname, 'test_pbr.glb');

    await t.test('fixes undefined metallic/roughness', async () => {
        const mockGltf = {
            materials: [
                {
                    name: 'Material1',
                    pbrMetallicRoughness: {
                        baseColorTexture: { index: 0 }
                    }
                }
            ]
        };
        createMockGlb(testGlb, mockGltf);

        await sanitizeGlbSamplers(testGlb);

        const resultGltf = readGltfFromGlb(testGlb);
        const pbr = resultGltf.materials[0].pbrMetallicRoughness;
        assert.strictEqual(pbr.metallicFactor, 0.0);
        assert.strictEqual(pbr.roughnessFactor, 0.8);
    });

    await t.test('fixes defined overblown metallic/roughness', async () => {
        const mockGltf = {
            materials: [
                {
                    name: 'OverblownMaterial',
                    pbrMetallicRoughness: {
                        baseColorTexture: { index: 0 },
                        metallicFactor: 1.0,
                        roughnessFactor: 0.1
                    }
                }
            ]
        };
        createMockGlb(testGlb, mockGltf);

        await sanitizeGlbSamplers(testGlb);

        const resultGltf = readGltfFromGlb(testGlb);
        const pbr = resultGltf.materials[0].pbrMetallicRoughness;

        assert.strictEqual(pbr.metallicFactor, 0.0, 'It should fix defined metallicFactor to 0.0');
        assert.strictEqual(pbr.roughnessFactor, 0.8, 'It should fix defined roughnessFactor to 0.8');
    });

    // Cleanup
    if (fs.existsSync(testGlb)) fs.unlinkSync(testGlb);
});
