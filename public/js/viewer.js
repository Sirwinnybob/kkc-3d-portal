// Resolved via importmap in viewer.html
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

let scene, camera, renderer, controls, composer, kkcShader, fxaaPass;
let zoomVelocity = 0;
let detectedMaterials = [];
let selectedMaterialIndex = -1;
let loadedModel = null;

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
    const jobCode    = urlParams.get('job');
    const initialRoom = urlParams.get('room');

    if (!jobCode || !initialRoom) { window.location.href = '/'; return; }

    const jobDisplay = document.getElementById('job-code-display');
    const roomDisplay = document.getElementById('room-name-display');
    if (jobDisplay) jobDisplay.innerText = jobCode;
    if (roomDisplay) roomDisplay.innerText = initialRoom;

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

        // --- THREE.JS SETUP ---
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111111);
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 5000); // Reduced near plane to 0.01 to allow closer viewing
        
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
        // Higher ambient so no angle goes dark
        scene.add(new THREE.AmbientLight(0xffffff, li * 1.2));

        // Camera-attached key light (follows view)
        const makeCamLight = (intensity, px, py, pz) => {
            const light  = new THREE.DirectionalLight(0xffffff, intensity);
            const target = new THREE.Object3D();
            light.position.set(px, py, pz);
            camera.add(light);
            camera.add(target);
            light.target = target;
        };
        makeCamLight(li * 0.5,  1,  1,  1);

        // World-space fill lights — fixed in scene so all angles stay lit
        // Lights are angled more horizontally (2:1 ratio) to reduce over-brightening
        // of upward-facing horizontal surfaces vs vertical surfaces
        const makeSceneLight = (intensity, px, py, pz) => {
            const light = new THREE.DirectionalLight(0xffffff, intensity);
            light.position.set(px, py, pz);
            scene.add(light);
        };
        makeSceneLight(li * 0.22,  2,  1,  0);
        makeSceneLight(li * 0.22, -2,  1,  0);
        makeSceneLight(li * 0.22,  0,  1,  2);
        makeSceneLight(li * 0.22,  0,  1, -2);
        makeSceneLight(li * 0.2,   0, -1,  0); // under-fill

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

        // --- SENSITIVITY SLIDER ONLY ---
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

        // --- SURFACE HIGHLIGHT ---
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
                        const orig = mat.originalMatchedName;
                        const curr = mat.matchedName;
                        if (!orig || !curr || orig === curr) continue;
                        const prefix = mat.hasPartialChange ? 'PARTIAL ' : '';
                        changeLines.push(`${prefix}${orig} \u21c4 ${curr}`);
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
                    const textContent = `Job: ${jobCode} | Room: ${initialRoom}`;
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
                a.download = `KKC_${jobCode}_${initialRoom.replace(/ /g, '_')}.jpg`;
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
                    materialList.innerHTML = `<div style="padding:20px; text-align:center; color:#888;">${isMatchingAll ? 'Matching textures...' : 'No customizable textures found.'}</div>`;
                    return;
                }

                visibleMaterials.forEach((mat) => {
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
                                <span class="material-name">${displayName}</span>
                                <span class="material-status">Customizable</span>
                            </div>
                        </div>
                        <span class="material-badge">Has Texture</span>
                    `;
                    // Find actual index in detectedMaterials for selectMaterial
                    const originalIndex = detectedMaterials.indexOf(mat);
                    btn.onclick = () => selectMaterial(originalIndex);
                    materialList.appendChild(btn);
                });
                document.getElementById('materials-view').style.display = 'block';
                document.getElementById('catalog-view').style.display = 'none';
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
                    btn.setAttribute('aria-label', `Select texture ${tex.name}`);
                    btn.innerHTML = `<img src="${tex.url}" alt="${tex.name}" loading="lazy"><span>${tex.name}</span>`;
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
                qpCategoryGrid.innerHTML = '<div style="color:rgba(255,255,255,0.4);padding:20px;text-align:center;grid-column:1/-1;font-size:0.9em;">Loading…</div>';
                try {
                    const resp = await fetch('/api/textures');
                    const data = await resp.json();
                    if (!data.success) throw new Error();
                    qpCategoryGrid.innerHTML = '';
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
                    qpCategoryGrid.innerHTML = '<div style="color:#f87171;padding:20px;text-align:center;grid-column:1/-1;">Failed to load categories</div>';
                }
            }

            async function loadQpCategoryTextures(category, mat) {
                qpTitle.textContent = category;
                showQpTexturesView();
                qpTextureStrip.innerHTML = '<div style="color:rgba(255,255,255,0.4);padding:20px;display:flex;align-items:center;">Loading…</div>';
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
                    qpTextureStrip.innerHTML = '<div style="color:#f87171;padding:20px;">Failed to load textures</div>';
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
                    btn.innerHTML = `<img src="${tex.url}" alt="${tex.name}" loading="lazy"><span>${tex.name}</span>`;
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

    } catch (e) {
        console.error(e);
        updateStatus("Connection Error", true);
    }

    window.addEventListener('resize', onWindowResize);
    animate();
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
