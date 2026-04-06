const fs = require('fs');

let content = fs.readFileSync('public/js/viewer.js', 'utf8');

// 1. Add import for CoreEngine
content = content.replace(
    "import { ShowroomManager } from './showroomManager.js';",
    "import { ShowroomManager } from './showroomManager.js';\nimport { CoreEngine } from './engine.js';"
);

// 2. Remove globally declared variables that are now in CoreEngine
content = content.replace(
    "let scene, camera, renderer, controls, composer, kkcShader, fxaaPass;\nwindow.scene = scene;",
    "let scene, camera, renderer, controls, composer, kkcShader, fxaaPass, engine;\nwindow.scene = scene;"
);

// 3. Remove SETTINGS and KKCShader definitions (lines 62-108 approx)
content = content.replace(/const SETTINGS = \{[\s\S]*?\n\};/, '');
content = content.replace(/const KKCShader = \{[\s\S]*?gl_FragColor = vec4\(color, tex\.a\);\n\s*\}\n\s*`\n\};/, '');

// 4. In `init()`, replace Three.js setup with `CoreEngine` initialization
const setupToReplace = `        // --- THREE.JS SETUP (shared by standard and showroom modes) ---
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
        composer.addPass(outputPass);`;

const newSetup = `        // --- CORE ENGINE SETUP ---
        engine = new CoreEngine({
            containerId: 'canvas-container',
            isLightMode: localStorage.getItem("lightMode") === "true",
            onBeforeRender: (time) => {
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
            }
        });

        scene = engine.scene;
        camera = engine.camera;
        renderer = engine.renderer;
        controls = engine.controls;
        composer = engine.composer;
        kkcShader = engine.kkcShader;
        fxaaPass = engine.fxaaPass;
        window.scene = scene;`;

content = content.replace(setupToReplace, newSetup);

// 5. Remove manual resize and animate loops from viewer.js
content = content.replace("window.addEventListener('resize', onWindowResize);\n    animate();", "engine.start();");

// Replace onWindowResize function and animate function definitions
const oldLoopRegex = /function onWindowResize\(\) \{[\s\S]*?\}\n\nfunction animate\(\) \{[\s\S]*?\}\n\nif \(document\.readyState/m;
content = content.replace(oldLoopRegex, "if (document.readyState");

// 6. Update Photo Render Resolution code
const oldResLogic = `                // Resolution logic: Native for mobile (safer), 4K for PC
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
                }`;
const newResLogic = `                // Resolution logic: Native for mobile (safer), 4K for PC
                const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth <= 800 && window.innerHeight <= 1000);
                const targetWidth = isMobile ? Math.min(window.innerWidth * window.devicePixelRatio, 3000) : 3840;
                const targetHeight = Math.round(targetWidth / origAspect);

                // Set new resolution
                engine.setResolution(targetWidth, targetHeight, 1);`;
content = content.replace(oldResLogic, newResLogic);

const oldResRestore = `                // Restore original state immediately to prevent flicker
                renderer.setPixelRatio(origDpr);
                renderer.setSize(origWidth, origHeight);
                composer.setSize(origWidth, origHeight);
                camera.aspect = origAspect;
                camera.updateProjectionMatrix();

                if (fxaaPass) {
                    fxaaPass.material.uniforms['resolution'].value.x = 1 / (origWidth * origDpr);
                    fxaaPass.material.uniforms['resolution'].value.y = 1 / (origHeight * origDpr);
                }`;
const newResRestore = `                // Restore original state immediately to prevent flicker
                engine.setResolution(origWidth, origHeight, origDpr);`;
content = content.replace(oldResRestore, newResRestore);

fs.writeFileSync('public/js/viewer.js', content);
console.log("Patch applied.");
