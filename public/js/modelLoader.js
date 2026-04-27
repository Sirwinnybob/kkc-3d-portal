import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

export function loadModel(url, maxAnisotropy, onProgress) {
    return new Promise((resolve, reject) => {
        const isObj = url.toLowerCase().endsWith('.obj');

        if (isObj) {
            loadObjModel(url, maxAnisotropy, onProgress, resolve, reject);
        } else {
            loadGltfModel(url, maxAnisotropy, onProgress, resolve, reject);
        }
    });
}

function parseFileUnits(text) {
    const lines = text.substring(0, 1024).split('\n');
    let scale = 1.0;
    for (const line of lines) {
        if (line.startsWith('# File units = ')) {
            const unit = line.split('=')[1].trim().toLowerCase();
            if (unit === 'inches') scale = 0.0254;
            else if (unit === 'millimeters' || unit === 'millimeter' || unit === 'mm') scale = 0.001;
            else if (unit === 'centimeters' || unit === 'centimeter' || unit === 'cm') scale = 0.01;
            else if (unit === 'meters' || unit === 'meter' || unit === 'm') scale = 1.0;
            else if (unit === 'feet' || unit === 'foot' || unit === 'ft') scale = 0.3048;
            break;
        }
    }
    return scale;
}

function loadObjModel(url, maxAnisotropy, onProgress, resolve, reject) {
    const mtlUrl = url.substring(0, url.lastIndexOf('.')) + '.mtl';
    const mtlDir = mtlUrl.substring(0, mtlUrl.lastIndexOf('/') + 1);

    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
        if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) {
            return url;
        }
        let cleanUrl = url.replace(/\\/g, '/');
        cleanUrl = cleanUrl.replace(/#/g, '%23');
        cleanUrl = cleanUrl.replace(/\?/g, '%3F');
        return cleanUrl;
    });

    manager.onError = function (errorUrl) {
        console.error('There was an error loading ' + errorUrl);
    };

    const mtlLoader = new MTLLoader(manager);
    mtlLoader.setResourcePath(mtlDir);

    mtlLoader.load(mtlUrl, function(materials) {
        for (const matName in materials.materialsInfo) {
            const info = materials.materialsInfo[matName];
            if (info.map_kd) {
                const texUrl = mtlDir + info.map_kd;
                let m = materials.materials[matName];
                if (!m) {
                    m = new THREE.MeshPhongMaterial({ name: matName });
                    materials.materials[matName] = m;
                }

                const tex = new THREE.TextureLoader().load(
                    texUrl,
                    function(loadedTex) {
                        loadedTex.colorSpace = THREE.SRGBColorSpace;
                        loadedTex.flipY = true;
                        m.map = loadedTex;
                        m.needsUpdate = true;
                    },
                    undefined,
                    function(err) {
                        console.error(`Failed to load texture from: ${texUrl}`, err);
                    }
                );

                m.map = tex;
                m.map.wrapS = THREE.RepeatWrapping;
                m.map.wrapT = THREE.RepeatWrapping;
                m.color.setHex(0xffffff);
                if (m.emissive) m.emissive.setHex(0x000000);
                if (m.specular) m.specular.setHex(0x111111);
                m.needsUpdate = true;
            }
        }

        materials.preload();

        const objLoader = new OBJLoader(manager);
        objLoader.setMaterials(materials);

        const fileLoader = new THREE.FileLoader(manager);

        fileLoader.load(url, function(text) {
            const scale = parseFileUnits(text);
            const model = objLoader.parse(text);

            model.scale.set(scale, scale, scale);
            model.updateMatrixWorld(true);

            const detectedMaterials = [];
            const materialMap = new Map();

            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    const mats = Array.isArray(child.material) ? child.material : [child.material];

                    mats.forEach(mat => {
                        mat.side = THREE.DoubleSide;
                        mat.polygonOffset = true;
                        mat.polygonOffsetFactor = 1;
                        mat.polygonOffsetUnits = 1;

                        if (mat.map) {
                            mat.color.setHex(0xffffff);
                            mat.map.anisotropy = maxAnisotropy;
                            mat.map.minFilter  = THREE.LinearMipmapLinearFilter;
                            mat.map.magFilter  = THREE.LinearFilter;
                            if (mat.emissive) mat.emissive.setHex(0x000000);
                            if (mat.specular) mat.specular.setHex(0x111111);
                        }

                        const hasTexture = !!mat.map;

                        if (hasTexture) {
                            const texSrc = mat.map.source?.data?.src || mat.map.image?.src || 'obj_texture';
                            if (!materialMap.has(texSrc)) {
                                materialMap.set(texSrc, { material: mat, meshes: [], name: mat.name || 'OBJ Material', hasTexture, originalMap: texSrc });
                            }
                            if (!materialMap.get(texSrc).meshes.includes(child)) materialMap.get(texSrc).meshes.push(child);
                        } else {
                            const materialKey = mat.uuid; // keep per-material grouping so same flat color can still be swapped independently
                            const colorHex = mat.color ? `#${mat.color.getHexString().toUpperCase()}` : '#CCCCCC';
                            if (!materialMap.has(materialKey)) {
                                materialMap.set(materialKey, {
                                    material: mat,
                                    meshes: [],
                                    name: mat.name || 'OBJ Material',
                                    hasTexture: false,
                                    originalMap: null,
                                    isColor: true,
                                    colorHex
                                });
                            }
                            if (!materialMap.get(materialKey).meshes.includes(child)) materialMap.get(materialKey).meshes.push(child);
                        }
                    });
                }
            });

            detectedMaterials.push(...Array.from(materialMap.values()));
            resolve({ model, detectedMaterials });

        }, onProgress, reject);

    }, undefined, function(err) {
        console.warn('MTL load failed, loading OBJ without materials:', err);
        const objLoader = new OBJLoader(manager);
        const fileLoader = new THREE.FileLoader(manager);

        fileLoader.load(url, function(text) {
            const scale = parseFileUnits(text);
            const model = objLoader.parse(text);
            model.scale.set(scale, scale, scale);
            model.updateMatrixWorld(true);

            const detectedMaterials = [];
            const materialMap = new Map();

            model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.material = new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide });

                    const materialKey = child.material.uuid;
                    const colorHex = child.material.color ? `#${child.material.color.getHexString().toUpperCase()}` : '#CCCCCC';
                    if (!materialMap.has(materialKey)) {
                        materialMap.set(materialKey, {
                            material: child.material,
                            meshes: [],
                            name: child.material.name || 'OBJ Material',
                            hasTexture: false,
                            originalMap: null,
                            isColor: true,
                            colorHex
                        });
                    }
                    if (!materialMap.get(materialKey).meshes.includes(child)) materialMap.get(materialKey).meshes.push(child);
                }
            });

            detectedMaterials.push(...Array.from(materialMap.values()));
            resolve({ model, detectedMaterials });

        }, onProgress, reject);
    });
}

function loadGltfModel(url, maxAnisotropy, onProgress, resolve, reject) {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
        const model = gltf.scene;
        const detectedMaterials = [];
        const materialMap = new Map();

        model.traverse((child) => {
            if (child.isMesh) {
                const prevMats = Array.isArray(child.material) ? child.material : [child.material];
                const newMats = prevMats.map(prevMat => {
                    const newMat = new THREE.MeshLambertMaterial({
                        map: prevMat.map,
                        color: prevMat.map ? 0xffffff : prevMat.color,
                        transparent: prevMat.transparent,
                        opacity: prevMat.opacity,
                        side: THREE.DoubleSide,
                        polygonOffset: true,
                        polygonOffsetFactor: 1,
                        polygonOffsetUnits: 1,
                        name: prevMat.name
                    });
                    if (newMat.map) {
                        newMat.map.anisotropy = maxAnisotropy;
                        newMat.map.minFilter  = THREE.LinearMipmapLinearFilter;
                        newMat.map.magFilter  = THREE.LinearFilter;
                    }
                    return newMat;
                });
                child.material = Array.isArray(child.material) ? newMats : newMats[0];

                newMats.forEach((mat, i) => {
                    const prevMat = prevMats[i];
                    const hasTexture = !!mat.map;
                    if (hasTexture) {
                        const texSrc = prevMat.map?.source?.uuid || prevMat.map?.uuid || prevMat.uuid;
                        if (!materialMap.has(texSrc)) {
                            materialMap.set(texSrc, {
                                name: mat.name || child.name || `Material_${materialMap.size}`,
                                material: mat,
                                meshes: [],
                                hasTexture: true,
                                originalMap: mat.map,
                                colorHex: mat.color.getHexString()
                            });
                        }
                        if (!materialMap.get(texSrc).meshes.includes(child)) materialMap.get(texSrc).meshes.push(child);
                    } else {
                        const materialKey = prevMat.uuid;
                        const colorHex = mat.color ? `#${mat.color.getHexString().toUpperCase()}` : '#CCCCCC';
                        if (!materialMap.has(materialKey)) {
                            materialMap.set(materialKey, {
                                name: mat.name || child.name || `Material_${materialMap.size}`,
                                material: mat,
                                meshes: [],
                                hasTexture: false,
                                originalMap: null,
                                isColor: true,
                                colorHex
                            });
                        }
                        if (!materialMap.get(materialKey).meshes.includes(child)) materialMap.get(materialKey).meshes.push(child);
                    }
                });
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        detectedMaterials.push(...Array.from(materialMap.values()));
        resolve({ model, detectedMaterials });

    }, onProgress, reject);
}
