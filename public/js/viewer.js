import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

import { state, updateStatus, jobCode, roomName, customUrl, stagingFile, loadPin } from './viewer-state.js';
import { initEngine } from './viewer-core.js';
import { setupUI, renderShowroomPanel } from './viewer-ui.js';
import { buildMaterialGroups } from './viewer-materials.js';
import { fetchShowroomCategories, checkShowroomPin, loadShowroomPart, reframeShowroomCamera } from './viewer-showroom.js';

// Setup basic global error handling
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global Error: ', msg, error);
    updateStatus('Error loading viewer', true);
    return false;
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize Engine & UI
    const core = initEngine('viewer-container');
    setupUI(() => {
        // Render callback
        if (state.isShowroomMode) reframeShowroomCamera(core.camera, core.controls);
    });

    // 2. Determine Load Mode
    if (loadPin) {
        state.isShowroomMode = true;
        await loadShowroom(loadPin);
    } else if (stagingFile) {
        state.isShowroomMode = true;
        await loadStagingModel(stagingFile);
    } else if (customUrl) {
        await loadModelFromUrl(customUrl);
    } else if (jobCode && roomName) {
        await loadJobModel(jobCode, roomName);
    } else {
        updateStatus('No model specified', true);
    }
});

async function loadShowroom(pin) {
    updateStatus('Loading Showroom Config...');
    state.showroomPin = pin;

    // UI handling for Showroom
    document.getElementById('texture-panel')?.classList.add('hidden');
    document.getElementById('showroom-panel')?.classList.remove('hidden');
    document.getElementById('pin-display').textContent = pin;

    const cats = await fetchShowroomCategories();
    if (!cats) return updateStatus('Failed to load categories', true);

    const config = await checkShowroomPin(pin);
    if (!config) return updateStatus('Invalid PIN', true);

    // Load styles
    state.kitchenStyle = config.kitchenStyle || 'face_frame';
    state.islandStyle = config.islandStyle || 'face_frame';
    state.overlayStyle = config.overlayStyle || 'full';
    state.islandOverlayStyle = config.islandOverlayStyle || 'full';

    // Build parts
    updateStatus('Building configuration...');
    const loadPromises = [];
    ['kitchen', 'island'].forEach(ctx => {
        if (config[ctx] && config[ctx].parts) {
            for (const [partKey, partData] of Object.entries(config[ctx].parts)) {
                const cat = partKey.split('/')[1];
                loadPromises.push(loadShowroomPart(cat, ctx, partData.deepPath));
            }
        }
    });

    await Promise.all(loadPromises);

    if (config.view && config.view.position && config.view.target) {
        state.camera.position.fromArray(config.view.position);
        state.controls.target.fromArray(config.view.target);
        state.controls.update();
    } else {
        reframeShowroomCamera(state.camera, state.controls);
    }

    renderShowroomPanel(() => reframeShowroomCamera(state.camera, state.controls));
    updateStatus('Showroom Loaded');
}

async function loadStagingModel(file) {
    updateStatus(`Loading Staging: ${file}...`);
    document.getElementById('texture-panel')?.classList.add('hidden');
    document.getElementById('showroom-panel')?.classList.remove('hidden');

    const cats = await fetchShowroomCategories();
    if (!cats) updateStatus('Failed to load categories', true);

    const fullPath = `/api/showroom/staging/file/${file}`;
    await loadGltf(fullPath);
    renderShowroomPanel(() => reframeShowroomCamera(state.camera, state.controls));
}

async function loadJobModel(jobCode, roomName) {
    updateStatus('Loading 3D Model...');
    document.getElementById('texture-panel')?.classList.remove('hidden');
    document.getElementById('showroom-panel')?.classList.add('hidden');

    try {
        const pathPrefix = `/jobs/${jobCode}/${roomName}`;

        // Try DAE first, fallback to GLB/OBJ
        const check = await fetch(`${pathPrefix}.dae`, { method: 'HEAD' });
        if (check.ok) {
            // Note: In real setup, you might import ColladaLoader.
            // The previous viewer used GLB fallback if DAE failed. Let's assume GLB here for refactor simplicity
            await loadGltf(`${pathPrefix}.glb`);
        } else {
            const glbCheck = await fetch(`${pathPrefix}.glb`, { method: 'HEAD' });
            if (glbCheck.ok) {
                await loadGltf(`${pathPrefix}.glb`);
            } else {
                await loadObj(pathPrefix);
            }
        }
    } catch(e) {
        updateStatus('Failed to load room', true);
    }
}

async function loadModelFromUrl(url) {
    updateStatus('Loading Model...');
    document.getElementById('texture-panel')?.classList.remove('hidden');
    document.getElementById('showroom-panel')?.classList.add('hidden');

    if (url.toLowerCase().endsWith('.obj')) {
        await loadObj(url.replace('.obj', ''));
    } else {
        await loadGltf(url);
    }
}

async function loadGltf(url) {
    const loader = new GLTFLoader();
    try {
        const gltf = await loader.loadAsync(url);
        onModelLoaded(gltf.scene);
    } catch (e) {
        console.error(e);
        updateStatus('Error loading GLTF', true);
    }
}

async function loadObj(basePath) {
    const objLoader = new OBJLoader();
    const mtlLoader = new MTLLoader();
    try {
        const materials = await mtlLoader.loadAsync(`${basePath}.mtl`);
        materials.preload();
        objLoader.setMaterials(materials);
        const obj = await objLoader.loadAsync(`${basePath}.obj`);
        onModelLoaded(obj);
    } catch(e) {
        console.error(e);
        updateStatus('Error loading OBJ', true);
    }
}

function onModelLoaded(model) {
    if (state.loadedModel) state.scene.remove(state.loadedModel);

    state.loadedModel = model;
    state.scene.add(model);

    // Process Materials
    state.detectedMaterials = buildMaterialGroups(model);

    // Fit Camera
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    state.controls.target.copy(center);
    state.camera.position.set(center.x, center.y + maxDim * 0.5, center.z + maxDim);
    state.camera.lookAt(center);
    state.controls.update();

    updateStatus('Model loaded');
}
