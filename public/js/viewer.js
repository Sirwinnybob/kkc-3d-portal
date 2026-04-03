import { UIManager } from './uiManager.js';
import { MaterialManager } from './materialManager.js';
// Resolved via importmap in viewer.html
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let scene, camera, renderer, controls, composer, kkcShader, fxaaPass;
window.scene = scene;

let zoomVelocity = 0;
let detectedMaterials = [];
let selectedMaterialIndex = -1;
let loadedModel = null;

// Surface Highlight state
// LOD cache and tracking
const textureCache = new Map(); // url -> THREE.Texture
const _lodVec = new THREE.Vector3();
let lastLodCheckTime = 0;

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
let showroomPin = null;
let showroomCategories = {};
let showroomParts = {};       // { category: { group, style, file, tagData } }
let kitchenMaterials = [];
let islandMaterials = [];
let kitchenStyle = 'face_frame';
let overlayStyle = 'full';
let islandOverlayStyle = 'full';
let islandStyle = 'face_frame';
const MILKY_GRAY = 0xC8C8C8;

// Bridge populated by setupTexturePanel so handleSingleTap (init scope) can open the picker


const SETTINGS = {
    exposure:      1.15,
    saturation:    0.65,
    contrast:      1.50,
    lightIntensity: 1.0,
    gloss:         0.10,
    colorTemp:     0.5
};

const KKCShader = {
    uniforms: {
        "tDiffuse":    { value: null },
        "uExposure":   { value: SETTINGS.exposure },
        "uSaturation": { value: SETTINGS.saturation },
        "uContrast":   { value: SETTINGS.contrast },
        "uColorTemp":  { value: SETTINGS.colorTemp }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float uExposure;
        uniform float uSaturation;
        uniform float uContrast;
        uniform float uColorTemp;
        varying vec2 vUv;

        void main() {
            vec4 tex = texture2D(tDiffuse, vUv);
            vec3 color = tex.rgb * uExposure;
            float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luma), color, uSaturation);
            
            // Shadow lift: prevents dark textures from crushing to black at steep angles
            color = color * 0.92 + 0.08;
            // Smooth Contrast Curve
            color = smoothstep(0.5 - (0.5 / uContrast), 0.5 + (0.5 / uContrast), color);
            
            vec3 warm    = vec3(1.0, 0.9, 0.8);
            vec3 neutral = vec3(1.0, 1.0, 1.0);
            vec3 cool    = vec3(0.8, 0.9, 1.0);
            vec3 tempTint;
            if (uColorTemp < 0.5) {
                tempTint = mix(warm, neutral, uColorTemp * 2.0);
            } else {
                tempTint = mix(neutral, cool, (uColorTemp - 0.5) * 2.0);
            }
            color *= tempTint;
            gl_FragColor = vec4(color, tex.a);
        }
    `
};

const statusEl   = document.getElementById('status');
const statusText = document.getElementById('status-text');
const updateStatus = (msg, isError = false) => {
    if (statusEl) {
        if (statusText) statusText.innerText = msg;
        else statusEl.innerText = msg;
        statusEl.classList.toggle('error', isError);
        statusEl.classList.toggle('visible', msg.length > 0);
    }
};

function initMaterialManager(jobCode, room) {
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
            onApplyTexture: (matGroupIndex, url, urlMedium, urlLow, name, tappedMesh, replaceAll) => {
                const matGroup = detectedMaterials[matGroupIndex];
                const texLoader = new THREE.TextureLoader();
                texLoader.load(url, (newTex) => {
                    newTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
                    newTex.minFilter = THREE.LinearMipmapLinearFilter;
                    newTex.magFilter = THREE.LinearFilter;
                    newTex.wrapS = THREE.RepeatWrapping;
                    newTex.wrapT = THREE.RepeatWrapping;

                    if (replaceAll) {
                        matGroup.meshes.forEach(mesh => {
                            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                            mats.forEach(m => {
                                m.map = newTex;
                                if (m.color) m.color.setHex(0xffffff);
                                m.needsUpdate = true;
                            });
                        });
                        matGroup.urlHigh = url;
                        matGroup.urlMedium = urlMedium;
                        matGroup.urlLow = urlLow;
                        matGroup.currentLODUrl = url;
                        matGroup.previewCache = null;
                    } else if (tappedMesh) {
                        const tappedMats = Array.isArray(tappedMesh.material) ? tappedMesh.material : [tappedMesh.material];
                        tappedMats.forEach(m => {
                            m.map = newTex;
                            if (m.color) m.color.setHex(0xffffff);
                            m.needsUpdate = true;
                        });
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

    if (materialManager.matchAllTextures) {
        materialManager.matchAllTextures();
    }
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
        // --- THREE.JS SETUP (shared by standard and showroom modes) ---
        scene = new THREE.Scene(); window.scene = scene;         const isLightMode = localStorage.getItem("lightMode") === "true";
        scene.background = new THREE.Color(isLightMode ? 0xf0f0f0 : 0x111111);
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 5000);

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
        const dpr = Math.min(window.devicePixelRatio, 2);
        renderer.setPixelRatio(dpr);
        renderer.setSize(window.innerWidth, window.innerHeight);

        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) {
            canvasContainer.appendChild(renderer.domElement);
            renderer.domElement.id = 'main-canvas';
            renderer.domElement.setAttribute('tabindex', '0');
            renderer.domElement.setAttribute('aria-label', '3D Model Viewer. Use arrow keys to rotate, shift + arrow keys to pan, and plus or minus keys to zoom.');
        }

        scene.add(camera);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.listenToKeyEvents(window);
        controls.enableDamping = true;
        controls.dampingFactor = 0.25;

        // --- LIGHTING ---
        const li = SETTINGS.lightIntensity;
        scene.add(new THREE.AmbientLight(0xffffff, li * 1.2));
        const makeCamLight = (intensity, px, py, pz) => {
            const light  = new THREE.DirectionalLight(0xffffff, intensity);
            const target = new THREE.Object3D();
            light.position.set(px, py, pz);
            camera.add(light);
            camera.add(target);
            light.target = target;
        };
        makeCamLight(li * 0.5,  1,  1,  1);
        const makeSceneLight = (intensity, px, py, pz) => {
            const light = new THREE.DirectionalLight(0xffffff, intensity);
            light.position.set(px, py, pz);
            scene.add(light);
        };
        makeSceneLight(li * 0.22,  2,  1,  0);
        makeSceneLight(li * 0.22, -2,  1,  0);
        makeSceneLight(li * 0.22,  0,  1,  2);
        makeSceneLight(li * 0.22,  0,  1, -2);
        makeSceneLight(li * 0.2,   0, -1,  0);

        // --- POST-PROCESSING ---
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        kkcShader = new ShaderPass(KKCShader);
        composer.addPass(kkcShader);
        fxaaPass = new ShaderPass(FXAAShader);
        fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * dpr);
        fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * dpr);
        composer.addPass(fxaaPass);
        const outputPass = new OutputPass();
        composer.addPass(outputPass);

        // --- LOD THRESHOLDS ---
        window.lodHighThreshold = 500;
        window.lodMediumThreshold = 2000;
        const lodHighSlider = document.getElementById('lod-high-slider');
        const lodHighVal    = document.getElementById('lod-high-val');
        const lodMediumSlider = document.getElementById('lod-medium-slider');
        const lodMediumVal  = document.getElementById('lod-medium-val');

        if (lodHighSlider && lodHighVal) {
            lodHighSlider.oninput = () => {
                const v = parseInt(lodHighSlider.value);
                lodHighVal.innerText = v;
                window.lodHighThreshold = v;
            };
        }
        if (lodMediumSlider && lodMediumVal) {
            lodMediumSlider.oninput = () => {
                const v = parseInt(lodMediumSlider.value);
                lodMediumVal.innerText = v;
                window.lodMediumThreshold = v;
            };
        }

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

        // --- SHOWROOM MODE BRANCH ---
        if (isShowroomMode) {
            window.setupTexturePanel = () => initMaterialManager(null, null); // Expose for showroom mode
            await initShowroomMode(loadPin);
            window.addEventListener('resize', onWindowResize);
            animate();
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
            if (!detectedMaterials[matGroupIndex].hasTexture) return;

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
            if (joystickHandle) joystickHandle.style.top = `${relY - 18}px`;
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
                if (joystickHandle) joystickHandle.style.top = (joystickContainer.offsetHeight / 2 - 18) + 'px';
                joystickHandle.releasePointerCapture(e.pointerId);
            };
        }

        // --- PHOTO RENDER ---
        const cameraBtn = document.getElementById('camera-btn');
        if (cameraBtn) {
            cameraBtn.onclick = async () => {
                updateStatus("Enhancing Textures...");

                // Force high-res textures before rendering
                window.forceHighResRender = true;
                const loadPromises = [];
                const texLoader = new THREE.TextureLoader();

                detectedMaterials.forEach(matGroup => {
                    if (matGroup.hasTexture && !matGroup.isColor && matGroup.urlHigh && matGroup.currentLODUrl !== matGroup.urlHigh) {
                        loadPromises.push(new Promise(resolve => {
                            if (textureCache.has(matGroup.urlHigh)) {
                                const tex = textureCache.get(matGroup.urlHigh);
                                matGroup.meshes.forEach(m => { m.material.map = tex; m.material.needsUpdate = true; });
                                matGroup.currentLODUrl = matGroup.urlHigh;
                                resolve();
                            } else {
                                texLoader.load(matGroup.urlHigh, (tex) => {
                                    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
                                    tex.minFilter  = THREE.LinearMipmapLinearFilter;
                                    tex.magFilter  = THREE.LinearFilter;
                                    tex.wrapS      = THREE.RepeatWrapping;
                                    tex.wrapT      = THREE.RepeatWrapping;
                                    textureCache.set(matGroup.urlHigh, tex);
                                    matGroup.meshes.forEach(m => { m.material.map = tex; m.material.needsUpdate = true; });
                                    matGroup.currentLODUrl = matGroup.urlHigh;
                                    resolve();
                                }, undefined, resolve); // resolve on error to not block render
                            }
                        }));
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
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 800 && window.innerHeight <= 1000);
                const targetWidth = isMobile ? Math.min(window.innerWidth * window.devicePixelRatio, 3000) : 3840;
                const targetHeight = Math.round(targetWidth / origAspect);
                
                // Set new resolution
                renderer.setPixelRatio(1);
                renderer.setSize(targetWidth, targetHeight, false);
                composer.setSize(targetWidth, targetHeight);
                camera.aspect = targetWidth / targetHeight;
                camera.updateProjectionMatrix();

                if (fxaaPass) {
                    fxaaPass.material.uniforms['resolution'].value.x = 1 / targetWidth;
                    fxaaPass.material.uniforms['resolution'].value.y = 1 / targetHeight;
                }

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
                renderer.setPixelRatio(origDpr);
                renderer.setSize(origWidth, origHeight);
                composer.setSize(origWidth, origHeight);
                camera.aspect = origAspect;
                camera.updateProjectionMatrix();

                if (fxaaPass) {
                    fxaaPass.material.uniforms['resolution'].value.x = 1 / (origWidth * origDpr);
                    fxaaPass.material.uniforms['resolution'].value.y = 1 / (origHeight * origDpr);
                }
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

                updateStatus("Photo Saved");
                setTimeout(() => updateStatus(""), 3000);

                // Restore dynamic LOD
                window.forceHighResRender = false;
                lastLodCheckTime = 0; // force immediate check
            };
        }

        // --- LOAD MODEL ---
        updateStatus("Loading Design...");
                const isObj = urlData.url.toLowerCase().endsWith('.obj');

        if (isObj) {
            const mtlUrl = urlData.url.substring(0, urlData.url.lastIndexOf('.')) + '.mtl';
            const mtlDir = mtlUrl.substring(0, mtlUrl.lastIndexOf('/') + 1);

            // Set up a LoadingManager to sanitize material URLs from SketchUp
            const manager = new THREE.LoadingManager();
            manager.setURLModifier((url) => {
                console.error("URLModifier input:", url);
                // Ignore data URIs or already-resolved URLs
                if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) {
                    console.error("URLModifier skipped:", url);
                    return url;
                }

                // Fix Windows backslashes sometimes exported by SketchUp
                let cleanUrl = url.replace(/\\/g, '/');

                // Encode hash characters (#) so they aren't parsed as URL fragments
                cleanUrl = cleanUrl.replace(/#/g, '%23');
                cleanUrl = cleanUrl.replace(/\?/g, '%3F');

                console.error("URLModifier output:", cleanUrl);
                return cleanUrl;
            });

            manager.onError = function ( url ) {
                console.error( 'There was an error loading ' + url );
            };

            const mtlLoader = new MTLLoader(manager);
            // Crucial: Set resource path so textures resolve relative to the .mtl folder
            mtlLoader.setResourcePath(mtlDir);

            mtlLoader.load(mtlUrl, function(materials) {
                // Manually parse materials to ensure textures are mapped
                console.error("Manual MTL Parse Check");
                for (const matName in materials.materialsInfo) {
                    const info = materials.materialsInfo[matName];
                    if (info.map_kd) {
                        const texUrl = mtlDir + info.map_kd;
                        console.error(`Material ${matName} has map_kd: ${info.map_kd} -> loading manually from ${texUrl}`);

                        // We must create the material first if not exists
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
                                console.log(`✅ TEXTURE FULLY LOADED: ${texUrl}`);
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

                console.error("MTL loaded!");
                materials.preload();
                console.error("MTL materials created:", Object.keys(materials.materials));
                Object.values(materials.materials).forEach(m => {
                    console.error("MTL material name:", m.name, "Has map:", !!m.map);
                    if (m.map) {
                        console.error("Map src:", m.map.image ? m.map.image.src : m.map.name);
                    }
                });
                materials.preload();
                const objLoader = new OBJLoader(manager);
                objLoader.setMaterials(materials);

                const fileLoader = new THREE.FileLoader(manager);
                fileLoader.load(urlData.url, function(text) {
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

                    console.error("==== MTL DUMP ====");
                    console.error("materialsInfo: ", JSON.stringify(materials.materialsInfo));

                    const obj = objLoader.parse(text);
                    // Apply SketchUp rotation fix and scale
                    // // obj.rotation.x = -Math.PI / 2; // Assuming Y is up // Assuming Y is up
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);

                    const model = obj;

                    console.error("====== PARSED OBJ ======");
                    model.traverse(child => {
                        if (child.isMesh && child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(m => {
                                    if (m.map) console.error("Found map on " + child.name + " -> " + m.name + ": " + (m.map.image ? m.map.image.src : 'no image object'));
                                });
                            } else {
                                if (child.material.map) console.error("Found map on " + child.name + " -> " + child.material.name + ": " + (child.material.map.image ? child.material.map.image.src : 'no image object'));
                            }
                        }
                    });
                    loadedModel = model;
                    detectedMaterials = [];
                    const materialMap = new Map();

                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;

                            // Ensure UVs exist, otherwise textures won't render
                            if (!child.geometry.attributes.uv) {
                                console.warn("No UV map on " + child.name);
                            }

                            // Keep the material created by MTLLoader, but adjust properties
                            const mats = Array.isArray(child.material) ? child.material : [child.material];

                            mats.forEach(mat => {
                                mat.side = THREE.DoubleSide;
                                mat.polygonOffset = true;
                                mat.polygonOffsetFactor = 1;
                                mat.polygonOffsetUnits = 1;

                                // MTL files often use map_Kd, which becomes map
                                // Or map_Ka, which becomes map, etc.
                                // If it has a map, enforce white base color.
                                if (mat.map) {
                                    // SketchUp MTLs often set dark Kd values which multiply with the texture map,
                                    // making them look black/blank. Force the diffuse color to pure white.
                                    mat.color.setHex(0xffffff);
                                    mat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                                    mat.map.minFilter  = THREE.LinearMipmapLinearFilter;
                                    mat.map.magFilter  = THREE.LinearFilter;
                                    // Also clear any emission/specular darkening to be safe
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
                        const colorHex = prevMat.uuid; // precise UUID instead of flat color grouping
                        if (!materialMap.has(colorHex)) {
                                        materialMap.set(colorHex, { material: mat, meshes: [], name: mat.name || 'OBJ Material', hasTexture: false, originalMap: null });
                                    }
                                if (!materialMap.get(colorHex).meshes.includes(child)) materialMap.get(colorHex).meshes.push(child);
                                }
                            });
                        }
                    });

                    // Finish processing materials
                    detectedMaterials = Array.from(materialMap.values());
                    initMaterialManager(jobCode, initialRoom);

                    scene.add(model);
                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
                    camera.lookAt(center);
                    controls.target.copy(center);
                    controls.update();
                    updateStatus("");

                    // DEBUG LOGGING
                    let report = "\n==== DEBUG MATERIAL REPORT ====\n";
                    model.traverse(child => {
                        if (child.isMesh) {
                            report += `Mesh: ${child.name}\n`;
                            report += `  Has UVs: ${child.geometry.attributes.uv !== undefined}\n`;
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            mats.forEach(m => {
                                report += `  Material: ${m.name}\n`;
                                report += `    Has Map: ${!!m.map}\n`;
                                report += `    Color: #${m.color.getHexString()}\n`;
                                if (m.map) {
                                    report += `    ColorSpace: ${m.map.colorSpace}\n`;
                                    if (m.map.image) {
                                        report += `    Image Src: ${m.map.image.src}\n`;
                                    }
                                }
                            });
                        }
                    });
                    console.log(report);

                    // Force a single final re-render now that the model is fully added and textures are async loading
                    setTimeout(() => {
                        if (typeof renderer !== 'undefined' && renderer && scene && camera) {
                            scene.traverse((obj) => {
                                if (obj.isMesh && obj.material) {
                                    obj.material.needsUpdate = true;
                                }
                            });
                            if (typeof composer !== 'undefined' && composer) {
                                console.log('✅ FINAL FORCING RE-RENDER WITH COMPOSER AFTER OBJ LOAD');
                                composer.render();
                            } else {
                                renderer.render(scene, camera);
                            }
                        }
                    }, 100);
                });
            }, undefined, function(err) {
                console.warn('MTL load failed, loading OBJ without materials:', err);
                const objLoader = new OBJLoader(manager);
                const fileLoader = new THREE.FileLoader(manager);
                fileLoader.load(urlData.url, function(text) {
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

                    console.error("==== MTL DUMP ====");
                    console.error("materialsInfo: ", JSON.stringify(materials.materialsInfo));

                    const obj = objLoader.parse(text);
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);

                    const model = obj;
                    loadedModel = model;
                    detectedMaterials = [];
                    const materialMap = new Map();

                    model.traverse((child) => {
                        if (child.isMesh) {
                            child.castShadow = true;
                            child.receiveShadow = true;
                            child.material = new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide });
                        }
                    });

                    scene.add(model);
                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
                    camera.lookAt(center);
                    controls.target.copy(center);
                    controls.update();
                    updateStatus("");

                    // DEBUG LOGGING
                    let report = "\n==== DEBUG MATERIAL REPORT ====\n";
                    model.traverse(child => {
                        if (child.isMesh) {
                            report += `Mesh: ${child.name}\n`;
                            report += `  Has UVs: ${child.geometry.attributes.uv !== undefined}\n`;
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            mats.forEach(m => {
                                report += `  Material: ${m.name}\n`;
                                report += `    Has Map: ${!!m.map}\n`;
                                report += `    Color: #${m.color.getHexString()}\n`;
                                if (m.map) {
                                    report += `    ColorSpace: ${m.map.colorSpace}\n`;
                                    if (m.map.image) {
                                        report += `    Image Src: ${m.map.image.src}\n`;
                                    }
                                }
                            });
                        }
                    });
                    console.log(report);
                });
            });
        } else {
            const loader = new GLTFLoader();
        loader.load(urlData.url, (gltf) => {
            const model = gltf.scene;
            loadedModel = model;
            detectedMaterials = [];

            // Track unique materials to avoid listing every face
            const materialMap = new Map(); // texSrc -> { material, meshes[], name, hasTexture, originalMap }

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
                            newMat.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
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
                            const colorHex = prevMat.uuid; // Use UUID for colors too, to ensure precise grouping per material
                            if (!materialMap.has(colorHex)) {
                                materialMap.set(colorHex, {
                                    name: mat.name || child.name || `Material_${materialMap.size}`,
                                    material: mat,
                                    meshes: [],
                                    hasTexture: false,
                                    originalMap: null,
                                    colorHex: colorHex
                                });
                            }
                            if (!materialMap.get(colorHex).meshes.includes(child)) materialMap.get(colorHex).meshes.push(child);
                        }
                    });
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Convert map to array
            detectedMaterials = Array.from(materialMap.values());
            scene.add(model);
            const box    = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            const size   = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
            camera.lookAt(center);
            controls.target.copy(center);
            controls.update();
            updateStatus("");

            // Setup texture panel and start matching
            initMaterialManager(jobCode, initialRoom);

        }, (xhr) => {
            if (xhr.lengthComputable) {
                const p = Math.round((xhr.loaded / xhr.total) * 100);
                updateStatus(`Downloading: ${p}%`);
            }
        });
        } // Close else block

    } catch (e) {
        console.error(e);
        updateStatus("Connection Error", true);
    }

    window.addEventListener('resize', onWindowResize);
    animate();
}

// ================================================================
// SHOWROOM MODE
// ================================================================

async function initShowroomMode(pinToLoad) {
    updateStatus('Loading Showroom...');

    // Show showroom-specific UI
    const showroomBtn = document.getElementById('showroom-btn');
    const saveConfigBtn = document.getElementById('save-config-btn');
    const showroomPanel = document.getElementById('showroom-panel');
    if (showroomBtn) showroomBtn.style.display = '';
    if (saveConfigBtn) saveConfigBtn.style.display = '';

    // Hide job-specific UI (room switcher)
    const roomSwitcher = document.getElementById('room-switcher');
    if (roomSwitcher) roomSwitcher.style.display = 'none';

    // Ensure inline display:none from HTML is removed so .show (display:flex) works
    if (showroomPanel) showroomPanel.style.display = '';

    // Toggle showroom panel
    if (showroomBtn) {
        showroomBtn.onclick = () => {
            showroomPanel.classList.toggle('show');
            const isVisible = showroomPanel.classList.contains('show');
            showroomBtn.setAttribute('aria-expanded', isVisible.toString());
            if (isVisible) {
                const panelClose = document.getElementById('showroom-panel-close');
                if (panelClose) panelClose.focus();
            }
        };
    }
    const panelClose = document.getElementById('showroom-panel-close');
    if (panelClose) panelClose.onclick = () => {
        showroomPanel.classList.remove('show');
        if (showroomBtn) showroomBtn.focus();
    };

    // Fetch showroom categories
    try {
        const resp = await fetch('/api/showroom/categories');
        const data = await resp.json();
        if (data.success) showroomCategories = data.categories;
    } catch (e) {
        updateStatus('Failed to load showroom data', true);
        return;
    }

    // Setup style toggles
    setupStyleToggle('kitchen-style-toggle', (style) => {
        kitchenStyle = style;
        populateKitchenParts();
    });
    setupStyleToggle('island-style-toggle', (style) => {
        islandStyle = style;
        populateIslandParts();
    });
    // Setup overlay toggles
    setupStyleToggle('overlay-toggle', (style) => {
        overlayStyle = style;
        populateKitchenParts();
    });
    setupStyleToggle('island-overlay-toggle', (style) => {
        islandOverlayStyle = style;
        populateIslandParts();
    });


    // Populate initial parts
    await Promise.all([
        populateKitchenParts(),
        populateIslandParts()
    ]);

    if (!pinToLoad) {
        reframeShowroomCamera();
    }

    // Setup save config button
    if (saveConfigBtn) saveConfigBtn.onclick = saveShowroomConfig;

    // PIN modal close
    const pinModalClose = document.getElementById('pin-modal-close');
    if (pinModalClose) pinModalClose.onclick = () => {
        document.getElementById('pin-modal').classList.remove('show');
        if (saveConfigBtn) saveConfigBtn.focus();
    };

    // PIN Copy Button
    const copyPinBtn = document.getElementById('copy-pin-btn');
    const pinDisplay = document.getElementById('pin-display');
    if (copyPinBtn && pinDisplay) {
        const originalSvg = copyPinBtn.innerHTML;
        let copyTimeout = null;

        copyPinBtn.onclick = () => {
            const pin = pinDisplay.textContent;
            navigator.clipboard.writeText(pin).then(() => {
                if (copyTimeout) clearTimeout(copyTimeout);
                copyPinBtn.classList.add('copied');
                copyPinBtn.setAttribute('aria-label', 'PIN Copied!');
                copyPinBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                `;
                copyTimeout = setTimeout(() => {
                    copyPinBtn.classList.remove('copied');
                    copyPinBtn.setAttribute('aria-label', 'Copy PIN');
                    copyPinBtn.innerHTML = originalSvg;
                    copyTimeout = null;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy PIN:', err);
            });
        };
    }

    // Setup texture panel for showroom (reuse existing)
    initMaterialManager(jobCode, initialRoom);

    // Load from PIN if provided
    if (pinToLoad) {
        await loadShowroomConfig(pinToLoad);
    } else {
        // Open showroom panel by default
        showroomPanel.classList.add('show');
    }

    updateStatus('');
}

function setupStyleToggle(elementId, onChange) {
    const toggle = document.getElementById(elementId);
    if (!toggle) return;
    const buttons = toggle.querySelectorAll('.style-btn');
    buttons.forEach(btn => {
        btn.onclick = () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            onChange(btn.dataset.style);
        };
    });
}



// ── Constants mirroring server.js ──────────────────────────────────────────
// Must stay in sync with server.js:
//   OVERLAY_CATEGORIES    = ['doors', 'drawer_fronts']
//   NON_OVERLAY_CATEGORIES = ['finished_ends']  (sub-cats: flat, paneled)
//   DIRECT_CATEGORIES     = ['base', 'crown', 'drawers', 'case_parts', 'wall', 'counter_top', 'floor']
const OVERLAY_CATEGORIES_V    = ['doors', 'drawer_fronts'];
const NON_OVERLAY_CATEGORIES_V = ['finished_ends'];
const DIRECT_CATEGORIES_V     = ['base', 'crown', 'drawers', 'case_parts', 'wall', 'counter_top', 'floor'];
const KITCHEN_CATS = [...DIRECT_CATEGORIES_V, ...OVERLAY_CATEGORIES_V, ...NON_OVERLAY_CATEGORIES_V];
const ISLAND_CATS  = [...DIRECT_CATEGORIES_V, ...OVERLAY_CATEGORIES_V, ...NON_OVERLAY_CATEGORIES_V];

// Flatten a category tree node into flat entries for part buttons.
// prefix: relative URL prefix up to (not incl.) the filename.
function flattenCatTree(node, prefix) {
    if (!node) return [];
    if (Array.isArray(node.files)) {
        return node.files.map(f => ({
            label: f.name, file: f.file,
            deepPath: `${prefix}/${f.file}`, subLabel: null
        }));
    }
    const entries = [];
    for (const [key, child] of Object.entries(node)) {
        if (!child) continue;
        if (Array.isArray(child.files)) {
            child.files.forEach(f => entries.push({
                label: f.name, file: f.file,
                deepPath: `${prefix}/${key}/${f.file}`,
                subLabel: key.replace(/_/g, ' ')
            }));
        } else if (typeof child === 'object') {
            // Two levels: slab → long/cross
            for (const [grain, leaf] of Object.entries(child)) {
                if (leaf && Array.isArray(leaf.files)) {
                    leaf.files.forEach(f => entries.push({
                        label: f.name, file: f.file,
                        deepPath: `${prefix}/${key}/${grain}/${f.file}`,
                        subLabel: `${key.replace(/_/g,' ')} – ${grain}`
                    }));
                }
            }
        }
    }
    return entries;
}

// Resolve a cat node + URL prefix from the categories tree.
// Returns { node, prefix } or null if no data exists.
function resolveCatNode(catData, cat, style, overlay) {
    if (!catData) return null;
    // Direct categories live at ctx root level
    if (DIRECT_CATEGORIES_V.includes(cat)) {
        return catData[cat] ? { node: catData[cat], prefix: cat } : null;
    }
    if (!style) return null;
    if (style === 'face_frame') {
        // Overlay categories: ctx/face_frame/<overlay>/<cat>
        if (OVERLAY_CATEGORIES_V.includes(cat)) {
            const ov = overlay || 'full_overlay';
            const node = catData[style]?.[ov]?.[cat];
            return node ? { node, prefix: `${style}/${ov}/${cat}` } : null;
        }
        // Non-overlay categories: ctx/face_frame/<cat>
        if (NON_OVERLAY_CATEGORIES_V.includes(cat)) {
            const node = catData[style]?.[cat];
            return node ? { node, prefix: `${style}/${cat}` } : null;
        }
    } else {
        // frameless / full_inset: overlay doesn't apply
        const node = catData[style]?.[cat];
        return node ? { node, prefix: `${style}/${cat}` } : null;
    }
    return null;
}

async function populateContextParts(ctx, panelId, style, overlay) {
    const catData = showroomCategories?.[ctx];
    const categories = ctx === 'kitchen' ? KITCHEN_CATS : ISLAND_CATS;

    const overlaySection = document.getElementById(
        ctx === 'kitchen' ? 'overlay-section' : 'island-overlay-section'
    );
    if (overlaySection) overlaySection.style.display = (style === 'face_frame') ? '' : 'none';

    const promises = categories.map(cat => {
        const container = document.querySelector(`#${panelId} .part-options[data-category="${cat}"]`);
        const catWrapper = document.querySelector(`#${panelId} .part-category[data-category="${cat}"]`);
        if (!container) return Promise.resolve();

        const resolved = resolveCatNode(catData, cat, style, overlay);
        const entries  = resolved ? flattenCatTree(resolved.node, `${ctx}/${resolved.prefix}`) : [];

        if (catWrapper) catWrapper.style.display = entries.length > 0 ? '' : 'none';
        renderPartOptions(container, cat, ctx, entries);

        const buttons = container.querySelectorAll('.part-option-btn');
        if (buttons.length > 0) {
            const hasActive = Array.from(buttons).some(b => b.classList.contains('active'));
            if (!hasActive) {
                const btn = buttons[0];
                return loadShowroomPart(cat, ctx, btn.dataset.deeppath, btn);
            }
        }
        return Promise.resolve();
    });
    await Promise.all(promises);
}

async function populateKitchenParts() {
    const ov = overlayStyle === 'full' ? 'full_overlay' : 'half_overlay';
    await populateContextParts('kitchen', 'kitchen-parts', kitchenStyle, ov);
}

async function populateIslandParts() {
    const ov = islandOverlayStyle === 'full' ? 'full_overlay' : 'half_overlay';
    await populateContextParts('island', 'island-parts', islandStyle, ov);
}

function renderPartOptions(container, category, ctx, entries) {
    container.innerHTML = '';
    if (entries.length === 0) {
        const span = document.createElement('span');
        span.className = 'part-options-empty';
        span.textContent = 'No parts available';
        container.appendChild(span);
        return;
    }
    let lastSubLabel = undefined;
    entries.forEach(entry => {
        if (entry.subLabel !== null && entry.subLabel !== lastSubLabel) {
            const lbl = document.createElement('div');
            lbl.className = 'part-sub-label';
            lbl.textContent = entry.subLabel;
            container.appendChild(lbl);
            lastSubLabel = entry.subLabel;
        }
        const btn = document.createElement('button');
        btn.className = 'part-option-btn';
        btn.textContent = entry.label;
        btn.dataset.deeppath = entry.deepPath;

        const current = showroomParts[`${ctx}/${category}`];
        if (current && current.deepPath === entry.deepPath) btn.classList.add('active');

        btn.onclick = () => loadShowroomPart(category, ctx, entry.deepPath, btn);
        container.appendChild(btn);
    });
}

async function loadShowroomPart(category, ctx, deepPath, btnEl) {
    if (!renderer || !deepPath) return;
    const partKey = `${ctx}/${category}`;

    if (btnEl) {
        btnEl.parentElement.querySelectorAll('.part-option-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active', 'loading');
    }

    if (showroomParts[partKey]) {
        if (category === 'finished_ends') restoreBasePaneledEndMeshes(ctx);
        scene.remove(showroomParts[partKey].group);
        const oldMeshes = new Set();
        showroomParts[partKey].group.traverse(c => { if (c.isMesh) oldMeshes.add(c); });
        detectedMaterials = detectedMaterials.filter(m => !m.meshes.some(mesh => oldMeshes.has(mesh)));
        kitchenMaterials  = kitchenMaterials.filter(m => !m.meshes.some(mesh => oldMeshes.has(mesh)));
        islandMaterials   = islandMaterials.filter(m => !m.meshes.some(mesh => oldMeshes.has(mesh)));
        delete showroomParts[partKey];
    }

    let tagData = null;
    try {
        const tagsResp = await fetch(`/api/showroom/tags/${deepPath}`);
        if (tagsResp.ok) { const td = await tagsResp.json(); if (td.success) tagData = td.tags; }
    } catch { /* no tags */ }

    const glbUrl = `/showroom/${deepPath}`;
    const loader = new GLTFLoader();
    if (scene) { const isLightMode = localStorage.getItem("lightMode") === "true";
        scene.background = new THREE.Color(isLightMode ? 0xf0f0f0 : 0x111111); }
    const isIsland = (ctx === 'island');

    return new Promise((resolve) => {
        loader.load(glbUrl, (gltf) => {
            const group = gltf.scene;
            const materialMap = new Map();
            let meshIdx = 0;
            group.traverse((child) => {
                if (!child.isMesh) return;
                let originalIndex = meshIdx;
                if (gltf.parser?.associations) {
                    const assoc = gltf.parser.associations.get(child);
                    if (assoc && assoc.nodes !== undefined) originalIndex = assoc.nodes;
                }
                if (!child.name || child.name.startsWith('Mesh_')) child.name = `Node_${originalIndex}`;
                meshIdx++;

                if (tagData?.taggedMeshes && !tagData.taggedMeshes.includes(child.name)) {
                    child.visible = false; return;
                }

                const prevMats = Array.isArray(child.material) ? child.material : [child.material];
                const newMats = prevMats.map(prevMat => {
                    return new THREE.MeshLambertMaterial({
                        map: prevMat.map,
                        color: prevMat.map ? 0xffffff : prevMat.color,
                        transparent: prevMat.transparent,
                        opacity: prevMat.opacity,
                        side: THREE.DoubleSide,
                        polygonOffset: true,
                        polygonOffsetFactor: 1,
                        polygonOffsetUnits: 1,
                        name: prevMat.name || 'Material'
                    });
                });
                child.material = Array.isArray(child.material) ? newMats : newMats[0];

                newMats.forEach((mat, i) => {
                    const prevMat = prevMats[i];
                    if (mat.map) {
                        const texSrc = prevMat.map?.source?.uuid || prevMat.map?.uuid || prevMat.uuid;
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

                child.castShadow = true;
                child.receiveShadow = true;
            });

            if (category === 'finished_ends') handlePaneledEndSwap(ctx, deepPath);

            if (btnEl) btnEl.classList.remove('loading');
            resolve();
        }, undefined, (err) => {
            console.error(`[Showroom] Failed to load /showroom/${deepPath}`, err);
            if (btnEl) btnEl.classList.remove('loading');
            resolve();
        });
    });
}

// --- PANELED END REPLACEMENT LOGIC ---

function handlePaneledEndSwap(ctx, deepPath) {
    if (!/paneled/i.test(deepPath)) { restoreBasePaneledEndMeshes(ctx); return; }
    const basePart = showroomParts[`${ctx}/base`];
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
    const basePart = showroomParts[`${ctx}/base`];
    if (!basePart) return;
    basePart.group.traverse(child => {
        if (child.isMesh && child.userData._hiddenByPaneledEnd) {
            child.visible = true;
            delete child.userData._hiddenByPaneledEnd;
        }
    });
}




function reframeShowroomCamera() {
    const box = new THREE.Box3();
    let hasContent = false;
    for (const part of Object.values(showroomParts)) {
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
    camera.position.set(center.x + maxDim, center.y + maxDim * 0.7, center.z + maxDim);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
}

// --- SAVE / LOAD CONFIG ---

async function saveShowroomConfig() {
    const config = {
        kitchen: {
            style: kitchenStyle,
            parts: {},
            textures: {}
        },
        island: {
            style: islandStyle,
            parts: {},
            textures: {}
        },
        camera: {
            position: [camera.position.x, camera.position.y, camera.position.z],
            target: [controls.target.x, controls.target.y, controls.target.z]
        }
    };

    // Record selected parts ( partKey = "ctx/category" )
    for (const [partKey, part] of Object.entries(showroomParts)) {
        const [ctx, cat] = partKey.split('/');
        const section = ctx === 'island' ? config.island : config.kitchen;
        section.parts[partKey] = { deepPath: part.deepPath };
    }

    // Record texture/color assignments
    for (const mat of detectedMaterials) {
        if (!mat.hasTexture) continue;
        const section = mat.isIsland ? config.island : config.kitchen;
        const key = mat.name;
        if (mat.isColor) {
            section.textures[key] = { type: 'color', hex: mat.colorHex };
        } else if (mat.matchedName) {
            section.textures[key] = { type: 'texture', name: mat.matchedName, category: mat.bestCategory };
        }
    }

    updateStatus('Saving configuration...');
    try {
        const resp = await fetch('/api/showroom/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const data = await resp.json();
        if (data.success) {
            showroomPin = data.pin;
            const roomDisplay = document.getElementById('room-name-display');
            if (roomDisplay) roomDisplay.innerText = `PIN: ${data.pin}`;

            // Show PIN modal
            const pinModal = document.getElementById('pin-modal');
            const pinDisplay = document.getElementById('pin-display');
            if (pinDisplay) pinDisplay.textContent = data.pin;
            if (pinModal) {
                pinModal.classList.add('show');
                const closeBtn = document.getElementById('pin-modal-close');
                if (closeBtn) closeBtn.focus();
            }
            updateStatus('Configuration saved!');
            setTimeout(() => updateStatus(''), 3000);
        } else {
            updateStatus('Failed to save', true);
        }
    } catch (e) {
        updateStatus('Save error', true);
        console.error(e);
    }
}

async function loadShowroomConfig(pin) {
    updateStatus(`Loading PIN ${pin}...`);
    try {
        const resp = await fetch(`/api/showroom/config/${encodeURIComponent(pin)}`);
        const data = await resp.json();
        if (!data.success || !data.config) {
            updateStatus('PIN not found', true);
            return;
        }

        const config = data.config;
        showroomPin = pin;

        // Set styles
        if (config.kitchen && config.kitchen.style) {
            kitchenStyle = config.kitchen.style;
            setStyleToggle('kitchen-style-toggle', kitchenStyle);
            populateKitchenParts();
        }
        if (config.island && config.island.style) {
            islandStyle = config.island.style;
            setStyleToggle('island-style-toggle', islandStyle);
            populateIslandParts();
        }

        // Load parts
        const loadPromises = [];
        const allParts = { ...(config.kitchen?.parts || {}), ...(config.island?.parts || {}) };
        for (const [partKey, partInfo] of Object.entries(allParts)) {
            const [ctx, cat] = partKey.split('/');
            if (partInfo.deepPath) {
                loadPromises.push(loadShowroomPart(cat, ctx, partInfo.deepPath, null));
            }
        }
        await Promise.all(loadPromises);

        // Apply textures/colors
        const allTextures = { ...(config.kitchen?.textures || {}), ...(config.island?.textures || {}) };
        for (const [matName, texInfo] of Object.entries(allTextures)) {
            const mat = detectedMaterials.find(m => m.name === matName);
            if (!mat) continue;

            if (texInfo.type === 'color') {
                applySolidColor(mat, texInfo.hex);
            } else if (texInfo.type === 'texture' && texInfo.name) {
                // Try to find and apply the texture from catalog
                mat.matchedName = texInfo.name;
                mat.bestCategory = texInfo.category;
            }
        }

        // Restore camera
        if (config.camera) {
            const pos = config.camera.position;
            const tgt = config.camera.target;
            if (pos) camera.position.set(pos[0], pos[1], pos[2]);
            if (tgt) controls.target.set(tgt[0], tgt[1], tgt[2]);
            controls.update();
        } else {
            reframeShowroomCamera();
        }

        updateStatus('');
    } catch (e) {
        updateStatus('Failed to load PIN', true);
        console.error(e);
    }
}

function setStyleToggle(elementId, style) {
    const toggle = document.getElementById(elementId);
    if (!toggle) return;
    toggle.querySelectorAll('.style-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.style === style);
    });
}

function onWindowResize() {
    if (camera && renderer && composer) {
        const dpr = renderer.getPixelRatio();
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
        if (fxaaPass) {
            fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * dpr);
            fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * dpr);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);

    // Dynamic Texture LOD check (throttled to 500ms)
    const now = Date.now();
    if (camera && scene && (now - lastLodCheckTime > 500) && detectedMaterials.length > 0) {
        lastLodCheckTime = now;
        const camPos = camera.position;

        // Use global thresholds set by sliders, or defaults
        const tHigh = window.lodHighThreshold || 500;
        const tMed = window.lodMediumThreshold || 2000;

        detectedMaterials.forEach(matGroup => {
            if (!matGroup.hasTexture || matGroup.isColor || window.forceHighResRender) return;

            // Only swap if we have LOD URLs stored on the group
            if (!matGroup.urlLow && !matGroup.urlMedium) return;

            // Use the first mesh in the group to determine distance
            if (matGroup.meshes.length > 0) {
                const mesh = matGroup.meshes[0];
                if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
                _lodVec.copy(mesh.geometry.boundingSphere.center);
                mesh.localToWorld(_lodVec);
                const dist = camPos.distanceTo(_lodVec);

                let targetUrl = matGroup.urlHigh; // Default to high
                if (dist > tMed) targetUrl = matGroup.urlLow || matGroup.urlMedium || matGroup.urlHigh;
                else if (dist > tHigh) targetUrl = matGroup.urlMedium || matGroup.urlHigh;

                if (targetUrl && matGroup.currentLODUrl !== targetUrl) {
                    matGroup.currentLODUrl = targetUrl;

                    // Load from cache or fetch
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

                            // Make sure distance hasn't caused another swap while loading
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

    if (zoomVelocity !== 0 && camera && controls) {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        const dist = camera.position.distanceTo(controls.target);
        if (!(zoomVelocity > 0 && dist < 0.5)) {
            camera.position.addScaledVector(direction, zoomVelocity * controls.zoomSpeed);
        }
    }
    if (controls) controls.update();
    if (composer) composer.render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();


