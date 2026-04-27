import { UIManager } from './uiManager.js';
import { MaterialManager } from './materialManager.js';
import { ShowroomManager } from './showroomManager.js';
import { CoreEngine } from './engine.js';
import { loadModel } from './modelLoader.js';
import { escapeHtml } from './utils.js';
// Resolved via importmap in viewer.html
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

let scene, camera, renderer, controls, composer, kkcShader, fxaaPass, engine;
window.scene = scene;

let zoomVelocity = 0;
let detectedMaterials = [];
let selectedMaterialIndex = -1;
let loadedModel = null;
let modelLodUrls = null;
let activeModelQuality = null;
let activeModelUrl = null;
let switchModelQuality = null;

// Surface Highlight state
// Texture cache
const sharedTextureLoader = new THREE.TextureLoader();
const textureCache = new Map(); // url -> Promise<THREE.Texture>

/**
 * Returns a Promise that resolves to a THREE.Texture, using a global cache
 * to ensure that identical URLs share the same texture object and load process.
 */
function getTexture(url) {
    if (!url) return Promise.reject("No URL provided");
    if (textureCache.has(url)) return textureCache.get(url);

    const promise = new Promise((resolve, reject) => {
        sharedTextureLoader.load(url, (tex) => {
            // Configure texture for high quality and proper wrapping
            if (renderer) {
                tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            }
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
        }, undefined, (err) => {
            console.error(`[getTexture] Failed to load: ${url}`, err);
            textureCache.delete(url); // Don't cache failures
            reject(err);
        });
    });

    textureCache.set(url, promise);
    return promise;
}

let highlightedMesh = null;
let highlightOriginalEmissive = null;

function highlightMesh(mesh) {
    clearMeshHighlight();
    if (!mesh || !mesh.material) return;
    highlightedMesh = mesh;
    highlightOriginalEmissive = mesh.material.emissive ? mesh.material.emissive.clone() : null;
    mesh.material.emissive = new THREE.Color(0x3b82f6);
    mesh.material.emissiveIntensity = 0.15;
}

function clearMeshHighlight() {
    if (highlightedMesh && highlightedMesh.material) {
        highlightedMesh.material.emissive = highlightOriginalEmissive || new THREE.Color(0x000000);
        highlightedMesh.material.emissiveIntensity = 0;
    }
    highlightedMesh = null;
    highlightOriginalEmissive = null;
}

// Showroom state
let isShowroomMode = false;
let materialManager = null;
let showroomManager = null;
const MILKY_GRAY = 0xC8C8C8;

function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (window.innerWidth <= 800 && window.innerHeight <= 1000);
}

function toPositiveNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function getTextureDimensions(tex) {
    if (!tex || !tex.image) return { width: null, height: null };
    const img = tex.image;
    return {
        width: toPositiveNumber(img.naturalWidth || img.videoWidth || img.width),
        height: toPositiveNumber(img.naturalHeight || img.videoHeight || img.height)
    };
}

function captureOriginalUv(mesh) {
    const uv = mesh?.geometry?.attributes?.uv;
    if (!uv) return null;
    if (!mesh.userData.originalUvArray || mesh.userData.originalUvCount !== uv.count) {
        mesh.userData.originalUvArray = Array.from(uv.array);
        mesh.userData.originalUvCount = uv.count;
    }
    return mesh.userData.originalUvArray;
}

function resolveModelUrlForQuality(mode) {
    if (!modelLodUrls) return null;
    if (mode === 'low') return modelLodUrls.low || modelLodUrls.medium || modelLodUrls.high;
    if (mode === 'medium') return modelLodUrls.medium || modelLodUrls.high;
    return modelLodUrls.high;
}

// Bridge populated by setupTexturePanel so handleSingleTap (init scope) can open the picker






const statusEl   = document.getElementById('status');
const statusText = document.getElementById('status-text');
const updateStatus = (msg, state = null) => {
    if (statusEl) {
        if (statusText) statusText.innerText = msg;
        else statusEl.innerText = msg;
        statusEl.classList.toggle('error', state === 'error' || state === true);
        statusEl.classList.toggle('success', state === 'success');
        statusEl.classList.toggle('visible', msg.length > 0);
    }
};

window.setupTexturePanel = (job, room) => initMaterialManager(job, room);
function initMaterialManager(jobCode, room, options = {}) {
    window.setupTexturePanel = () => initMaterialManager(jobCode, room, options);
    // Use jobCode and room passed from main init() scope, ensuring fallback to dynamically resolved initialRoom

    materialManager = new MaterialManager({
        detectedMaterials,
        jobCode,
        room,
        isShowroomMode,
        callbacks: {
            onStatusUpdate: updateStatus,
            onHighlightMesh: highlightMesh,
            onClearHighlight: clearMeshHighlight,
            onApplyTexture: (matGroupIndex, url, urlMedium, urlLow, name, tappedMesh, replaceAll, realWidth, realHeight) => {
                const matGroup = detectedMaterials[matGroupIndex];
                const geometryCache = new Map(); // originalGeometryUUID -> { scaleU, scaleV, clonedGeometry }

                getTexture(url).then((newTex) => {
                    const targetMeshes = replaceAll ? matGroup.meshes : (tappedMesh ? [tappedMesh] : []);
                    if (targetMeshes.length === 0) return;

                    const firstMeshMaterial = targetMeshes[0] ? (Array.isArray(targetMeshes[0].material) ? targetMeshes[0].material[0] : targetMeshes[0].material) : null;
                    const prevMapDims = getTextureDimensions(firstMeshMaterial?.map);
                    const nextMapDims = getTextureDimensions(newTex);

                    const currentWidth = toPositiveNumber(matGroup.width) || prevMapDims.width;
                    const currentHeight = toPositiveNumber(matGroup.height) || prevMapDims.height;
                    const nextWidth = toPositiveNumber(realWidth) || nextMapDims.width;
                    const nextHeight = toPositiveNumber(realHeight) || nextMapDims.height;

                    targetMeshes.forEach(mesh => {
                        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                        mats.forEach(m => {
                            m.map = newTex;
                            if (m.color) m.color.setHex(0xffffff);
                            m.needsUpdate = true;

                            // Real-world scaling logic based STRICTLY on relative texture dimensions
                            if (currentWidth && currentHeight && nextWidth && nextHeight) {
                                const scaleU = currentWidth / nextWidth;
                                const scaleV = currentHeight / nextHeight;

                                if ((scaleU !== 1.0 || scaleV !== 1.0) && mesh.geometry.attributes.uv) {
                                    const originalUvArray = captureOriginalUv(mesh);
                                    const cacheKey = `${mesh.uuid}_${mesh.geometry.uuid}_${scaleU}_${scaleV}`;
                                    if (geometryCache.has(cacheKey)) {
                                        mesh.geometry = geometryCache.get(cacheKey);
                                    } else if (originalUvArray) {
                                        console.log(`[Texture Scale] Name: '${name}', Mesh: '${mesh.name || 'Unknown'}'. Scaling UVs: ${scaleU.toFixed(3)}x${scaleV.toFixed(3)}.`);
                                        mesh.geometry = mesh.geometry.clone();
                                        const newUvs = mesh.geometry.attributes.uv;
                                        for (let i = 0; i < newUvs.count; i++) {
                                            const u = originalUvArray[i * 2];
                                            const v = originalUvArray[i * 2 + 1];
                                            newUvs.setXY(i, u * scaleU, v * scaleV);
                                        }
                                        newUvs.needsUpdate = true;
                                        geometryCache.set(cacheKey, mesh.geometry);
                                    }
                                }
                            }
                        });
                    });

                    // Neutralize shared texture wrap settings once for the entire batch
                    newTex.wrapS = THREE.RepeatWrapping;
                    newTex.wrapT = THREE.RepeatWrapping;
                    newTex.repeat.set(1, 1);

                    if (replaceAll) {
                        matGroup.urlHigh = url;
                        matGroup.urlMedium = urlMedium;
                        matGroup.urlLow = urlLow;
                        if (nextWidth && nextHeight) {
                            matGroup.width = nextWidth;
                            matGroup.height = nextHeight;
                        }
                        matGroup.currentLODUrl = url;
                        matGroup.hasTexture = true;
                        matGroup.isColor = false;
                        matGroup.previewCache = null;
                    } else if (tappedMesh) {
                        matGroup.hasTexture = true;
                        matGroup.hasPartialChange = true;
                    }

                    if (name) matGroup.matchedName = name;

                    // Late render for non-looping viewer
                    if (typeof renderer !== 'undefined' && renderer && scene && camera) {
                        if (typeof composer !== 'undefined' && composer) {
                            composer.render();
                        } else {
                            renderer.render(scene, camera);
                        }
                    }
                });
            },
            onApplyColor: (matGroupIndex, hexColor, tappedMesh, replaceAll) => {
                const matGroup = detectedMaterials[matGroupIndex];
                const color = new THREE.Color(hexColor);

                if (replaceAll) {
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
                    matGroup.hasTexture = true;
                    matGroup.colorHex = hexColor;
                    matGroup.previewCache = null;
                    if (materialManager) materialManager.addRecentColor(hexColor);
                } else if (tappedMesh) {
                    const tappedMats = Array.isArray(tappedMesh.material) ? tappedMesh.material : [tappedMesh.material];
                    tappedMats.forEach(m => {
                        m.map = null;
                        if (m.color) m.color.copy(color);
                        m.needsUpdate = true;
                    });
                    matGroup.hasPartialChange = true;
                    matGroup.isColor = true;
                    matGroup.hasTexture = true;
                    matGroup.colorHex = hexColor;
                    const r = Math.round(color.r * 255);
                    const g = Math.round(color.g * 255);
                    const b = Math.round(color.b * 255);
                    matGroup.matchedName = `RGB(${r},${g},${b})`;
                    if (materialManager) materialManager.addRecentColor(hexColor);
                }

                // Late render for non-looping viewer
                if (typeof renderer !== 'undefined' && renderer && scene && camera) {
                    if (typeof composer !== 'undefined' && composer) {
                        composer.render();
                    } else {
                        renderer.render(scene, camera);
                    }
                }
            }
        }
    });

    if (!options.skipMatch && materialManager.matchAllTextures) {
        materialManager.matchAllTextures();
    }
}

function snapshotMaterialState() {
    const snapshot = new Map();
    detectedMaterials.forEach(mat => {
        if (!mat.name) return;
        snapshot.set(mat.name, {
            name: mat.name,
            hasTexture: !!mat.hasTexture,
            isColor: !!mat.isColor,
            colorHex: mat.colorHex || null,
            matchedName: mat.matchedName || null,
            originalMatchedName: mat.originalMatchedName,
            bestCategory: mat.bestCategory || null,
            similarTextures: mat.similarTextures || null,
            isHidden: !!mat.isHidden,
            hasPartialChange: !!mat.hasPartialChange,
            urlHigh: mat.urlHigh || null,
            urlMedium: mat.urlMedium || null,
            urlLow: mat.urlLow || null,
            currentLODUrl: mat.currentLODUrl || null,
            width: mat.width || null,
            height: mat.height || null
        });
    });
    return snapshot;
}

async function applyMaterialStateSnapshot(snapshot) {
    const texturePromises = [];

    detectedMaterials.forEach(mat => {
        const saved = snapshot.get(mat.name);
        if (!saved) return;

        mat.matchedName = saved.matchedName;
        mat.originalMatchedName = saved.originalMatchedName;
        mat.bestCategory = saved.bestCategory;
        mat.similarTextures = saved.similarTextures;
        mat.isHidden = saved.isHidden;
        mat.hasPartialChange = saved.hasPartialChange;
        mat.urlHigh = saved.urlHigh;
        mat.urlMedium = saved.urlMedium;
        mat.urlLow = saved.urlLow;
        mat.currentLODUrl = saved.currentLODUrl;
        mat.width = saved.width;
        mat.height = saved.height;
        mat.previewCache = null;

        if (saved.isColor && saved.colorHex) {
            const color = new THREE.Color(saved.colorHex);
            mat.isColor = true;
            mat.hasTexture = true;
            mat.colorHex = saved.colorHex;
            mat.meshes.forEach(mesh => {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach(material => {
                    material.map = null;
                    if (material.color) material.color.copy(color);
                    material.needsUpdate = true;
                });
            });
            return;
        }

        mat.isColor = false;
        mat.hasTexture = saved.hasTexture;
        const textureUrl = saved.currentLODUrl || saved.urlHigh;
        if (!textureUrl) return;

        texturePromises.push(getTexture(textureUrl).then(tex => {
            mat.meshes.forEach(mesh => {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach(material => {
                    material.map = tex;
                    if (material.color) material.color.setHex(0xffffff);
                    material.needsUpdate = true;
                });
            });
        }).catch(err => {
            console.warn('Failed to restore material texture after model quality switch:', mat.name, err);
        }));
    });

    await Promise.all(texturePromises);
}

function disposeModel(model) {
    if (!model) return;
    model.traverse(obj => {
        if (!obj.isMesh) return;
        if (obj.geometry) obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => {
            if (mat && typeof mat.dispose === 'function') mat.dispose();
        });
    });
}

function frameLoadedModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
}


async function init() {
    const uiManager = new UIManager({ isShowroomMode });
    uiManager.init();

    // Listen for light mode changes from UIManager
    window.addEventListener('lightmodechange', (e) => {
        if (typeof scene !== 'undefined' && scene) {
            scene.background = new THREE.Color(e.detail.isLightMode ? 0xdddddd : 0x1a1a1a);
            if (typeof renderer !== 'undefined' && typeof camera !== 'undefined') {
                renderer.render(scene, camera);
            }
        }
    });
    window.getScene = () => scene;
    window.getMaterials = () => detectedMaterials;

    updateStatus("Initializing 3D...");

    const urlParams = new URLSearchParams(window.location.search);
    isShowroomMode = urlParams.get('mode') === 'showroom';
    const loadPin = urlParams.get('pin');
    const jobCode    = urlParams.get('job');
    const initialRoom = urlParams.get('room');

    if (!isShowroomMode && (!jobCode || !initialRoom)) { window.location.href = '/'; return; }

    const jobDisplay = document.getElementById('job-code-display');
    const roomDisplay = document.getElementById('room-name-display');
    if (isShowroomMode) {
        if (jobDisplay) jobDisplay.textContent = 'Showroom';
        if (roomDisplay) roomDisplay.textContent = loadPin ? `PIN: ${loadPin}` : 'Custom';
    } else {
        if (jobDisplay) jobDisplay.textContent = jobCode;
        if (roomDisplay) roomDisplay.textContent = initialRoom;
    }

    // --- UI LISTENERS ---








    // --- PRODUCT TOUR ---
    (function () {
        const tourEl   = document.getElementById('product-tour');
        const tourMask = document.getElementById('tour-mask');
        const tourTip  = document.getElementById('tour-tooltip');
        const tourDots = document.getElementById('tour-step-dots');
        const tourHead = document.getElementById('tour-title');
        const tourBody = document.getElementById('tour-desc');
        const tourNext = document.getElementById('tour-next');
        const tourSkip = document.getElementById('tour-skip');
        if (!tourEl) return;

        const STEPS = [
            { target: '#menu-btn',           title: 'Project Menu',           desc: 'Switch rooms, adjust sensitivity, or log out.',                               tip: 'bottom-right' },
            { target: '#help-btn',           title: 'Help & Controls',        desc: 'Tap here anytime to see the full controls reference.',                        tip: 'bottom-left'  },
            { target: '#texture-btn',        title: 'Texture Library',        desc: 'Browse and swap materials from the KKC catalog.',                             tip: 'left'         },
            { target: '#camera-btn',         title: 'Render Photo',           desc: 'Save a high-res photo. Texture changes are logged in the watermark.',         tip: 'left'         },
            { target: '#joystick-container', title: 'Zoom Joystick',          desc: 'Drag up to zoom in, drag down to zoom out.',                                  tip: 'left'         },
            { target: null,                  title: 'Tap to Change Textures', desc: 'Tap any surface on the model to swap its texture. Choose <b>Paint Mode</b> to quickly paint multiple surfaces one by one.', tip: 'center' },
        ];

        let step = 0;

        function buildDots() {
            tourDots.innerHTML = '';
            STEPS.forEach((_, i) => {
                const d = document.createElement('div');
                d.className = 'tour-dot' + (i === step ? ' active' : '');
                tourDots.appendChild(d);
            });
        }

        function positionTooltip(rect, pos) {
            const pad = 14, tw = 268, th = 170;
            const vw = window.innerWidth, vh = window.innerHeight;
            let top, left;
            if (!rect || pos === 'center') {
                top  = vh / 2 - th / 2;
                left = vw / 2 - tw / 2;
            } else if (pos === 'bottom-right') {
                top  = rect.bottom + pad;
                left = rect.left;
            } else if (pos === 'bottom-left') {
                top  = rect.bottom + pad;
                left = Math.max(pad, rect.right - tw);
            } else if (pos === 'left') {
                top  = rect.top + rect.height / 2 - th / 2;
                left = rect.left - tw - pad;
            }
            top  = Math.max(pad, Math.min(vh - th - pad, top));
            left = Math.max(pad, Math.min(vw - tw - pad, left));
            tourTip.style.top  = top  + 'px';
            tourTip.style.left = left + 'px';
        }

        function goToStep(i) {
            step = i;
            buildDots();
            const s = STEPS[i];
            tourHead.textContent = s.title;
            tourBody.innerHTML   = s.desc;
            tourNext.textContent = i === STEPS.length - 1 ? 'Done ✓' : 'Next →';
            tourEl.classList.toggle('no-target', !s.target);

            if (s.target) {
                const el = document.querySelector(s.target);
                const r  = el ? el.getBoundingClientRect() : null;
                if (r) {
                    const p = 8;
                    tourMask.style.top    = (r.top    - p) + 'px';
                    tourMask.style.left   = (r.left   - p) + 'px';
                    tourMask.style.width  = (r.width  + p * 2) + 'px';
                    tourMask.style.height = (r.height + p * 2) + 'px';
                    positionTooltip(r, s.tip);
                }
            } else {
                positionTooltip(null, 'center');
            }
        }

        function closeTour() {
            tourEl.classList.remove('show');
            localStorage.setItem('kkc_tutorial_v1', 'true');
        }

        tourNext.addEventListener('click', () => {
            if (step < STEPS.length - 1) goToStep(step + 1);
            else closeTour();
        });
        tourSkip.addEventListener('click', closeTour);

        if (localStorage.getItem('kkc_tutorial_v1') !== 'true') {
            setTimeout(() => { goToStep(0); tourEl.classList.add('show'); }, 700);
        }
    })();

    try {
        // --- CORE ENGINE SETUP ---
        engine = new CoreEngine({
            containerId: 'canvas-container',
            isLightMode: localStorage.getItem("lightMode") === "true",
            onBeforeRender: (time) => {
                if (zoomVelocity !== 0 && camera && controls) {
                    const direction = new THREE.Vector3();
                    camera.getWorldDirection(direction);
                    const dist = camera.position.distanceTo(controls.target);
                    if (!(zoomVelocity > 0 && dist < 0.5)) {
                        camera.position.addScaledVector(direction, zoomVelocity * controls.zoomSpeed);
                    }
                }
            }
        });

        scene = engine.scene;
        camera = engine.camera;
        renderer = engine.renderer;
        controls = engine.controls;
        composer = engine.composer;
        kkcShader = engine.kkcShader;
        fxaaPass = engine.fxaaPass;
        window.scene = scene;

        // --- LOD QUALITY ---
        window.lodQualityMode = isMobileDevice() ? 'medium' : 'high';
        const lodBtnHigh = document.getElementById('lod-quality-high');
        const lodBtnMedium = document.getElementById('lod-quality-medium');
        const lodBtnLow = document.getElementById('lod-quality-low');
        const lodButtonsByMode = {
            high: lodBtnHigh,
            medium: lodBtnMedium,
            low: lodBtnLow
        };
        const setLodQualityMode = (mode) => {
            window.lodQualityMode = mode;
            Object.entries(lodButtonsByMode).forEach(([key, btn]) => {
                if (!btn) return;
                btn.classList.toggle('active', key === mode);
                btn.setAttribute('aria-pressed', key === mode ? 'true' : 'false');
            });
            if (switchModelQuality) {
                switchModelQuality(mode);
            }
        };
        if (lodBtnHigh) lodBtnHigh.onclick = () => setLodQualityMode('high');
        if (lodBtnMedium) lodBtnMedium.onclick = () => setLodQualityMode('medium');
        if (lodBtnLow) lodBtnLow.onclick = () => setLodQualityMode('low');
        setLodQualityMode(window.lodQualityMode);

        // --- SENSITIVITY SLIDER ---
        const sensSlider = document.getElementById('sens-slider');
        const sensVal    = document.getElementById('sens-val');
        if (sensSlider && sensVal) {
            sensSlider.oninput = () => {
                const v = parseFloat(sensSlider.value);
                sensVal.innerText = v.toFixed(2);
                controls.zoomSpeed = v;
                controls.rotateSpeed = v;
            };
        }

        // --- TAP DETECTION: single tap → texture picker, double tap → pivot ---
        let lastTap = 0;
        let tapPos = new THREE.Vector2();
        let singleTapTimer = null;
        let pointerDownPos = new THREE.Vector2();
        let pointerHasMoved = false;
        const DRAG_THRESHOLD = 8; // px — more than this = orbit drag, not a tap

        renderer.domElement.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch' && !e.isPrimary) return;
            pointerDownPos.set(e.clientX, e.clientY);
            pointerHasMoved = false;
        });

        renderer.domElement.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch' && !e.isPrimary) return;
            if (pointerDownPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > DRAG_THRESHOLD) {
                pointerHasMoved = true;
            }
        });

        renderer.domElement.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'touch' && !e.isPrimary) return;
            if (pointerHasMoved) return; // was a drag/orbit — ignore

            const now = Date.now();
            const dist = tapPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY));
            const isDoubleTap = (now - lastTap < 300) && (dist < 10);

            if (isDoubleTap) {
                // Cancel any pending single-tap and run pivot logic
                if (singleTapTimer) { clearTimeout(singleTapTimer); singleTapTimer = null; }
                const raycaster = new THREE.Raycaster();
                const mouse = new THREE.Vector2(
                    (e.clientX / window.innerWidth) * 2 - 1,
                    -(e.clientY / window.innerHeight) * 2 + 1
                );
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(scene.children, true);
                if (intersects.length > 0) {
                    controls.target.copy(intersects[0].point);
                    controls.update();
                }
            } else {
                // Defer single-tap 310ms so a second tap can cancel it
                const cx = e.clientX, cy = e.clientY;
                singleTapTimer = setTimeout(() => {
                    singleTapTimer = null;
                    handleSingleTap(cx, cy);
                }, 310);
            }

            lastTap = now;
            tapPos.set(e.clientX, e.clientY);
        });

        // --- SINGLE TAP: open texture picker for the tapped surface ---
        function handleSingleTap(clientX, clientY) {
            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2(
                (clientX / window.innerWidth) * 2 - 1,
                -(clientY / window.innerHeight) * 2 + 1
            );
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);
            if (!intersects.length) return;

            const tappedMesh = intersects[0].object;

            // Allow paint mode taps to pass through even if quick-picker is open
            if (materialManager && materialManager.qpPaintMode) {
                if (materialManager.handlePaintTap(tappedMesh)) {
                    return;
                }
            }

            // Don't open picker if any overlay is already visible (except we allow paint mode above)
            if (document.getElementById('quick-picker')?.classList.contains('show')) return;
            if (document.getElementById('tap-replace-sheet')?.classList.contains('show')) return;
            if (document.getElementById('texture-panel')?.classList.contains('show')) return;

            const matGroupIndex = detectedMaterials.findIndex(g => g.meshes.includes(tappedMesh));
            if (matGroupIndex < 0) return;
            const matGroup = detectedMaterials[matGroupIndex];
            if (!matGroup.hasTexture && !matGroup.isColor && !matGroup.material?.color) return;

            if (materialManager) {
                materialManager.openQuickPicker(matGroupIndex, tappedMesh);
            }
        }

        // --- ZOOM JOYSTICK ---
        const joystickHandle    = document.getElementById('joystick-handle');
        const joystickContainer = document.getElementById('joystick-container');
        let isDraggingJoystick  = false;

        const updateJoystick = (clientY) => {
            if (!isDraggingJoystick || !joystickContainer) return;
            const rect   = joystickContainer.getBoundingClientRect();
            const relY   = Math.max(0, Math.min(rect.height, clientY - rect.top));
            const center = rect.height / 2;
            const rawInput = (center - relY) / center;
            zoomVelocity = Math.sign(rawInput) * (rawInput * rawInput) * 0.05;
            if (joystickHandle) {
                joystickHandle.style.top = `${relY - 18}px`;
                const percent = Math.round(((rect.height - relY) / rect.height) * 100);
                joystickHandle.setAttribute('aria-valuenow', percent.toString());
            }
        };

        if (joystickHandle) {
            joystickHandle.onpointerdown = (e) => {
                e.preventDefault();
                e.stopPropagation();
                isDraggingJoystick = true;
                updateJoystick(e.clientY);
                joystickHandle.setPointerCapture(e.pointerId);
            };
            joystickHandle.onpointermove = (e) => { if (isDraggingJoystick) updateJoystick(e.clientY); };
            joystickHandle.onpointerup = (e) => {
                isDraggingJoystick = false;
                zoomVelocity = 0;
                if (joystickHandle) {
                    joystickHandle.style.top = (joystickContainer.offsetHeight / 2 - 18) + 'px';
                    joystickHandle.setAttribute('aria-valuenow', '50');
                }
                joystickHandle.releasePointerCapture(e.pointerId);
            };

            joystickHandle.addEventListener('keydown', (e) => {
                let v = 0;
                if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v = 0.5;
                else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v = -0.5;
                else if (e.key === 'PageUp') v = 1.0;
                else if (e.key === 'PageDown') v = -1.0;

                if (v !== 0) {
                    e.preventDefault();
                    zoomVelocity = Math.sign(v) * (v * v) * 0.05;
                    const h = joystickContainer.offsetHeight || 160;
                    const t = (h / 2) - (v * (h / 2));
                    joystickHandle.style.top = `${t - 18}px`;
                    const percent = Math.round(((h - t) / h) * 100);
                    joystickHandle.setAttribute('aria-valuenow', percent.toString());
                }
            });

            joystickHandle.addEventListener('keyup', () => {
                if (!isDraggingJoystick) {
                    zoomVelocity = 0;
                    joystickHandle.style.top = (joystickContainer.offsetHeight / 2 - 18) + 'px';
                    joystickHandle.setAttribute('aria-valuenow', '50');
                }
            });
        }
        // --- SHOWROOM MODE BRANCH ---
        if (isShowroomMode) {
            window.setupTexturePanel = () => initMaterialManager(null, null); // Expose for showroom mode

            showroomManager = new ShowroomManager({
                scene, camera, renderer, controls, composer,
                callbacks: {
                    onStatusUpdate: updateStatus,
                    onMeshesUpdated: (action, data) => {
                        if (action === 'remove') {
                            detectedMaterials = detectedMaterials.filter(m => !m.meshes.some(mesh => data.has(mesh)));
                        } else if (action === 'add') {
                            const newGroup = data;
                            const materialMap = new Map();
                            // Re-run the material grouping logic from GLTFLoader on the new meshes
                            newGroup.traverse((child) => {
                                if (!child.isMesh) return;
                                const mats = Array.isArray(child.material) ? child.material : [child.material];
                                mats.forEach(mat => {
                                    if (mat.map) {
                                        const texSrc = mat.map.uuid;
                                        if (!materialMap.has(texSrc)) {
                                            materialMap.set(texSrc, {
                                                material: mat, meshes: [], hasTexture: true,
                                                originalMap: texSrc, name: mat.name
                                            });
                                        }
                                        if (!materialMap.get(texSrc).meshes.includes(child)) materialMap.get(texSrc).meshes.push(child);
                                    } else {
                                        const colorHex = mat.color.getHexString();
                                        if (!materialMap.has(colorHex)) {
                                            materialMap.set(colorHex, {
                                                material: mat, meshes: [], hasTexture: false,
                                                originalMap: null, name: mat.name
                                            });
                                        }
                                        if (!materialMap.get(colorHex).meshes.includes(child)) materialMap.get(colorHex).meshes.push(child);
                                    }
                                });
                            });
                            // Push the newly grouped materials into detectedMaterials
                            for (const matGroup of materialMap.values()) {
                                detectedMaterials.push(matGroup);
                            }
                        }

                        // Re-initialize Material Manager
                        if (materialManager) {
                            materialManager.destroy(); // Optional if you added a cleanup method
                        }
                        initMaterialManager(null, null);

                    },
                    getDetectedMaterials: () => detectedMaterials,
                    onRefineMaterials: (config) => {
                        if (!materialManager) return;

                        const applyConfigTextures = async () => {
                            for (const mat of detectedMaterials) {
                                if (!mat.hasTexture) continue;
                                const section = mat.isIsland ? config.island : config.kitchen;
                                if (!section) continue;
                                const savedMat = section.textures[mat.name];
                                if (!savedMat) continue;

                                if (savedMat.type === 'color') {
                                    mat.meshes.forEach(m => {
                                        const mats = Array.isArray(m.material) ? m.material : [m.material];
                                        mats.forEach(material => {
                                            if (material.map) material.map = null;
                                            material.color.setHex(parseInt(savedMat.hex, 16));
                                            material.needsUpdate = true;
                                        });
                                    });
                                    mat.isColor = true;
                                    mat.colorHex = savedMat.hex;
                                    mat.hasPartialChange = true;
                                } else if (savedMat.type === 'texture' && savedMat.name) {
                                    try {
                                        const mfstResp = await fetch('/api/textures/manifest');
                                        const manifests = await mfstResp.json();
                                        const man = manifests[savedMat.category];
                                        if (man) {
                                            const texData = man.textures.find(t => t.name === savedMat.name);
                                            if (texData && texData.urlLow) {
                                                const newTex = await getTexture(texData.urlLow);

                                                mat.meshes.forEach(m => {
                                                    const mats = Array.isArray(m.material) ? m.material : [m.material];
                                                    mats.forEach(material => {
                                                        material.map = newTex;
                                                        material.color.setHex(0xffffff);
                                                        material.needsUpdate = true;
                                                    });
                                                });
                                                mat.urlHigh = texData.urlHigh;
                                                mat.urlMedium = texData.urlMedium;
                                                mat.urlLow = texData.urlLow;
                                                mat.currentLODUrl = texData.urlLow;
                                                mat.matchedName = savedMat.name;
                                                mat.isColor = false;
                                                mat.hasPartialChange = true;
                                            }
                                        }
                                    } catch(e) { console.error("Failed to load config texture", e); }
                                }
                            }
                            if (composer) composer.render();
                            else renderer.render(scene, camera);
                            initMaterialManager(null, null); // refresh UI
                        };
                        applyConfigTextures();
                    }
                }
            });
            await showroomManager.initShowroomMode(loadPin);

            engine.start();
            return; // Skip standard job loading
        }

        // --- RENDERER SETUP (Standard only, showroom handles separately) ---
        renderer.setClearColor(0x111111);

        const response = await fetch(`/api/job/${encodeURIComponent(jobCode)}`);
        const data = await response.json();
        if (data.success && data.rooms.length > 1) {
            const switcher = document.getElementById('room-switcher');
            const listUi   = document.getElementById('room-list-ui');
            if (switcher && listUi) {
                switcher.style.display = 'block';
                data.rooms.forEach(r => {
                    const btn = document.createElement('button');
                    btn.innerText = r;
                    btn.className = 'room-switcher-btn';
                    btn.style.cssText = `padding:10px; border-radius:8px; border:1px solid #ddd; cursor:pointer; background:${r === initialRoom ? '#007bff' : '#fff'}; color:${r === initialRoom ? '#fff' : '#000'}; margin-bottom:5px; width:100%; text-align:left; font-weight:bold;`;
                    btn.onclick = () => { window.location.href = `/viewer.html?job=${encodeURIComponent(jobCode)}&room=${encodeURIComponent(r)}`; };
                    listUi.appendChild(btn);
                });
            }
        }

        const urlRes  = await fetch(`/api/job/${encodeURIComponent(jobCode)}/${encodeURIComponent(initialRoom)}`);
        const urlData = await urlRes.json();
        if (!urlData.success) throw new Error("Room URL not found");

        const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
        modelLodUrls = {
            high: urlData.urlHigh || urlData.url,
            medium: urlData.urlMedium || null,
            low: urlData.urlLow || null
        };

        const loadRoomModel = async (quality, options = {}) => {
            const targetUrl = resolveModelUrlForQuality(quality);
            if (!targetUrl) throw new Error("Model URL not found");
            if (activeModelUrl === targetUrl && loadedModel) {
                activeModelQuality = quality;
                return;
            }

            const snapshot = options.preserveMaterials ? snapshotMaterialState() : null;
            updateStatus(`Loading ${quality.charAt(0).toUpperCase() + quality.slice(1)} Model...`);

            const { model, detectedMaterials: parsedMaterials } = await loadModel(
                targetUrl,
                maxAnisotropy,
                (xhr) => {
                    if (xhr.lengthComputable) {
                        const p = Math.round((xhr.loaded / xhr.total) * 100);
                        updateStatus(`Downloading: ${p}%`);
                    }
                }
            );

            if (loadedModel) {
                scene.remove(loadedModel);
                disposeModel(loadedModel);
            }

            loadedModel = model;
            detectedMaterials = parsedMaterials;
            scene.add(loadedModel);
            activeModelUrl = targetUrl;
            activeModelQuality = quality;

            if (options.frameModel) {
                frameLoadedModel(loadedModel);
            }

            if (snapshot) {
                await applyMaterialStateSnapshot(snapshot);
            }

            initMaterialManager(jobCode, initialRoom, { skipMatch: !!snapshot });

            if (typeof composer !== 'undefined' && composer) composer.render();
            else renderer.render(scene, camera);

            updateStatus("");
        };

        switchModelQuality = async (quality) => {
            try {
                await loadRoomModel(quality, { preserveMaterials: true, frameModel: false });
            } catch (e) {
                console.error(e);
                updateStatus("Model quality switch failed", true);
                setTimeout(() => updateStatus(""), 3000);
            }
        };

        // --- PHOTO RENDER ---
        const cameraBtn = document.getElementById('camera-btn');
        if (cameraBtn) {
            cameraBtn.onclick = async () => {
                updateStatus("Enhancing Textures...");

                // Force high-res textures before rendering
                window.forceHighResRender = true;
                const loadPromises = [];

                detectedMaterials.forEach(matGroup => {
                    if (matGroup.hasTexture && !matGroup.isColor && matGroup.urlHigh && matGroup.currentLODUrl !== matGroup.urlHigh) {
                        const p = getTexture(matGroup.urlHigh).then(tex => {
                            matGroup.meshes.forEach(m => {
                                m.material.map = tex;
                                m.material.needsUpdate = true;
                            });
                            matGroup.currentLODUrl = matGroup.urlHigh;
                        }).catch(err => {
                            console.warn("LOD upgrade failed for photo:", matGroup.urlHigh);
                        });
                        loadPromises.push(p);
                    }
                });

                await Promise.all(loadPromises);
                updateStatus("Rendering Photo...");

                // Save original state
                const origWidth = window.innerWidth;
                const origHeight = window.innerHeight;
                const origDpr = renderer.getPixelRatio();
                const origAspect = camera.aspect;

                // Resolution logic: Native for mobile (safer), 4K for PC
                const isMobile = isMobileDevice();
                const targetWidth = isMobile ? Math.min(window.innerWidth * window.devicePixelRatio, 3000) : 3840;
                const targetHeight = Math.round(targetWidth / origAspect);
                
                // Set new resolution
                engine.setResolution(targetWidth, targetHeight, 1);

                // Render frame
                composer.render();
                
                // CRITICAL: Flush GPU commands to ensure the buffer is populated before capture
                const gl = renderer.getContext();
                gl.flush();
                gl.finish(); // Hard sync for mobile stability

                // Create offscreen canvas to combine render + logo + text
                const canvas2d = document.createElement('canvas');
                canvas2d.width = targetWidth;
                canvas2d.height = targetHeight;
                const ctx = canvas2d.getContext('2d');

                // Draw WebGL render synchronously immediately after render
                ctx.drawImage(renderer.domElement, 0, 0, targetWidth, targetHeight);

                // Restore original state immediately to prevent flicker
                engine.setResolution(origWidth, origHeight, origDpr);
                composer.render();

                // Try to load and draw logo onto the saved 2D canvas
                let logoImg = null;
                try {
                    logoImg = new Image();
                    logoImg.src = '/images/kkc_logo.jpg';
                    await new Promise((resolve, reject) => {
                        logoImg.onload = resolve;
                        logoImg.onerror = reject;
                    });
                } catch (err) {
                    console.error("Failed to load logo for photo export", err);
                }

                if (logoImg) {
                    // Base scale on 4K (3840), but reduce further if on mobile to ensure fit
                    let logoScale = targetWidth / 3840;
                    if (isMobile) logoScale *= 0.8; // Make slightly smaller on mobile

                    const logoWidth = 400 * logoScale;
                    const logoHeight = (logoImg.height / logoImg.width) * logoWidth;
                    const padding = 60 * logoScale;
                    const logoX = padding;

                    // Build texture change lines
                    const changeLines = [];
                    for (const mat of detectedMaterials) {
                        if (!mat.hasTexture || mat.isHidden) continue;
                        if (isShowroomMode) {
                            // In showroom mode, list all applied textures/colors
                            if (mat.matchedName) {
                                const section = mat.isIsland ? '[ISLAND] ' : '';
                                changeLines.push(`${section}${mat.name}: ${mat.matchedName}`);
                            }
                        } else {
                            const orig = mat.originalMatchedName;
                            const curr = mat.matchedName;
                            if (!orig || !curr || orig === curr) continue;
                            const prefix = mat.hasPartialChange ? 'PARTIAL ' : '';
                            changeLines.push(`${prefix}${orig} \u21c4 ${curr}`);
                        }
                    }

                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = Math.max(2, 4 * logoScale);
                    ctx.textBaseline = 'bottom';

                    const fontSize = Math.round(80 * logoScale);
                    const changeFontSize = Math.round(55 * logoScale);
                    const changeLineHeight = Math.round(68 * logoScale);

                    // Shift main text up to make room for change lines
                    const textX = logoX + logoWidth + (20 * logoScale);
                    const textY = targetHeight - padding - (changeLines.length * changeLineHeight);

                    const logoY = targetHeight - logoHeight - padding;
                    ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);

                    // Draw main job/room line
                    ctx.font = `bold ${fontSize}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
                    const textContent = isShowroomMode
                        ? `Showroom${showroomPin ? ` | PIN: ${showroomPin}` : ''}`
                        : `Job: ${jobCode} | Room: ${initialRoom}`;
                    const metrics = ctx.measureText(textContent);
                    if (textX + metrics.width > targetWidth - padding) {
                        const maxTextWidth = targetWidth - textX - padding;
                        const scaleFactor = maxTextWidth / metrics.width;
                        ctx.font = `bold ${Math.floor(fontSize * scaleFactor)}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
                    }
                    ctx.strokeText(textContent, textX, textY);
                    ctx.fillText(textContent, textX, textY);

                    // Draw texture change lines below
                    if (changeLines.length > 0) {
                        ctx.font = `${changeFontSize}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
                        ctx.lineWidth = Math.max(1, 3 * logoScale);
                        changeLines.forEach((line, i) => {
                            const lineY = textY + (i + 1) * changeLineHeight;
                            ctx.strokeText(line, textX, lineY);
                            ctx.fillStyle = 'rgba(220,230,255,0.95)';
                            ctx.fillText(line, textX, lineY);
                            ctx.fillStyle = 'white';
                        });
                    }
                }

                const dataUrl = canvas2d.toDataURL('image/jpeg', 0.92);
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = isShowroomMode
                    ? `KKC_Showroom${showroomPin ? `_${showroomPin}` : ''}.jpg`
                    : `KKC_${jobCode}_${initialRoom.replace(/ /g, '_')}.jpg`;
                a.click();

                // Trigger flash delight
                const flash = document.getElementById('camera-flash');
                if (flash) {
                    flash.classList.remove('active');
                    void flash.offsetWidth; // trigger reflow
                    flash.classList.add('active');
                }

                updateStatus("Photo Saved", "success");
                setTimeout(() => updateStatus(""), 3000);

                // Restore dynamic LOD
                window.forceHighResRender = false;
            };
        }

        // --- LOAD MODEL ---
        await loadRoomModel(window.lodQualityMode || 'high', { preserveMaterials: false, frameModel: true });

        // Force a single final re-render now that the model is fully added and textures are async loading
        setTimeout(() => {
            if (typeof renderer !== 'undefined' && renderer && scene && camera) {
                scene.traverse((obj) => {
                    if (obj.isMesh && obj.material) {
                        obj.material.needsUpdate = true;
                    }
                });
                if (typeof composer !== 'undefined' && composer) {
                    console.log('✅ FINAL FORCING RE-RENDER WITH COMPOSER AFTER MODEL LOAD');
                    composer.render();
                } else {
                    renderer.render(scene, camera);
                }
            }
        }, 100);

    } catch (e) {
        console.error(e);
        updateStatus("Connection Error", true);
    }

    engine.start();
}

// ================================================================
// SHOWROOM MODE
// ================================================================


if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();


