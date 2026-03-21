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

const SETTINGS = {
    exposure:      1.75,
    saturation:    0.65,
    contrast:      1.25,
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

const statusEl = document.getElementById('status');
const updateStatus = (msg, isError = false) => {
    if (statusEl) {
        statusEl.innerText = msg;
        statusEl.style.color = isError ? "#ff4d4d" : "#007bff";
    }
};

async function init() {
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

    // AUTO-SHOW HELP: If it's their first time in the viewer on this device, show the controls modal
    if (localStorage.getItem('kkc_help_shown') !== 'true') {
        toggleHelp(true);
        localStorage.setItem('kkc_help_shown', 'true');
    }

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

        // --- DOUBLE TAP / CLICK PIVOT ---
        let lastTap = 0;
        let tapPos = new THREE.Vector2();
        const handleDoubleInteraction = (e) => {
            if (e.pointerType === 'touch' && !e.isPrimary) return; 
            const now = Date.now();
            const dist = tapPos.distanceTo(new THREE.Vector2(e.clientX, e.clientY));
            if (now - lastTap < 300 && dist < 10) {
                const raycaster = new THREE.Raycaster();
                const mouse = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObjects(scene.children, true);
                if (intersects.length > 0) {
                    controls.target.copy(intersects[0].point);
                    controls.update();
                }
            }
            lastTap = now;
            tapPos.set(e.clientX, e.clientY);
        };
        renderer.domElement.addEventListener('pointerdown', (e) => handleDoubleInteraction(e));

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
                    const logoY = targetHeight - logoHeight - padding;
                    ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);

                    ctx.fillStyle = 'white';
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = Math.max(2, 4 * logoScale);
                    
                    // Adjust font size based on scale
                    const fontSize = Math.round(80 * logoScale);
                    ctx.font = `bold ${fontSize}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
                    ctx.textBaseline = 'bottom';

                    const textX = logoX + logoWidth + (20 * logoScale);
                    const textY = targetHeight - padding;
                    const textContent = `Job: ${jobCode} | Room: ${initialRoom}`;

                    // Safety check: if text is too wide, shrink it
                    const metrics = ctx.measureText(textContent);
                    if (textX + metrics.width > targetWidth - padding) {
                        const maxTextWidth = targetWidth - textX - padding;
                        const scaleFactor = maxTextWidth / metrics.width;
                        ctx.font = `bold ${Math.floor(fontSize * scaleFactor)}px "Segoe UI", Tahoma, Geneva, Verdana, sans-serif`;
                    }

                    ctx.strokeText(textContent, textX, textY);
                    ctx.fillText(textContent, textX, textY);
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
