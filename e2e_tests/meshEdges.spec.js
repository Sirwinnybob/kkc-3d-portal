const { test, expect } = require('@playwright/test');

// Two white panels sharing geometry, including a transformed child mesh.
const positions = new Float32Array([
    -1, -1, -0.1, 1, -1, -0.1, 1, 1, -0.1, -1, 1, -0.1,
    -1, -1, 0.1, 1, -1, 0.1, 1, 1, 0.1, -1, 1, 0.1
]);
const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
    3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
]);
const buffer = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
const model = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [
        { mesh: 0, name: 'WhitePanel', children: [1] },
        { mesh: 0, name: 'AngledPanel', translation: [2.2, 0, -0.5], rotation: [0, 0.258819, 0, 0.965926] }
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0 } }],
    buffers: [{ uri: 'edge-buffer.bin', byteLength: buffer.length }],
    bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
        { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }
    ],
    accessors: [
        { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-1, -1, -0.1], max: [1, 1, 0.1] },
        { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' }
    ]
};

async function meshState(page) {
    return page.evaluate(() => {
        const meshes = [];
        window.getScene()?.traverse(obj => {
            if (!obj.isMesh) return;
            const edges = obj.children.filter(child => child.name === 'mesh-edges');
            meshes.push({
                count: edges.length,
                visible: edges[0]?.visible,
                segments: edges[0]?.geometry.attributes.position.count / 2
            });
        });
        return meshes;
    });
}

test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('kkc_help_shown', 'true');
        localStorage.setItem('kkc_tutorial_v1', 'true');
        localStorage.setItem('kkc_skip_disclaimer', 'true');
    });
    await page.route('**/api/**', route => {
        if (route.request().url().endsWith('/api/job/EDGES/WHITE')) {
            return route.fulfill({ json: { success: true, url: '/edge-high.gltf', urlMedium: '/edge-medium.gltf' } });
        }
        return route.fulfill({ json: { success: true, rooms: ['WHITE'], manifest: [], textures: [] } });
    });
    await page.route('**/edge-*.gltf', route => route.fulfill({ json: model }));
    await page.route('**/edge-buffer.bin', route => route.fulfill({ body: buffer, contentType: 'application/octet-stream' }));
    await page.goto('/viewer.html?job=EDGES&room=WHITE');
    await expect.poll(async () => (await meshState(page)).length).toBe(2);
});

test('white meshes have edges by default; keyboard toggle persists across reloads', async ({ page }) => {
    await page.locator('#menu-btn').click();
    const toggle = page.getByRole('checkbox', { name: 'Show Outlines' });
    await expect(toggle).toBeChecked();
    expect(await meshState(page)).toEqual([
        { count: 1, visible: true, segments: 12 },
        { count: 1, visible: true, segments: 12 }
    ]);

    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).not.toBeChecked();
    expect((await meshState(page)).every(mesh => !mesh.visible)).toBe(true);
    await page.reload();
    await expect.poll(async () => (await meshState(page)).length).toBe(2);
    await page.locator('#menu-btn').click();
    await expect(toggle).not.toBeChecked();
    expect((await meshState(page)).every(mesh => mesh.count === 0)).toBe(true);
    await toggle.check();
    expect((await meshState(page)).every(mesh => mesh.count === 1 && mesh.visible)).toBe(true);
});

test('quality replacement keeps edges enabled without duplicates', async ({ page }) => {
    await page.locator('#menu-btn').click();
    await page.locator('#lod-quality-medium').click();
    await expect.poll(() => page.evaluate(() => window.activeModelQuality)).toBe('medium');
    expect((await meshState(page)).every(mesh => mesh.count === 1 && mesh.visible)).toBe(true);
    const toggle = page.getByRole('checkbox', { name: 'Show Outlines' });
    await toggle.uncheck();
    await toggle.check();
    expect((await meshState(page)).every(mesh => mesh.count === 1 && mesh.visible)).toBe(true);
});

test('edges follow transforms, do not intercept picks, and release removed mesh resources', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const THREE = await import('three');
        const { MeshEdges } = await import('/js/meshEdges.js');
        const scene = new THREE.Scene();
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        group.position.set(5, 2, 3);
        group.scale.setScalar(2);
        group.add(mesh);
        scene.add(group);
        const manager = new MeshEdges(scene);
        manager.setEnabled(true);
        const edges = mesh.children[0];
        scene.updateMatrixWorld(true);
        const followsTransform = edges.matrixWorld.equals(mesh.matrixWorld);
        const raycaster = new THREE.Raycaster(new THREE.Vector3(5, 2, 10), new THREE.Vector3(0, 0, -1));
        const picks = raycaster.intersectObjects(scene.children, true);
        let disposed = false;
        edges.geometry.addEventListener('dispose', () => { disposed = true; });
        manager.removeMeshes(new Set([mesh]));
        const removed = mesh.children.length === 0;
        manager.add(group);
        const recreated = mesh.children.length === 1;
        manager.dispose();
        return { followsTransform, onlyMeshPicks: picks.length > 0 && picks.every(hit => hit.object === mesh),
            depthTest: edges.material.depthTest, depthWrite: edges.material.depthWrite, disposed, removed, recreated };
    });
    expect(result).toEqual({ followsTransform: true, onlyMeshPicks: true, depthTest: true, depthWrite: false,
        disposed: true, removed: true, recreated: true });
});
