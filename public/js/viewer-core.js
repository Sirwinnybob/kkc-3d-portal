import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { state, SETTINGS, updateStatus, manager, customUrl, loadPin } from './viewer-state.js';
import { highlightMesh, clearMeshHighlight, updateLodState } from './viewer-materials.js';
import { openReplaceSheet } from './viewer-ui.js';

const KKCShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "amount": { value: 0.15 }
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
        uniform float amount;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D(tDiffuse, vUv);
            // Slightly warm up colors and increase contrast
            color.rgb = color.rgb * vec3(1.05, 1.02, 0.98);
            float luminance = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            color.rgb = mix(vec3(luminance), color.rgb, 1.2);
            gl_FragColor = color;
        }
    `
};

export function initEngine(containerId) {
    const container = document.getElementById(containerId) || document.body;

    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(0xf3f4f6); // gray-100

    state.camera = new THREE.PerspectiveCamera(
        SETTINGS.cameraFov,
        window.innerWidth / window.innerHeight,
        SETTINGS.cameraNear,
        SETTINGS.cameraFar
    );
    state.camera.position.set(0, 50, 100);

    state.renderer = new THREE.WebGLRenderer({ antialias: false }); // False for Composer
    state.renderer.setSize(window.innerWidth, window.innerHeight);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    state.renderer.shadowMap.enabled = true;
    state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    state.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    state.renderer.toneMappingExposure = 1.0;

    const canvas = state.renderer.domElement;
    canvas.id = 'main-canvas';
    canvas.tabIndex = "0";
    canvas.setAttribute('aria-label', "3D Viewer Canvas. Use arrow keys to rotate, plus and minus keys to zoom.");
    container.appendChild(canvas);

    window.scene = state.scene; // Global debugging

    state.controls = new OrbitControls(state.camera, canvas);
    state.controls.enableDamping = true;
    state.controls.dampingFactor = 0.05;
    state.controls.minDistance = SETTINGS.minZoom;
    state.controls.maxDistance = SETTINGS.maxZoom;
    state.controls.maxPolarAngle = Math.PI / 2 + 0.1;
    state.controls.listenToKeyEvents(window);

    setupLighting();
    setupPostProcessing(canvas);
    setupInteractions(canvas);
    setupLightMode();

    window.addEventListener('resize', onWindowResize);

    // Animation loop
    state.renderer.setAnimationLoop(() => {
        updateLodState(state.camera, state.renderer);

        if (state.zoomVelocity !== 0 && state.camera && state.controls) {
            const direction = new THREE.Vector3();
            state.camera.getWorldDirection(direction);
            const dist = state.camera.position.distanceTo(state.controls.target);
            if (!(state.zoomVelocity > 0 && dist < 0.5)) {
                state.camera.position.addScaledVector(direction, state.zoomVelocity * state.controls.zoomSpeed);
            }
            state.zoomVelocity *= 0.9;
            if (Math.abs(state.zoomVelocity) < 0.01) state.zoomVelocity = 0;
        }

        state.controls.update();
        if (state.composer) state.composer.render();
    });

    return { scene: state.scene, camera: state.camera, renderer: state.renderer, controls: state.controls };
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, SETTINGS.ambientIntensity);
    state.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, SETTINGS.directionalIntensity);
    mainLight.position.set(50, 100, 50);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = SETTINGS.shadowMapSize;
    mainLight.shadow.mapSize.height = SETTINGS.shadowMapSize;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 500;
    mainLight.shadow.bias = SETTINGS.shadowBias;

    const d = 100;
    mainLight.shadow.camera.left = -d;
    mainLight.shadow.camera.right = d;
    mainLight.shadow.camera.top = d;
    mainLight.shadow.camera.bottom = -d;
    state.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0xe0ebff, 0.5);
    fillLight.position.set(-50, 50, -50);
    state.scene.add(fillLight);
}

function setupPostProcessing(canvas) {
    state.composer = new EffectComposer(state.renderer);
    state.composer.addPass(new RenderPass(state.scene, state.camera));

    const kkcPass = new ShaderPass(KKCShader);
    state.composer.addPass(kkcPass);

    const fxaaPass = new ShaderPass(FXAAShader);
    const pixelRatio = state.renderer.getPixelRatio();
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (canvas.offsetWidth * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (canvas.offsetHeight * pixelRatio);
    state.composer.addPass(fxaaPass);
    state.composer.addPass(new OutputPass());

    state.fxaaPass = fxaaPass;
}

function setupInteractions(canvas) {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    function getIntersect(event) {
        if (!state.scene || !state.camera) return null;
        const rect = canvas.getBoundingClientRect();
        let clientX = event.clientX;
        let clientY = event.clientY;
        if (event.changedTouches && event.changedTouches.length > 0) {
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        }
        mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, state.camera);
        const intersects = raycaster.intersectObjects(state.scene.children, true);

        for (const intersect of intersects) {
            if (intersect.object.isMesh && intersect.object.visible) {
                if (state.isShowroomMode && !customUrl) {
                    if (!intersect.object.userData.meshCategories) continue;
                }
                return intersect;
            }
        }
        return null;
    }

    let lastTapTime = 0;
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            return;
        }
        if (e.touches.length === 1) {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTapTime;

            if (tapLength < 300 && tapLength > 0) {
                const intersect = getIntersect(e);
                if (intersect) {
                    e.preventDefault();
                    clearMeshHighlight();
                    let matIndex = state.detectedMaterials.findIndex(m => m.meshes.includes(intersect.object));
                    if (matIndex !== -1) {
                        openReplaceSheet(matIndex, intersect.object);
                    }
                }
            } else {
                const intersect = getIntersect(e);
                if (intersect) highlightMesh(intersect.object);
                else clearMeshHighlight();
            }
            lastTapTime = currentTime;
        }
    }, { passive: false });

    canvas.addEventListener('dblclick', (e) => {
        const intersect = getIntersect(e);
        if (intersect) {
            clearMeshHighlight();
            let matIndex = state.detectedMaterials.findIndex(m => m.meshes.includes(intersect.object));
            if (matIndex !== -1) {
                openReplaceSheet(matIndex, intersect.object);
            }
        }
    });

    canvas.addEventListener('click', (e) => {
        const intersect = getIntersect(e);
        if (intersect) highlightMesh(intersect.object);
        else clearMeshHighlight();
    });
}

function onWindowResize() {
    if (!state.camera || !state.renderer || !state.composer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;

    state.camera.aspect = width / height;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(width, height);
    state.composer.setSize(width, height);

    if (state.fxaaPass) {
        const pixelRatio = state.renderer.getPixelRatio();
        state.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * pixelRatio);
        state.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * pixelRatio);
    }
}

function setupLightMode() {
    const lightModeBtn = document.getElementById('light-mode-btn');
    if (lightModeBtn) {
        const updateLightModeUI = () => {
            const isLightMode = localStorage.getItem("lightMode") === "true";
            if (isLightMode) {
                lightModeBtn.style.background = '#e0e0e0';
            } else {
                lightModeBtn.style.background = '#fff';
            }
        };

        lightModeBtn.addEventListener('click', () => {
            const isLightMode = localStorage.getItem("lightMode") === "true";
            const newMode = !isLightMode;
            localStorage.setItem("lightMode", newMode);

            if (state.scene) {
                state.scene.background = new THREE.Color(newMode ? 0xf0f0f0 : 0x111111);
            }
            updateLightModeUI();
        });

        updateLightModeUI();
    }
}
