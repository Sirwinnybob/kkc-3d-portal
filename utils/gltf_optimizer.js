const { Document, NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { simplify, weld, cloneDocument } = require('@gltf-transform/functions');
const { MeshoptSimplifier } = require('meshoptimizer');
const fs = require('fs');

async function generateLods(glbPath) {
    try {
        await MeshoptSimplifier.ready;

        const io = new NodeIO();
        io.registerExtensions(ALL_EXTENSIONS);

        // Check if the source file exists
        if (!fs.existsSync(glbPath)) {
            console.error(`[gltf-transform] File not found: ${glbPath}`);
            return;
        }

        const docBase = await io.read(glbPath);

        // Create medium LOD (ratio: 0.5)
        const docMedium = cloneDocument(docBase);
        await docMedium.transform(
            weld({ tolerance: 0.0001 }),
            simplify({ simplifier: MeshoptSimplifier, ratio: 0.5, error: 0.01 })
        );
        const mediumPath = glbPath.replace('.glb', '_medium.glb');
        await io.write(mediumPath, docMedium);
        console.log(`[gltf-transform] Generated ${mediumPath}`);

        // Create low LOD (ratio: 0.25)
        const docLow = cloneDocument(docBase);
        await docLow.transform(
            weld({ tolerance: 0.0001 }),
            simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.05 })
        );
        const lowPath = glbPath.replace('.glb', '_low.glb');
        await io.write(lowPath, docLow);
        console.log(`[gltf-transform] Generated ${lowPath}`);

    } catch (err) {
        console.error(`[gltf-transform] Error generating LODs for ${glbPath}:`, err);
    }
}

module.exports = {
    generateLods
};
