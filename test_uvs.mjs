import * as fs from 'fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

const data = fs.readFileSync('test/Exapmle parsing/548.glb');
const loader = new GLTFLoader();

// Provide polyfills to make three.js run in Node.js
global.atob = function (b64) { return Buffer.from(b64, 'base64').toString('binary'); };
global.btoa = function (bin) { return Buffer.from(bin, 'binary').toString('base64'); };
global.self = global;
global.window = global;
global.document = {
    createElement: function (nodeName) {
        if (nodeName === 'canvas') return {
            getContext: function () { return { fillRect: function() {}, drawImage: function() {}, getImageData: function() {} }; }
        };
        return {};
    },
    createElementNS: function() { return {}; }
};

loader.parse(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '', function (gltf) {
    let checked = 0;
    gltf.scene.traverse(function (child) {
        if (child.isMesh && checked < 3) {
            checked++;
            child.geometry.computeBoundingBox();
            const bbox = child.geometry.boundingBox;
            const size = new THREE.Vector3();
            bbox.getSize(size);

            console.log(`\nMesh: ${child.name}`);
            console.log(`Dimensions (X,Y,Z): ${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}`);

            const uvs = child.geometry.attributes.uv;
            if (uvs) {
                let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
                for (let i = 0; i < uvs.count; i++) {
                    const u = uvs.getX(i);
                    const v = uvs.getY(i);
                    if (u < minU) minU = u;
                    if (u > maxU) maxU = u;
                    if (v < minV) minV = v;
                    if (v > maxV) maxV = v;
                }
                console.log(`UV Range: U [${minU.toFixed(2)}, ${maxU.toFixed(2)}], V [${minV.toFixed(2)}, ${maxV.toFixed(2)}]`);
                console.log(`UV Width: ${(maxU - minU).toFixed(2)}, UV Height: ${(maxV - minV).toFixed(2)}`);

                // Compare UV scale to physical scale
                const primaryDims = [size.x, size.y, size.z].sort((a,b) => b-a);
                console.log(`Physical / UV Ratio (Width): ${(primaryDims[1] / (maxU - minU)).toFixed(2)}`);
                console.log(`Physical / UV Ratio (Height): ${(primaryDims[0] / (maxV - minV)).toFixed(2)}`);
            }
        }
    });
}, function (error) {
    console.error(error);
});
