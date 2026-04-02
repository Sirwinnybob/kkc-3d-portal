import * as THREE from 'three';
import { state, updateStatus, textureCache, SETTINGS, jobCode, roomName, escapeHtml, customUrl } from './viewer-state.js';

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

export function buildMaterialGroups(scene) {
    const materials = [];
    scene.traverse((child) => {
        if (child.isMesh && child.material) {
            if (state.isShowroomMode) {
                // If the user provided ?url=..., they can change everything
                // but if not, showroom defaults to only replacing specific tagged meshes
                if (!customUrl && (!child.userData.meshCategories || child.userData.meshCategories.length === 0)) {
                    return;
                }
            }

            const materialName = child.material.name || 'Unknown Material';

            // Filter out internal / helper objects
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

// Convert texture to Base64 for matching
export async function getTextureBase64(texture) {
    if (!texture || !texture.image) return null;

    let image = texture.image;

    // If it's an ImageBitmap (e.g. from ImageBitmapLoader), draw it to a canvas
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8);
    }

    // If it's a regular HTMLImageElement
    if (image instanceof HTMLImageElement) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth || image.width;
            canvas.height = image.naturalHeight || image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            return canvas.toDataURL('image/jpeg', 0.8);
        } catch (e) {
            console.warn("Could not read image data (likely CORS):", e);
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
            if (data.success && data.bestMatch) {
                return data.bestMatch;
            }
        }
    } catch (e) {
        console.warn("Failed to match texture for:", mat.name, e);
    }
    return null;
}

export async function updateMaterialMap(url, meshes, onLoadCallback) {
    updateStatus('Loading texture...');
    const textureLoader = new THREE.TextureLoader();

    try {
        // Try to get from cache first
        let texture = textureCache.get(url);

        if (!texture) {
            texture = await textureLoader.loadAsync(url);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            // Basic scale, could be improved based on real-world scale data
            texture.repeat.set(1, 1);
            textureCache.set(url, texture);
        }

        meshes.forEach(mesh => {
            // Clone material so we don't affect other objects sharing the old material
            if (mesh.material) {
                // If it's a showroom replacement, clone it, otherwise we might just be replacing everything
                mesh.material = mesh.material.clone();
                mesh.material.map = texture;
                mesh.material.color.setHex(0xffffff); // reset color to white when using texture
                mesh.material.needsUpdate = true;
            }
        });

        updateStatus('Texture applied');
        if (onLoadCallback) onLoadCallback();
        return texture;
    } catch (error) {
        console.error('Error loading texture:', error);
        updateStatus('Failed to load texture', true);
        return null;
    }
}

export function updateMaterialColor(hex, meshes) {
    meshes.forEach(mesh => {
        if (mesh.material) {
            mesh.material = mesh.material.clone();
            mesh.material.map = null; // remove texture
            mesh.material.color.setHex(hex);
            mesh.material.needsUpdate = true;
        }
    });
}
