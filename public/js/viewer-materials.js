import * as THREE from 'three';
import { state, updateStatus, textureCache, SETTINGS, getRecentColors, addRecentColor, _lodVec } from './viewer-state.js';
import { openReplaceSheet } from './viewer-ui.js';

export function highlightMesh(mesh) {
    clearMeshHighlight();
    if (!mesh || !mesh.material) return;
    state.highlightedMesh = mesh;
    state.highlightOriginalEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : null;
    mesh.material.emissive = new THREE.Color(0x3b82f6);
    mesh.material.emissiveIntensity = 0.15;
}

export function clearMeshHighlight() {
    if (state.highlightedMesh && state.highlightedMesh.material) {
        state.highlightedMesh.material.emissive = state.highlightOriginalEmissive || new THREE.Color(0x000000);
        state.highlightedMesh.material.emissiveIntensity = 0;
    }
    state.highlightedMesh = null;
    state.highlightOriginalEmissive = null;
}

export function buildMaterialGroups(scene, customUrl) {
    const materials = [];
    scene.traverse((child) => {
        if (child.isMesh && child.material) {
            if (state.isShowroomMode) {
                if (!customUrl && (!child.userData.meshCategories || child.userData.meshCategories.length === 0)) {
                    return;
                }
            }
            const materialName = child.material.name || 'Unknown Material';
            if (materialName.includes('BoundingBox') || materialName.includes('Hidden')) return;
            if (child.name && (child.name.includes('BoundingBox') || child.name.includes('Hidden'))) return;

            const existing = materials.find(m => m.name === materialName);
            if (existing) {
                existing.meshes.push(child);
            } else {
                let cat = "Other";
                if (materialName.toLowerCase().includes("cabinet") || materialName.toLowerCase().includes("box")) cat = "Cabinets";
                else if (materialName.toLowerCase().includes("door") || materialName.toLowerCase().includes("drawer")) cat = "Doors & Drawers";
                else if (materialName.toLowerCase().includes("counter") || materialName.toLowerCase().includes("top")) cat = "Countertops";
                else if (materialName.toLowerCase().includes("wall") || materialName.toLowerCase().includes("floor") || materialName.toLowerCase().includes("ceiling")) cat = "Room";

                materials.push({
                    name: materialName,
                    category: cat,
                    meshes: [child],
                    material: child.material,
                    originalColor: child.material.color.clone()
                });
            }
        }
    });

    return materials.sort((a, b) => {
        const order = { "Cabinets": 1, "Doors & Drawers": 2, "Countertops": 3, "Room": 4, "Other": 5 };
        return order[a.category] - order[b.category];
    });
}

export async function getTextureBase64(texture) {
    if (!texture || !texture.image) return null;
    let image = texture.image;

    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8);
    }

    if (image instanceof HTMLImageElement) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.8);
        } catch (e) {
            console.warn("Could not read image data:", e);
            return null;
        }
    }
    return null;
}

export async function matchTexture(mat, jobCode, room) {
    if (!mat.material.map) return null;
    try {
        const base64Data = await getTextureBase64(mat.material.map);
        if (!base64Data) return null;

        const bodyData = { imageData: base64Data };
        if (jobCode) bodyData.jobCode = jobCode;
        if (room) bodyData.room = room;
        if (mat.name) bodyData.materialName = mat.name;

        const response = await fetch('/api/textures/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.bestMatch) return data.bestMatch;
        }
    } catch (e) {
        console.warn("Failed to match texture for:", mat.name, e);
    }
    return null;
}

export function applySolidColor(matGroup, hexColor) {
    const color = new THREE.Color(hexColor);
    matGroup.meshes.forEach(mesh => {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(m => {
            m.map = null;
            if (m.color) m.color.copy(color);
            m.needsUpdate = true;
        });
    });
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    matGroup.matchedName = `RGB(${r},${g},${b})`;
    matGroup.isColor = true;
    matGroup.colorHex = hexColor;
    addRecentColor(hexColor);
}

export function updateLodState(camera, renderer) {
    const now = Date.now();
    if (camera && state.scene && (now - state.lastLodCheckTime > 500) && state.detectedMaterials.length > 0) {
        state.lastLodCheckTime = now;
        const camPos = camera.position;

        const tHigh = window.lodHighThreshold || 500;
        const tMed = window.lodMediumThreshold || 2000;

        state.detectedMaterials.forEach(matGroup => {
            if (!matGroup.hasTexture || matGroup.isColor || window.forceHighResRender) return;
            if (!matGroup.urlLow && !matGroup.urlMedium) return;

            if (matGroup.meshes.length > 0) {
                const mesh = matGroup.meshes[0];
                if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
                _lodVec.copy(mesh.geometry.boundingSphere.center);
                mesh.localToWorld(_lodVec);
                const dist = camPos.distanceTo(_lodVec);

                let targetUrl = matGroup.urlHigh;
                if (dist > tMed) targetUrl = matGroup.urlLow || matGroup.urlMedium || matGroup.urlHigh;
                else if (dist > tHigh) targetUrl = matGroup.urlMedium || matGroup.urlHigh;

                if (targetUrl && matGroup.currentLODUrl !== targetUrl) {
                    matGroup.currentLODUrl = targetUrl;
                    if (textureCache.has(targetUrl)) {
                        const cachedTex = textureCache.get(targetUrl);
                        matGroup.meshes.forEach(m => {
                            m.material.map = cachedTex;
                            m.material.needsUpdate = true;
                        });
                    } else {
                        const loader = new THREE.TextureLoader();
                        loader.load(targetUrl, (tex) => {
                            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
                            tex.minFilter  = THREE.LinearMipmapLinearFilter;
                            tex.magFilter  = THREE.LinearFilter;
                            tex.wrapS      = THREE.RepeatWrapping;
                            tex.wrapT      = THREE.RepeatWrapping;
                            textureCache.set(targetUrl, tex);

                            if (matGroup.currentLODUrl === targetUrl) {
                                matGroup.meshes.forEach(m => {
                                    m.material.map = tex;
                                    m.material.needsUpdate = true;
                                });
                            }
                        });
                    }
                }
            }
        });
    }
}
