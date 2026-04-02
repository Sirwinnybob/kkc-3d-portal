import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { state, updateStatus, statusEl, statusText, jobCode, roomName, escapeHtml, customUrl } from './viewer-state.js';
import { buildMaterialGroups } from './viewer-materials.js';

const gltfLoader = new GLTFLoader();

export async function fetchShowroomCategories() {
    try {
        const response = await fetch('/api/showroom/categories');
        if (response.ok) {
            state.showroomCategories = await response.json();
            return state.showroomCategories;
        }
    } catch (err) {
        console.error("Failed to load showroom categories:", err);
    }
    return null;
}

export async function checkShowroomPin(pin) {
    try {
        const r = await fetch(`/api/showroom/config/${pin}`);
        if (r.ok) return await r.json();
        return null;
    } catch {
        return null;
    }
}

export function buildCategoryTree(ctx, overlayStr) {
    if (!state.showroomCategories[ctx]) return [];

    // Style loop (e.g. face_frame, frameless)
    let stylesToSearch = [ctx === 'island' ? state.islandStyle : state.kitchenStyle];
    if (stylesToSearch[0] === 'face_frame') {
        const overlay = ctx === 'island' ? state.islandOverlayStyle : state.overlayStyle;
        overlayStr = overlayStr || (overlay.charAt(0).toUpperCase() + overlay.slice(1) + ' Overlay');
    }

    const categories = [];

    for (const style of stylesToSearch) {
        const styleData = state.showroomCategories[ctx][style];
        if (!styleData) continue;

        // If face frame, we need to go one level deeper into the Overlay folder
        let searchBase = styleData;
        if (style === 'face_frame' && overlayStr && styleData[overlayStr]) {
            searchBase = styleData[overlayStr];
        }

        for (const catName of Object.keys(searchBase)) {
            // Find deep parts
            const parts = [];
            const collect = (node, path) => {
                if (node._file) {
                    const cleanName = path.split('/').pop().replace('.glb', '').replace(/_/g, ' ');
                    parts.push({
                        label: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
                        deepPath: node._file
                    });
                } else {
                    for (const [k, v] of Object.entries(node)) {
                        if (k === '_file' || k === '_dir') continue;
                        collect(v, path ? `${path}/${k}` : k);
                    }
                }
            };

            collect(searchBase[catName], "");
            if (parts.length > 0) {
                categories.push({ id: catName, label: formatCatName(catName), parts });
            }
        }
    }

    return categories.sort((a,b) => {
        if (a.id === 'base') return -1;
        if (b.id === 'base') return 1;
        return a.label.localeCompare(b.label);
    });
}

export function formatCatName(s) {
    return s.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Ensure loadShowroomPart calls gltfLoader
export async function loadShowroomPart(category, ctx, deepPath, btnEl = null, renderCallback = null) {
    const partKey = `${ctx}/${category}`;
    if (btnEl) {
        btnEl.parentElement.querySelectorAll('.part-option-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active', 'loading');
    }

    if (state.showroomParts[partKey]) {
        if (category === 'finished_ends') restoreBasePaneledEndMeshes(ctx);
        state.scene.remove(state.showroomParts[partKey].group);
        const oldMeshes = new Set();
        state.showroomParts[partKey].group.traverse(c => { if (c.isMesh) oldMeshes.add(c); });
        state.detectedMaterials = state.detectedMaterials.filter(m => !m.meshes.some(mesh => oldMeshes.has(mesh)));
        state.kitchenMaterials  = state.kitchenMaterials.filter(m => !m.meshes.some(mesh => oldMeshes.has(mesh)));
        state.islandMaterials   = state.islandMaterials.filter(m => !m.meshes.some(mesh => oldMeshes.has(mesh)));
        delete state.showroomParts[partKey];
    }

    let tagData = null;
    try {
        const tagsResp = await fetch(`/api/showroom/tags/${deepPath}`);
        if (tagsResp.ok) tagData = await tagsResp.json();
    } catch(e) { console.warn("No tags found for", deepPath); }

    try {
        const gltf = await gltfLoader.loadAsync(`/api/showroom/file/${deepPath}`);
        const group = new THREE.Group();
        group.name = partKey;

        // Reposition logic
        let yOffset = 0;
        let zOffset = 0;
        let xOffset = 0;

        if (ctx === 'kitchen') {
            if (category === 'uppers') yOffset = 54;
            else if (category === 'talls') yOffset = 0;
            else if (category === 'finished_ends') zOffset = 0.5; // push ends out slightly to prevent z-fighting
        } else if (ctx === 'island') {
            zOffset = 48; // move island out 48 inches
            xOffset = 12; // offset from center
        }

        gltf.scene.traverse(child => {
            if (child.isMesh) {
                child.position.y += yOffset;
                child.position.z += zOffset;
                child.position.x += xOffset;
                if (child.material) {
                    // Start everything in milky gray
                    child.material = new THREE.MeshStandardMaterial({ color: state.MILKY_GRAY, roughness: 0.7 });
                    if (tagData && tagData.meshCategories && tagData.meshCategories[child.name]) {
                        child.userData.meshCategories = tagData.meshCategories[child.name];
                    } else if (!customUrl) {
                        child.visible = false;
                    }
                }
            }
        });

        group.add(gltf.scene);
        state.scene.add(group);
        state.showroomParts[partKey] = { group, style: state.kitchenStyle, deepPath, tagData };
        if (btnEl) btnEl.classList.remove('loading');

        // Refresh material groups and trigger a render
        state.detectedMaterials = buildMaterialGroups(state.scene);
        state.kitchenMaterials = state.detectedMaterials;

        // Handle Paneled Ends (hiding base geometry when applied)
        if (category === 'finished_ends') {
            handlePaneledEndSwap(ctx, deepPath);
        }

        if (renderCallback) renderCallback();
        return true;

    } catch (error) {
        console.error("Error loading part:", deepPath, error);
        if (btnEl) btnEl.classList.remove('loading');
        return false;
    }
}

function handlePaneledEndSwap(ctx, deepPath) {
    if (!/paneled/i.test(deepPath)) { restoreBasePaneledEndMeshes(ctx); return; }
    const basePart = state.showroomParts[`${ctx}/base`];
    if (!basePart?.tagData?.paneledEndReplacements) return;
    const replaceableNames = new Set(basePart.tagData.paneledEndReplacements);
    basePart.group.traverse(child => {
        if (child.isMesh && replaceableNames.has(child.name)) {
            child.visible = false;
            child.userData._hiddenByPaneledEnd = true;
        }
    });
}

function restoreBasePaneledEndMeshes(ctx) {
    const basePart = state.showroomParts[`${ctx}/base`];
    if (!basePart) return;
    basePart.group.traverse(child => {
        if (child.isMesh && child.userData._hiddenByPaneledEnd) {
            child.visible = true;
            delete child.userData._hiddenByPaneledEnd;
        }
    });
}

export function reframeShowroomCamera(camera, controls) {
    const box = new THREE.Box3();
    let hasContent = false;
    for (const part of Object.values(state.showroomParts)) {
        const partBox = new THREE.Box3().setFromObject(part.group);
        if (!partBox.isEmpty()) {
            box.union(partBox);
            hasContent = true;
        }
    }
    if (!hasContent) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    controls.target.copy(center);
    camera.position.set(center.x, center.y + maxDim * 0.3, center.z + maxDim * 1.5);
    camera.lookAt(center);
    controls.update();
}

export async function saveShowroomConfig(camera, controls) {
    const btn = document.getElementById('save-pin-btn');
    if (!btn) return;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = 'Saving...';
    btn.disabled = true;

    const config = {
        kitchenStyle: state.kitchenStyle,
        islandStyle: state.islandStyle,
        overlayStyle: state.overlayStyle,
        islandOverlayStyle: state.islandOverlayStyle,
        kitchen: { parts: {} },
        island: { parts: {} },
        materials: {}, // We'd serialize material maps here in a full app
        view: {
            position: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z]
        }
    };

    for (const [partKey, part] of Object.entries(state.showroomParts)) {
        const [ctx, cat] = partKey.split('/');
        const section = ctx === 'island' ? config.island : config.kitchen;
        section.parts[partKey] = { deepPath: part.deepPath };
    }

    try {
        const r = await fetch('/api/showroom/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const res = await r.json();

        if (res.success) {
            const url = new URL(window.location);
            url.searchParams.set('pin', res.pin);
            window.history.pushState({}, '', url);
            state.showroomPin = res.pin;

            const pinDisplay = document.getElementById('pin-display');
            if (pinDisplay) pinDisplay.textContent = res.pin;
            updateStatus('Configuration Saved!');
        } else {
            updateStatus('Failed to save config', true);
        }
    } catch (e) {
        updateStatus('Failed to save config', true);
    } finally {
        btn.innerHTML = oldHtml;
        btn.disabled = false;
    }
}
