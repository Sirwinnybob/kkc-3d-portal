// Resolved via importmap in viewer.html
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
let zoomVelocity = 0;
let detectedMaterials = [];
let selectedMaterialIndex = -1;
let loadedModel = null;

// Surface Highlight state
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
let showroomPin = null;
let showroomCategories = {};
let showroomParts = {};       // { category: { group, style, file, tagData } }
let kitchenMaterials = [];
let islandMaterials = [];
let kitchenStyle = 'face_frame';
let islandStyle = 'face_frame';
const MILKY_GRAY = 0xC8C8C8;

// Bridge populated by setupTexturePanel so handleSingleTap (init scope) can open the picker
const quickPicker = { open: null, close: null, paintTap: null };

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

async function init() {
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
    const menuBtn = document.getElementById('menu-btn');
    const dropdown = document.getElementById('dropdown-menu');
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeHelpX = document.getElementById('close-help-x');
    const closeHelpBtn = document.getElementById('close-help-btn');

    if (menuBtn && dropdown) {
        menuBtn.onclick = (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('show');
            const isExpanded = dropdown.classList.contains('show');
            menuBtn.setAttribute('aria-expanded', isExpanded.toString());
        };
        window.addEventListener('pointerdown', (e) => {
            if (!document.getElementById('menu-container').contains(e.target)) {
                dropdown.classList.remove('show');
                menuBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    const toggleHelp = (show) => {
        if (helpModal) {
            helpModal.classList.toggle('show', show);
            if (show) {
                if (closeHelpBtn) closeHelpBtn.focus();
            } else {
                if (helpBtn) helpBtn.focus();
            }
        }
    };
    if (helpBtn) helpBtn.onclick = () => toggleHelp(true);
    if (closeHelpX) closeHelpX.onclick = () => toggleHelp(false);
    if (closeHelpBtn) closeHelpBtn.onclick = () => toggleHelp(false);

    // --- ESCAPE KEY: Close active overlays ---
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const activeInput = document.activeElement;
        if (activeInput && (activeInput.tagName === 'INPUT' || activeInput.tagName === 'TEXTAREA')) {
            activeInput.blur();
            return;
        }
        const tour = document.getElementById('product-tour');
        if (tour?.classList.contains('show')) return document.getElementById('tour-skip')?.click();
        if (helpModal?.classList.contains('show')) return toggleHelp(false);
        if (document.getElementById('quick-picker')?.classList.contains('show')) return quickPicker.close?.();
        const sheet = document.getElementById('tap-replace-sheet');
        if (sheet?.classList.contains('show')) {
            sheet.classList.remove('show');
            return typeof clearMeshHighlight === 'function' && clearMeshHighlight();
        }
        if (document.getElementById('texture-panel')?.classList.contains('show')) return document.getElementById('texture-panel').classList.remove('show');
        if (dropdown?.classList.contains('show')) {
            dropdown.classList.remove('show');
            menuBtn?.setAttribute('aria-expanded', 'false');
        }
    });

    // AUTO-SHOW HELP: only if tour also not shown (legacy users who skipped the tour)
    if (localStorage.getItem('kkc_help_shown') !== 'true' && localStorage.getItem('kkc_tutorial_v1') === 'true') {
        toggleHelp(true);
        localStorage.setItem('kkc_help_shown', 'true');
    }

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
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111111);
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 5000);

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
        const dpr = Math.min(window.devicePixelRatio, 2);
        renderer.setPixelRatio(dpr);
        renderer.setSize(window.innerWidth, window.innerHeight);

        const canvasContainer = document.getElementById('canvas-container');
        if (canvasContainer) canvasContainer.appendChild(renderer.domElement);

        scene.add(camera);
        controls = new OrbitControls(camera, renderer.domElement);
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
            window.setupTexturePanel = setupTexturePanel; // Expose for showroom mode
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
            // If in paint mode, apply last texture to newly tapped surface
            if (quickPicker.paintTap) {
                quickPicker.paintTap(clientX, clientY);
                return;
            }

            // Don't open picker if any overlay is already visible
            if (document.getElementById('quick-picker').classList.contains('show')) return;
            if (document.getElementById('tap-replace-sheet').classList.contains('show')) return;
            if (document.getElementById('texture-panel').classList.contains('show')) return;

            const raycaster = new THREE.Raycaster();
            const mouse = new THREE.Vector2(
                (clientX / window.innerWidth) * 2 - 1,
                -(clientY / window.innerHeight) * 2 + 1
            );
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);
            if (!intersects.length) return;

            const tappedMesh = intersects[0].object;
            const matGroupIndex = detectedMaterials.findIndex(g => g.meshes.includes(tappedMesh));
            if (matGroupIndex < 0) return;
            if (!detectedMaterials[matGroupIndex].hasTexture) return;

            if (quickPicker.open) quickPicker.open(matGroupIndex, tappedMesh);
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
            };
        }

        // --- LOAD MODEL ---
        updateStatus("Loading Design...");
        window.setupTexturePanel = setupTexturePanel; // Expose for testing
        const loader = new GLTFLoader();
        loader.load(urlData.url, (gltf) => {
            const model = gltf.scene;
            loadedModel = model;
            detectedMaterials = [];

            // Track unique materials to avoid listing every face
            const materialMap = new Map(); // texSrc -> { material, meshes[], name, hasTexture, originalMap }

            model.traverse((child) => {
                if (child.isMesh) {
                    const prevMat = child.material;
                    child.material = new THREE.MeshLambertMaterial({
                        map: prevMat.map,
                        color: prevMat.map ? 0xffffff : prevMat.color,
                        transparent: prevMat.transparent,
                        opacity: prevMat.opacity,
                        side: THREE.DoubleSide,
                        polygonOffset: true,
                        polygonOffsetFactor: 1,
                        polygonOffsetUnits: 1
                    });
                    if (child.material.map) {
                        child.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
                        child.material.map.minFilter  = THREE.LinearMipmapLinearFilter;
                        child.material.map.magFilter  = THREE.LinearFilter;
                    }

                    const mat = child.material;
                    const hasTexture = !!mat.map;

                    if (hasTexture) {
                        const texSrc = mat.map.image?.src || mat.map.uuid;
                        if (materialMap.has(texSrc)) {
                            materialMap.get(texSrc).meshes.push(child);
                        } else {
                            materialMap.set(texSrc, {
                                name: prevMat.name || child.name || `Material_${materialMap.size}`,
                                material: mat,
                                meshes: [child],
                                hasTexture: true,
                                originalMap: mat.map,
                                originalColor: mat.color.clone()
                            });
                        }
                    }
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
            setupTexturePanel(jobCode, initialRoom).then(() => {
                // Kick off initial matching scan
                if (window.matchAllTextures) window.matchAllTextures();
            });
        }, (xhr) => {
            if (xhr.lengthComputable) {
                const p = Math.round((xhr.loaded / xhr.total) * 100);
                updateStatus(`Downloading: ${p}%`);
            }
        });

    } catch (e) {
        console.error(e);
        updateStatus("Connection Error", true);
    }

    window.addEventListener('resize', onWindowResize);
    animate();
}

// --- TEXTURE CATALOG PANEL ---
async function setupTexturePanel(jobCode, room) {
    const textureBtn = document.getElementById('texture-btn');
    const texturePanel = document.getElementById('texture-panel');
    const closeTextureBtn = document.getElementById('close-texture-btn');
    const materialList = document.getElementById('material-list');
    const textureGrid = document.getElementById('texture-grid');
    const textureSearch = document.getElementById('texture-search');
    const catalogTitle = document.getElementById('catalog-title');
    const backToMaterialsBtn = document.getElementById('back-to-materials');

    let textureCategories = [];
    let currentCategoryTextures = [];
    let isMatchingAll = false;

    // Insert a "Browse All Categories" button at the top of the texture grid
    function insertBrowseButton() {
        const browseBtn = document.createElement('button');
        browseBtn.className = 'browse-all-categories-btn';
        browseBtn.innerText = '\u2190 Browse All Categories';
        browseBtn.onclick = () => showAllCategories();
        textureGrid.insertBefore(browseBtn, textureGrid.firstChild);
    }

    // Toggle texture panel
    if (textureBtn) {
        textureBtn.onclick = () => {
            texturePanel.classList.toggle('show');
            if (texturePanel.classList.contains('show')) {
                renderMaterialList();
            }
        };
    }
    if (closeTextureBtn) {
        closeTextureBtn.onclick = () => texturePanel.classList.remove('show');
    }

    // Internal function to match all textures on load
    // Tries server-side manifest first, falls back to client-side matching
    window.matchAllTextures = async () => {
        if (isMatchingAll) return;
        isMatchingAll = true;

        const texturedMaterials = detectedMaterials.filter(m => m.hasTexture);
        if (texturedMaterials.length === 0) {
            isMatchingAll = false;
            return;
        }

        updateStatus(`Loading texture data...`);

        // Try server-side manifest first
        let manifestLoaded = false;
        try {
            const resp = await fetch(`/api/job/${encodeURIComponent(jobCode)}/${encodeURIComponent(room)}/textures`);
            if (resp.ok) {
                const manifest = await resp.json();
                if (manifest.materials) {
                    for (const mat of texturedMaterials) {
                        const entry = manifest.materials[mat.name];
                        if (entry && entry.matched) {
                            mat.matchedName = entry.bestMatch ? entry.bestMatch.name : null;
                            mat.bestCategory = entry.bestCategory;
                            mat.similarTextures = entry.similarTextures;
                            mat.isHidden = !!entry.isHidden;
                        } else {
                            mat.matchedName = null;
                            mat.isHidden = false;
                        }
                        if (mat.originalMatchedName === undefined) mat.originalMatchedName = mat.matchedName;
                    }
                    manifestLoaded = true;
                }
            }
        } catch (e) {
            console.log("Manifest not available, falling back to client-side matching");
        }

        // Fallback: client-side matching if manifest unavailable
        if (!manifestLoaded) {
            updateStatus(`Matching ${texturedMaterials.length} textures...`);
            for (let i = 0; i < texturedMaterials.length; i++) {
                const mat = texturedMaterials[i];
                try {
                    await matchTexture(mat, jobCode, room);
                } catch (e) {
                    console.error("Match error:", e);
                }
                if (texturePanel.classList.contains('show')) renderMaterialList();
            }
        }

        isMatchingAll = false;
        updateStatus("");
        if (texturePanel.classList.contains('show')) renderMaterialList();
    };

    // Render material list
    function renderMaterialList() {
        if (!materialList) return;
        materialList.innerHTML = '';

        // Filter: only show real textures (mat.hasTexture)
        // and hide ones marked as hidden by the matching engine
        const visibleMaterials = detectedMaterials.filter(mat => mat.hasTexture && !mat.isHidden);

        if (visibleMaterials.length === 0) {
            const div = document.createElement('div');
            div.style.cssText = 'padding:20px; text-align:center; color:#888;';
            div.textContent = isMatchingAll ? 'Matching textures...' : 'No customizable textures found.';
            materialList.appendChild(div);
            return;
        }

        // In showroom mode, separate kitchen and island
        if (isShowroomMode) {
            const kitchenVis = visibleMaterials.filter(m => !m.isIsland);
            const islandVis = visibleMaterials.filter(m => m.isIsland);

            if (kitchenVis.length > 0) {
                const header = document.createElement('div');
                header.className = 'material-section-header';
                header.textContent = 'Kitchen';
                materialList.appendChild(header);
                kitchenVis.forEach(mat => materialList.appendChild(createMaterialItem(mat)));
            }
            if (islandVis.length > 0) {
                const header = document.createElement('div');
                header.className = 'material-section-header';
                header.textContent = 'Island';
                materialList.appendChild(header);
                islandVis.forEach(mat => materialList.appendChild(createMaterialItem(mat)));
            }
        } else {
            visibleMaterials.forEach(mat => materialList.appendChild(createMaterialItem(mat)));
        }

        document.getElementById('materials-view').style.display = 'block';
        document.getElementById('catalog-view').style.display = 'none';
    }

    function createMaterialItem(mat) {
        const btn = document.createElement('button');
        btn.className = 'material-item';

        let previewHtml = '';
        if (mat.hasTexture && mat.material.map && mat.material.map.image) {
            try {
                const img = mat.material.map.image;
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 64, 64);
                previewHtml = `<img class="material-preview" src="${canvas.toDataURL()}" alt="Preview">`;
            } catch {
                previewHtml = `<div class="material-preview-placeholder" style="background-color: #${mat.material.color.getHexString()}"></div>`;
            }
        } else {
            const colorHex = mat.material.color ? mat.material.color.getHexString() : 'cccccc';
            previewHtml = `<div class="material-preview-placeholder" style="background-color: #${colorHex}"></div>`;
        }

        const displayName = mat.matchedName || mat.name;
        btn.innerHTML = `
            <div class="material-item-left">
                ${previewHtml}
                <div class="material-info">
                    <span class="material-name">${escapeHtml(displayName)}</span>
                    <span class="material-status">Customizable</span>
                </div>
            </div>
            <span class="material-badge">${mat.isColor ? 'Color' : 'Has Texture'}</span>
        `;
        const originalIndex = detectedMaterials.indexOf(mat);
        btn.onclick = () => selectMaterial(originalIndex);
        return btn;
    }

    // Select a material and show catalog
    async function selectMaterial(index) {
        selectedMaterialIndex = index;
        const mat = detectedMaterials[index];
        document.getElementById('materials-view').style.display = 'none';
        document.getElementById('catalog-view').style.display = 'block';
        catalogTitle.innerText = `Replace: ${mat.matchedName || mat.name}`;

        // If manifest already gave us a category, use it directly (no API call)
        if (mat.bestCategory) {
            await loadCategoryTextures(mat.bestCategory);
            if (mat.similarTextures && mat.similarTextures.length > 0) {
                const uniqueSimilar = mat.similarTextures.filter(t => !currentCategoryTextures.some(ct => ct.url === t.url));
                currentCategoryTextures = [...uniqueSimilar, ...currentCategoryTextures];
                renderTextureGrid();
                insertBrowseButton();
            }
        } else if (mat.hasTexture && mat.originalMap) {
            await matchAndShowCatalog(mat, jobCode, room);
        } else {
            await showAllCategories();
        }
    }

    // Core match function
    async function matchTexture(mat, jobCode, room) {
        if (!mat.hasTexture || !mat.originalMap) return null;

        // Extract texture image data
        const img = mat.originalMap.image;
        if (!img) return null;

        const canvas = document.createElement('canvas');
        canvas.width = Math.min(img.width || 256, 256);
        canvas.height = Math.min(img.height || 256, 256);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);

        const resp = await fetch('/api/textures/match', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageData, jobCode, room, materialName: mat.name })
        });
        const data = await resp.json();

        if (data.success && data.matched) {
            mat.matchedName = data.bestMatch ? data.bestMatch.name : null;
            mat.bestCategory = data.bestCategory;
            mat.similarTextures = data.similarTextures;
            mat.isHidden = !!data.isHidden;
        } else {
            mat.matchedName = null;
            mat.isHidden = false;
        }
        if (mat.originalMatchedName === undefined) mat.originalMatchedName = mat.matchedName;
        return data;
    }

    // Match texture and show catalog
    async function matchAndShowCatalog(mat, jobCode, room) {
        updateStatus("Matching texture...");
        try {
            const data = await matchTexture(mat, jobCode, room);

            if (data && data.success && data.matched && data.bestCategory) {
                // Update catalog title to show matched texture name
                if (mat.matchedName) {
                    catalogTitle.innerText = `Replace: ${mat.matchedName}`;
                }

                // Show matched category textures first, then similar
                await loadCategoryTextures(data.bestCategory);
                if (data.similarTextures && data.similarTextures.length > 0) {
                    // Prepend similar matches at top (preserve their real names)
                    const uniqueSimilar = data.similarTextures.filter(t => !currentCategoryTextures.some(ct => ct.url === t.url));
                    currentCategoryTextures = [...uniqueSimilar, ...currentCategoryTextures];
                }
                renderTextureGrid();
                insertBrowseButton();
            } else {
                // No match — show all categories
                await showAllCategories();
            }
            updateStatus("");
        } catch (e) {
            console.error("Texture match error:", e);
            updateStatus("");
            await showAllCategories();
        }
    }

    // Show all categories as clickable items
    async function showAllCategories() {
        try {
            const resp = await fetch('/api/textures');
            const data = await resp.json();
            if (data.success) {
                textureCategories = data.categories;
                textureGrid.innerHTML = '';
                catalogTitle.innerText = 'Select a Category';

                // Add "Solid Colors" as the first category
                const colorBtn = document.createElement('button');
                colorBtn.className = 'texture-category-btn';
                colorBtn.innerText = 'Solid Colors';
                colorBtn.onclick = () => showSolidColorsView();
                textureGrid.appendChild(colorBtn);

                textureCategories.forEach(cat => {
                    const btn = document.createElement('button');
                    btn.className = 'texture-category-btn';
                    btn.innerText = cat;
                    btn.onclick = () => loadCategoryTextures(cat);
                    textureGrid.appendChild(btn);
                });
            }
        } catch (e) {
            console.error("Failed to load categories:", e);
        }
    }

    // Solid Colors view
    function showSolidColorsView() {
        if (selectedMaterialIndex < 0) return;
        catalogTitle.innerText = 'Solid Colors';
        textureGrid.innerHTML = '';

        // Browse button to go back
        insertBrowseButton();

        // Preset swatches
        const presetsDiv = document.createElement('div');
        presetsDiv.className = 'color-presets';
        COLOR_PRESETS.forEach(preset => {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = preset.hex;
            swatch.title = preset.name;
            swatch.onclick = () => {
                applySolidColor(detectedMaterials[selectedMaterialIndex], preset.hex);
                presetsDiv.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            };
            presetsDiv.appendChild(swatch);
        });
        textureGrid.appendChild(presetsDiv);

        // Color picker
        const pickerRow = document.createElement('div');
        pickerRow.className = 'color-picker-row';
        const pickerLabel = document.createElement('label');
        pickerLabel.textContent = 'Custom:';
        const picker = document.createElement('input');
        picker.type = 'color';
        picker.value = '#C8C8C8';
        const hexDisplay = document.createElement('span');
        hexDisplay.className = 'color-hex-display';
        hexDisplay.textContent = picker.value;

        picker.oninput = () => {
            hexDisplay.textContent = picker.value;
            applySolidColor(detectedMaterials[selectedMaterialIndex], picker.value);
            presetsDiv.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        };
        pickerRow.appendChild(pickerLabel);
        pickerRow.appendChild(picker);
        pickerRow.appendChild(hexDisplay);
        textureGrid.appendChild(pickerRow);

        // Recent colors
        const recent = getRecentColors();
        if (recent.length > 0) {
            const recentSection = document.createElement('div');
            recentSection.className = 'recent-colors-section';
            const recentLabel = document.createElement('div');
            recentLabel.className = 'recent-colors-label';
            recentLabel.textContent = 'Recent Colors';
            recentSection.appendChild(recentLabel);

            const recentRow = document.createElement('div');
            recentRow.className = 'recent-colors-row';
            recent.forEach(hex => {
                const swatch = document.createElement('button');
                swatch.className = 'recent-color-swatch';
                swatch.style.backgroundColor = hex;
                swatch.title = hex;
                swatch.onclick = () => {
                    applySolidColor(detectedMaterials[selectedMaterialIndex], hex);
                };
                recentRow.appendChild(swatch);
            });
            recentSection.appendChild(recentRow);
            textureGrid.appendChild(recentSection);
        }
    }

    // Load textures for a category
    async function loadCategoryTextures(category) {
        try {
            const resp = await fetch(`/api/textures/${encodeURIComponent(category)}`);
            const data = await resp.json();
            if (data.success) {
                currentCategoryTextures = data.textures;
                catalogTitle.innerText = category;
                renderTextureGrid();
                insertBrowseButton();
            }
        } catch (e) {
            console.error("Failed to load textures:", e);
        }
    }

    // Render texture thumbnails
    function renderTextureGrid() {
        if (!textureGrid) return;
        textureGrid.innerHTML = '';
        currentCategoryTextures.forEach(tex => {
            const btn = document.createElement('button');
            btn.className = 'texture-thumb';
            btn.setAttribute('aria-label', `Select texture ${escapeHtml(tex.name)}`);
            btn.innerHTML = `<img src="${escapeHtml(tex.url)}" alt="${escapeHtml(tex.name)}" loading="lazy"><span>${escapeHtml(tex.name)}</span>`;
            btn.onclick = () => previewTexture(tex.url, tex.name);
            textureGrid.appendChild(btn);
        });
    }

    // Preview texture on selected material (applies to all meshes in group)
    function previewTexture(url, name) {
        if (selectedMaterialIndex < 0) return;
        const matGroup = detectedMaterials[selectedMaterialIndex];
        const texLoader = new THREE.TextureLoader();
        texLoader.load(url, (newTex) => {
            newTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            newTex.minFilter = THREE.LinearMipmapLinearFilter;
            newTex.magFilter = THREE.LinearFilter;
            newTex.wrapS = THREE.RepeatWrapping;
            newTex.wrapT = THREE.RepeatWrapping;
            // Apply to all meshes sharing this material
            matGroup.meshes.forEach(mesh => {
                mesh.material.map = newTex;
                // Use white color so texture renders at true brightness
                mesh.material.color.set(0xffffff);
                mesh.material.needsUpdate = true;
            });
            // Update the displayed name so the material list reflects the new texture
            if (name) matGroup.matchedName = name;
        });
    }

    // Back to materials list
    if (backToMaterialsBtn) {
        backToMaterialsBtn.onclick = () => {
            renderMaterialList();
        };
    }

    // Search filter
    if (textureSearch) {
        textureSearch.oninput = () => {
            const q = textureSearch.value.toLowerCase();
            const thumbs = textureGrid.querySelectorAll('.texture-thumb');
            thumbs.forEach(th => {
                const name = th.querySelector('span')?.innerText?.toLowerCase() || '';
                th.style.display = name.includes(q) ? '' : 'none';
            });
        };
    }

    // ================================================================
    // QUICK PICKER — tap-to-select texture (bottom sheet UI)
    // ================================================================
    const tapReplaceSheet    = document.getElementById('tap-replace-sheet');
    const tapReplaceLabel    = document.getElementById('tap-replace-label');
    const tapReplaceAllBtn   = document.getElementById('tap-replace-all-btn');
    const tapReplaceOneBtn   = document.getElementById('tap-replace-one-btn');
    const tapReplaceCancel   = document.getElementById('tap-replace-cancel');
    const tapReplaceBackdrop = document.getElementById('tap-replace-backdrop');

    const qpEl             = document.getElementById('quick-picker');
    const qpTitle          = document.getElementById('qp-title');
    const qpCategoriesBack = document.getElementById('qp-categories-back');
    const qpClose          = document.getElementById('qp-close');
    const qpViewsContainer = document.getElementById('qp-views-container');
    const qpCategoriesView = document.getElementById('qp-categories-view');
    const qpCategoryGrid   = document.getElementById('qp-category-grid');
    const qpTexturesView   = document.getElementById('qp-textures-view');
    const qpTextureStrip   = document.getElementById('qp-texture-strip');

    let qpMatGroupIndex    = -1;
    let qpTappedMesh       = null;
    let qpReplaceAll       = true;
    let qpCurrentTextures  = [];
    let qpPaintMode        = false;
    let qpLastTextureUrl   = null;
    let qpLastTextureName  = null;

    // ---- Replace-mode sheet ----
    function openReplaceSheet(matGroupIndex, mesh) {
        qpMatGroupIndex = matGroupIndex;
        qpTappedMesh    = mesh;
        highlightMesh(mesh);
        const mat   = detectedMaterials[matGroupIndex];
        const label = mat.matchedName || mat.name;

        if (mat.meshes.length > 1) {
            tapReplaceLabel.textContent = `How do you want to change "${label}"?`;
            tapReplaceSheet.classList.add('show');
        } else {
            // Only one mesh — skip the dialog
            qpReplaceAll = true;
            openQuickPicker();
        }
    }

    function closeReplaceSheet() {
        tapReplaceSheet.classList.remove('show');
    }

    tapReplaceAllBtn.addEventListener('click', () => {
        qpReplaceAll = true;
        closeReplaceSheet();
        openQuickPicker();
    });
    tapReplaceOneBtn.addEventListener('click', () => {
        qpReplaceAll = false;
        qpPaintMode  = true;
        closeReplaceSheet();
        openQuickPicker();
    });
    tapReplaceCancel.addEventListener('click', closeReplaceSheet);
    tapReplaceBackdrop.addEventListener('click', closeReplaceSheet);

    // ---- Quick Picker panel ----
    async function openQuickPicker() {
        if (qpMatGroupIndex < 0) return;
        const mat = detectedMaterials[qpMatGroupIndex];
        qpTitle.textContent = mat.matchedName || mat.name;

        if (mat.bestCategory) {
            // Go directly to matched category's texture strip
            showQpTexturesView();
            await loadQpCategoryTextures(mat.bestCategory, mat);
        } else {
            showQpCategoriesView();
            await loadQpCategories(mat);
        }
        qpEl.classList.add('show');
    }

    function closeQuickPicker() {
        qpEl.classList.remove('show');
        qpMatGroupIndex    = -1;
        qpTappedMesh       = null;
        qpCurrentTextures  = [];
        qpPaintMode        = false;
        qpLastTextureUrl   = null;
        qpLastTextureName  = null;
        quickPicker.paintTap = null;
        clearMeshHighlight();
    }

    qpClose.addEventListener('click', closeQuickPicker);

    // ---- View switching ----
    function showQpCategoriesView() {
        qpViewsContainer.classList.remove('show-textures');
        qpCategoriesBack.classList.add('hidden');
    }

    function showQpTexturesView() {
        qpViewsContainer.classList.add('show-textures');
        qpCategoriesBack.classList.remove('hidden');
    }

    qpCategoriesBack.addEventListener('click', () => {
        const mat = qpMatGroupIndex >= 0 ? detectedMaterials[qpMatGroupIndex] : null;
        showQpCategoriesView();
        if (mat) loadQpCategories(mat);
    });

    // ---- Category loading ----
    async function loadQpCategories(mat) {
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'color:rgba(255,255,255,0.4);padding:20px;text-align:center;grid-column:1/-1;font-size:0.9em;';
        loadingDiv.textContent = 'Loading…';
        qpCategoryGrid.innerHTML = '';
        qpCategoryGrid.appendChild(loadingDiv);
        try {
            const resp = await fetch('/api/textures');
            const data = await resp.json();
            if (!data.success) throw new Error();
            qpCategoryGrid.innerHTML = '';

            // Add Solid Colors first
            const colorBtn = document.createElement('button');
            colorBtn.className = 'qp-category-btn';
            colorBtn.textContent = 'Solid Colors';
            colorBtn.addEventListener('click', () => loadQpSolidColors(mat));
            qpCategoryGrid.appendChild(colorBtn);

            data.categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'qp-category-btn';
                if (mat && mat.bestCategory && cat === mat.bestCategory) {
                    btn.classList.add('current-cat');
                }
                btn.textContent = cat;
                btn.addEventListener('click', () => loadQpCategoryTextures(cat, mat));
                qpCategoryGrid.appendChild(btn);
            });
        } catch {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'color:#f87171;padding:20px;text-align:center;grid-column:1/-1;';
            errorDiv.textContent = 'Failed to load categories';
            qpCategoryGrid.innerHTML = '';
            qpCategoryGrid.appendChild(errorDiv);
        }
    }

    // Quick picker solid colors view
    function loadQpSolidColors(mat) {
        qpTitle.textContent = 'Solid Colors';
        showQpTexturesView();
        qpTextureStrip.innerHTML = '';

        // Presets
        COLOR_PRESETS.forEach(preset => {
            const btn = document.createElement('button');
            btn.className = 'qp-tex-item';
            btn.innerHTML = `<div class="color-swatch" style="background-color:${escapeHtml(preset.hex)};width:60px;height:60px;border-radius:8px;"></div><span>${escapeHtml(preset.name)}</span>`;
            btn.addEventListener('click', () => {
                if (qpMatGroupIndex >= 0) {
                    const targetMat = detectedMaterials[qpMatGroupIndex];
                    if (qpReplaceAll) {
                        applySolidColor(targetMat, preset.hex);
                    } else {
                        // Paint mode: single mesh
                        const color = new THREE.Color(preset.hex);
                        qpTappedMesh.material.map = null;
                        qpTappedMesh.material.color.copy(color);
                        qpTappedMesh.material.needsUpdate = true;
                        targetMat.hasPartialChange = true;
                        targetMat.isColor = true;
                        targetMat.colorHex = preset.hex;
                        const r = Math.round(color.r * 255);
                        const g = Math.round(color.g * 255);
                        const b = Math.round(color.b * 255);
                        targetMat.matchedName = `RGB(${r},${g},${b})`;
                        addRecentColor(preset.hex);
                    }
                    // Update active
                    qpTextureStrip.querySelectorAll('.qp-tex-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    qpLastTextureUrl = null;
                    qpLastTextureName = preset.name;
                }
            });
            qpTextureStrip.appendChild(btn);
        });

        // Recent colors
        const recent = getRecentColors();
        recent.forEach(hex => {
            const btn = document.createElement('button');
            btn.className = 'qp-tex-item';
            btn.innerHTML = `<div class="color-swatch" style="background-color:${escapeHtml(hex)};width:60px;height:60px;border-radius:8px;"></div><span>${escapeHtml(hex)}</span>`;
            btn.addEventListener('click', () => {
                if (qpMatGroupIndex >= 0) {
                    applySolidColor(detectedMaterials[qpMatGroupIndex], hex);
                    qpTextureStrip.querySelectorAll('.qp-tex-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
            qpTextureStrip.appendChild(btn);
        });
    }

    async function loadQpCategoryTextures(category, mat) {
        qpTitle.textContent = category;
        showQpTexturesView();
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'color:rgba(255,255,255,0.4);padding:20px;display:flex;align-items:center;';
        loadingDiv.textContent = 'Loading…';
        qpTextureStrip.innerHTML = '';
        qpTextureStrip.appendChild(loadingDiv);
        try {
            const resp = await fetch(`/api/textures/${encodeURIComponent(category)}`);
            const data = await resp.json();
            if (!data.success) throw new Error();
            qpCurrentTextures = data.textures;
            // Prepend similar textures for this material (deduped)
            if (mat && mat.similarTextures && mat.similarTextures.length > 0) {
                const unique = mat.similarTextures.filter(t => !qpCurrentTextures.some(ct => ct.url === t.url));
                qpCurrentTextures = [...unique, ...qpCurrentTextures];
            }
            renderQpStrip(mat);
        } catch {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'color:#f87171;padding:20px;';
            errorDiv.textContent = 'Failed to load textures';
            qpTextureStrip.innerHTML = '';
            qpTextureStrip.appendChild(errorDiv);
        }
    }

    // ---- Render horizontal strip ----
    function renderQpStrip(mat) {
        qpTextureStrip.innerHTML = '';
        const currentName = mat ? (mat.matchedName || null) : null;
        let activeEl = null;

        qpCurrentTextures.forEach(tex => {
            const btn = document.createElement('button');
            btn.className = 'qp-tex-item';
            if (tex.name === currentName) { btn.classList.add('active'); activeEl = btn; }
            btn.innerHTML = `<img src="${escapeHtml(tex.url)}" alt="${escapeHtml(tex.name)}" loading="lazy"><span>${escapeHtml(tex.name)}</span>`;
            btn.addEventListener('click', () => applyQpTexture(tex.url, tex.name));
            qpTextureStrip.appendChild(btn);
        });

        // Scroll the active (current) texture to center
        if (activeEl) {
            requestAnimationFrame(() => {
                const stripW = qpTextureStrip.offsetWidth;
                qpTextureStrip.scrollLeft = activeEl.offsetLeft - (stripW / 2) + (activeEl.offsetWidth / 2);
            });
        }
    }

    // ---- Apply texture ----
    function applyQpTexture(url, name) {
        if (qpMatGroupIndex < 0) return;
        const matGroup  = detectedMaterials[qpMatGroupIndex];
        const texLoader = new THREE.TextureLoader();
        texLoader.load(url, (newTex) => {
            newTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            newTex.minFilter  = THREE.LinearMipmapLinearFilter;
            newTex.magFilter  = THREE.LinearFilter;
            newTex.wrapS      = THREE.RepeatWrapping;
            newTex.wrapT      = THREE.RepeatWrapping;

            if (qpReplaceAll) {
                matGroup.meshes.forEach(mesh => {
                    mesh.material.map = newTex;
                    mesh.material.color.set(0xffffff);
                    mesh.material.needsUpdate = true;
                });
            } else {
                // Each mesh has its own material instance — safe to update individually
                qpTappedMesh.material.map = newTex;
                qpTappedMesh.material.color.set(0xffffff);
                qpTappedMesh.material.needsUpdate = true;
                matGroup.hasPartialChange = true;
            }

            if (name) matGroup.matchedName = name;

            // Update active highlight in the strip
            qpTextureStrip.querySelectorAll('.qp-tex-item').forEach(btn => {
                btn.classList.toggle('active', btn.querySelector('span')?.textContent === name);
            });

            // Store for paint mode
            qpLastTextureUrl  = url;
            qpLastTextureName = name;

            // Enable paint mode bridge after first texture is selected
            if (qpPaintMode) quickPicker.paintTap = paintTap;
        });
    }

    // ---- Paint mode: apply last texture to newly tapped surfaces ----
    function paintTap(clientX, clientY) {
        if (!qpPaintMode || !qpLastTextureUrl) return;
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2(
            (clientX / window.innerWidth) * 2 - 1,
            -(clientY / window.innerHeight) * 2 + 1
        );
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);
        if (!intersects.length) return;

        const mesh = intersects[0].object;
        const idx = detectedMaterials.findIndex(g => g.meshes.includes(mesh));
        if (idx < 0 || !detectedMaterials[idx].hasTexture) return;

        // Update highlight to new surface
        clearMeshHighlight();
        qpTappedMesh = mesh;
        highlightMesh(mesh);

        // Track change on the painted group
        const paintedGroup = detectedMaterials[idx];
        paintedGroup.hasPartialChange = true;
        if (qpLastTextureName) paintedGroup.matchedName = qpLastTextureName;

        // Apply last selected texture
        const texLoader = new THREE.TextureLoader();
        texLoader.load(qpLastTextureUrl, (tex) => {
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            tex.minFilter  = THREE.LinearMipmapLinearFilter;
            tex.magFilter  = THREE.LinearFilter;
            tex.wrapS      = THREE.RepeatWrapping;
            tex.wrapT      = THREE.RepeatWrapping;
            mesh.material.map = tex;
            mesh.material.color.set(0xffffff);
            mesh.material.needsUpdate = true;
        });
    }

    // Wire bridge so handleSingleTap (init scope) can open the picker
    quickPicker.open  = openReplaceSheet;
    quickPicker.close = closeQuickPicker;
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
        };
    }
    const panelClose = document.getElementById('showroom-panel-close');
    if (panelClose) panelClose.onclick = () => showroomPanel.classList.remove('show');

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

    // Populate initial parts
    populateKitchenParts();
    populateIslandParts();

    // Setup save config button
    if (saveConfigBtn) saveConfigBtn.onclick = saveShowroomConfig;

    // PIN modal close
    const pinModalClose = document.getElementById('pin-modal-close');
    if (pinModalClose) pinModalClose.onclick = () => {
        document.getElementById('pin-modal').style.display = 'none';
    };

    // Setup texture panel for showroom (reuse existing)
    setupTexturePanel(null, null);

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

function populateKitchenParts() {
    const kitchenCats = ['base', 'doors', 'drawers', 'crown', 'finished_ends', 'case_parts', 'wall', 'counter_top', 'floor'];
    kitchenCats.forEach(cat => {
        const selector = `#kitchen-parts .part-options[data-category="${cat}"]`;
        const container = document.querySelector(selector);
        if (!container) return;
        const parts = (showroomCategories[cat] && showroomCategories[cat][kitchenStyle]) || [];
        renderPartOptions(container, cat, kitchenStyle, parts);
    });
}

function populateIslandParts() {
    const container = document.querySelector(`#island-parts .part-options[data-category="island"]`);
    if (!container) return;
    const parts = (showroomCategories.island && showroomCategories.island[islandStyle]) || [];
    renderPartOptions(container, 'island', islandStyle, parts);
}

function renderPartOptions(container, category, style, parts) {
    container.innerHTML = '';
    if (parts.length === 0) {
        const span = document.createElement('span');
        span.className = 'part-options-empty';
        span.textContent = 'No parts available';
        container.appendChild(span);
        return;
    }
    parts.forEach(part => {
        const btn = document.createElement('button');
        btn.className = 'part-option-btn';
        btn.textContent = part.name;
        btn.dataset.file = part.file;

        // Check if already active
        const current = showroomParts[category];
        if (current && current.file === part.file && current.style === style) {
            btn.classList.add('active');
        }

        btn.onclick = () => loadShowroomPart(category, style, part.file, btn);
        container.appendChild(btn);
    });
}

async function loadShowroomPart(category, style, file, btnEl) {
    if (!renderer) return;
    if (btnEl) {
        // Deactivate siblings
        btnEl.parentElement.querySelectorAll('.part-option-btn').forEach(b => b.classList.remove('active'));
        btnEl.classList.add('active', 'loading');
    }

    // Remove previous part for this category
    if (showroomParts[category]) {
        // If removing finished_ends, restore hidden base meshes
        if (category === 'finished_ends') {
            restoreBasePaneledEndMeshes();
        }
        scene.remove(showroomParts[category].group);
        // Remove materials from tracking
        const oldMeshes = new Set();
        showroomParts[category].group.traverse(c => { if (c.isMesh) oldMeshes.add(c); });
        detectedMaterials = detectedMaterials.filter(m => !m.meshes.some(mesh => oldMeshes.has(mesh)));
        kitchenMaterials = kitchenMaterials.filter(m => !m.meshes.some(mesh => oldMeshes.has(mesh)));
        islandMaterials = islandMaterials.filter(m => !m.meshes.some(mesh => oldMeshes.has(mesh)));
        delete showroomParts[category];
    }

    // Load tags
    let tagData = null;
    try {
        const tagsResp = await fetch(`/api/showroom/tags/${encodeURIComponent(category)}/${encodeURIComponent(style)}/${encodeURIComponent(file)}`);
        if (tagsResp.ok) {
            const td = await tagsResp.json();
            if (td.success) tagData = td.tags;
        }
    } catch { /* no tags */ }

    // Load GLB
    const glbUrl = `/showroom/${encodeURIComponent(category)}/${encodeURIComponent(style)}/${encodeURIComponent(file)}`;
    const loader = new GLTFLoader();

    // Ensure background is correct
    if (scene) scene.background = new THREE.Color(0x111111);

    return new Promise((resolve) => {
        loader.load(glbUrl, (gltf) => {
            const group = gltf.scene;
            const materialMap = new Map();
            const isIsland = (category === 'island');

            let meshIdx = 0;
            group.traverse((child) => {
                if (!child.isMesh) return;

                // Standardize node name for index-based tag matching
                if (!child.name || child.name.startsWith('Mesh_') || child.name.startsWith('Node_')) {
                    child.name = `Node_${meshIdx}`;
                }
                meshIdx++;

                // Tag-based visibility: hide meshes not tagged for this category
                if (tagData && tagData.taggedMeshes) {
                    const meshName = child.name || '';
                    if (!tagData.taggedMeshes.includes(meshName)) {
                        child.visible = false;
                        return;
                    }
                }

                const prevMat = child.material;
                const hasTexture = !!prevMat.map;

                // Check if texture should be stripped (not in Hidden folder)
                // In showroom mode, strip ALL textures to milky gray
                // Hidden textures are identified post-matching, so for now strip all
                child.material = new THREE.MeshLambertMaterial({
                    color: MILKY_GRAY,
                    side: THREE.DoubleSide,
                    polygonOffset: true,
                    polygonOffsetFactor: 1,
                    polygonOffsetUnits: 1
                });

                if (hasTexture) {
                    const texSrc = prevMat.map?.image?.src || prevMat.map?.uuid || `tex_${materialMap.size}`;
                    if (materialMap.has(texSrc)) {
                        materialMap.get(texSrc).meshes.push(child);
                    } else {
                        materialMap.set(texSrc, {
                            name: prevMat.name || child.name || `Material_${materialMap.size}`,
                            material: child.material,
                            meshes: [child],
                            hasTexture: true,
                            originalMap: null, // stripped
                            originalColor: new THREE.Color(MILKY_GRAY),
                            matchedName: null,
                            originalMatchedName: null,
                            isHidden: false,
                            isIsland: isIsland,
                            showroomCategory: category
                        });
                    }
                }
            });

            const newMaterials = Array.from(materialMap.values());
            detectedMaterials.push(...newMaterials);
            if (isIsland) {
                islandMaterials.push(...newMaterials);
            } else {
                kitchenMaterials.push(...newMaterials);
            }

            scene.add(group);
            showroomParts[category] = { group, style, file, tagData };

            // Paneled ends: when loading a finished_ends part that is a paneled end,
            // hide the base cabinet meshes marked as paneled_end_replaceable
            if (category === 'finished_ends') {
                handlePaneledEndSwap(file);
            }

            // Reframe camera around all loaded parts
            reframeShowroomCamera();

            if (btnEl) btnEl.classList.remove('loading');
            resolve();
        }, undefined, (err) => {
            console.error(`Failed to load showroom part: ${category}/${style}/${file}`, err);
            if (btnEl) btnEl.classList.remove('loading');
            resolve();
        });
    });
}

// --- PANELED END REPLACEMENT LOGIC ---

function handlePaneledEndSwap(finishedEndsFile) {
    // Check if this is a paneled end file (from doors split)
    const isPaneledEnd = /_paneled_ends\.glb$/i.test(finishedEndsFile);
    if (!isPaneledEnd) {
        // Loading plain finished ends — restore any hidden base meshes
        restoreBasePaneledEndMeshes();
        return;
    }

    // It's a paneled end — hide the base cabinet's replaceable meshes
    const basePart = showroomParts['base'];
    if (!basePart || !basePart.tagData || !basePart.tagData.paneledEndReplacements) return;

    const replaceableNames = new Set(basePart.tagData.paneledEndReplacements);
    basePart.group.traverse(child => {
        if (child.isMesh && replaceableNames.has(child.name)) {
            child.visible = false;
            child.userData._hiddenByPaneledEnd = true;
        }
    });
}

function restoreBasePaneledEndMeshes() {
    const basePart = showroomParts['base'];
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

    // Record selected parts
    for (const [cat, part] of Object.entries(showroomParts)) {
        const section = cat === 'island' ? config.island : config.kitchen;
        section.parts[cat] = { style: part.style, file: part.file };
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
            if (pinModal) pinModal.style.display = '';
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
        for (const [cat, partInfo] of Object.entries(allParts)) {
            loadPromises.push(loadShowroomPart(cat, partInfo.style, partInfo.file, null));
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

// --- SOLID COLOR SUPPORT ---

const COLOR_PRESETS = [
    { name: 'White', hex: '#FFFFFF' },
    { name: 'Cream', hex: '#F5F0E1' },
    { name: 'Navy', hex: '#1B2A4A' },
    { name: 'Sage Green', hex: '#9CAF88' },
    { name: 'Charcoal', hex: '#36454F' },
    { name: 'Black', hex: '#1C1C1C' },
    { name: 'Dove Gray', hex: '#B0B0B0' },
    { name: 'Warm Taupe', hex: '#B39B86' }
];

function getRecentColors() {
    try {
        return JSON.parse(localStorage.getItem('kkc_recent_colors') || '[]').slice(0, 10);
    } catch { return []; }
}

function addRecentColor(hex) {
    let recent = getRecentColors().filter(c => c !== hex);
    recent.unshift(hex);
    if (recent.length > 10) recent = recent.slice(0, 10);
    localStorage.setItem('kkc_recent_colors', JSON.stringify(recent));
}

function applySolidColor(matGroup, hexColor) {
    const color = new THREE.Color(hexColor);
    matGroup.meshes.forEach(mesh => {
        mesh.material.map = null;
        mesh.material.color.copy(color);
        mesh.material.needsUpdate = true;
    });
    // Parse RGB for display
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    matGroup.matchedName = `RGB(${r},${g},${b})`;
    matGroup.isColor = true;
    matGroup.colorHex = hexColor;
    addRecentColor(hexColor);
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
