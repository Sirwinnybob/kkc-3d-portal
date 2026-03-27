const gltf = {
    asset: { version: "2.0" },
    nodes: Array.from({length: 1000}, (_, i) => ({ name: "Node_" + i, mesh: i })),
    meshes: Array.from({length: 1000}, (_, i) => ({ name: "Mesh_" + i, primitives: [{ material: i }] })),
    materials: Array.from({length: 1000}, (_, i) => ({ name: "Material_" + i })),
    accessors: Array.from({length: 3000}, (_, i) => ({ bufferView: i, componentType: 5126, count: 100, type: "VEC3" })),
    bufferViews: Array.from({length: 3000}, (_, i) => ({ buffer: 0, byteOffset: i * 1200, byteLength: 1200 })),
    buffers: [{ byteLength: 3600000 }]
};

const iterations = 20;

console.time('JSON.parse(JSON.stringify)');
for (let i = 0; i < iterations; i++) {
    const clone = JSON.parse(JSON.stringify(gltf));
}
console.timeEnd('JSON.parse(JSON.stringify)');

console.time('Shallow clone');
for (let i = 0; i < iterations; i++) {
    const clone = { ...gltf };
}
console.timeEnd('Shallow clone');

console.time('structuredClone');
if (typeof structuredClone === 'function') {
    for (let i = 0; i < iterations; i++) {
        const clone = structuredClone(gltf);
    }
} else {
    console.log('structuredClone not available');
}
console.timeEnd('structuredClone');
