import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class CoreEngine {
    constructor(config = {}) {
        this.config = Object.assign({
            containerId: 'canvas-container',
            isLightMode: false,
            fov: 45,
            exposure: 1.15,
            saturation: 0.65,
            contrast: 1.50,
            lightIntensity: 1.0,
            gloss: 0.10,
            colorTemp: 0.5,
            onBeforeRender: null
        }, config);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(this.config.isLightMode ? 0xf0f0f0 : 0x111111);

        this.camera = new THREE.PerspectiveCamera(this.config.fov, window.innerWidth / window.innerHeight, 0.01, 5000);

        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: "high-performance",
            logarithmicDepthBuffer: true,
            preserveDrawingBuffer: true
        });

        const dpr = Math.min(window.devicePixelRatio, 2);
        this.renderer.setPixelRatio(dpr);
        this.renderer.setSize(window.innerWidth, window.innerHeight);

        const canvasContainer = document.getElementById(this.config.containerId);
        if (canvasContainer) {
            canvasContainer.appendChild(this.renderer.domElement);
            this.renderer.domElement.id = 'main-canvas';
            this.renderer.domElement.setAttribute('tabindex', '0');
            this.renderer.domElement.setAttribute('aria-label', '3D Model Viewer. Use arrow keys to rotate, shift + arrow keys to pan, and plus or minus keys to zoom.');
        }

        this.scene.add(this.camera);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.listenToKeyEvents(window);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.25;

        this._setupLighting();
        this._setupPostProcessing(dpr);

        window.addEventListener('resize', this._onWindowResize.bind(this));
    }

    _setupLighting() {
        const li = this.config.lightIntensity;
        this.scene.add(new THREE.AmbientLight(0xffffff, li * 1.2));

        const makeCamLight = (intensity, px, py, pz) => {
            const light  = new THREE.DirectionalLight(0xffffff, intensity);
            const target = new THREE.Object3D();
            light.position.set(px, py, pz);
            this.camera.add(light);
            this.camera.add(target);
            light.target = target;
        };
        makeCamLight(li * 0.5,  1,  1,  1);

        const makeSceneLight = (intensity, px, py, pz) => {
            const light = new THREE.DirectionalLight(0xffffff, intensity);
            light.position.set(px, py, pz);
            this.scene.add(light);
        };
        makeSceneLight(li * 0.22,  2,  1,  0);
        makeSceneLight(li * 0.22, -2,  1,  0);
        makeSceneLight(li * 0.22,  0,  1,  2);
        makeSceneLight(li * 0.22,  0,  1, -2);
        makeSceneLight(li * 0.2,   0, -1,  0);
    }

    _setupPostProcessing(dpr) {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        const KKCShader = {
            uniforms: {
                "tDiffuse":    { value: null },
                "uExposure":   { value: this.config.exposure },
                "uSaturation": { value: this.config.saturation },
                "uContrast":   { value: this.config.contrast },
                "uColorTemp":  { value: this.config.colorTemp }
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

        this.kkcShader = new ShaderPass(KKCShader);
        this.composer.addPass(this.kkcShader);

        this.fxaaPass = new ShaderPass(FXAAShader);
        this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (window.innerWidth * dpr);
        this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (window.innerHeight * dpr);
        this.composer.addPass(this.fxaaPass);

        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
    }

    _onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const dpr = this.renderer.getPixelRatio();

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.composer.setSize(width, height);

        if (this.fxaaPass) {
            this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * dpr);
            this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * dpr);
        }
    }

    setResolution(width, height, dpr) {
        this.renderer.setPixelRatio(dpr || 1);
        this.renderer.setSize(width, height, false);
        this.composer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        if (this.fxaaPass) {
            const actualDpr = this.renderer.getPixelRatio();
            this.fxaaPass.material.uniforms['resolution'].value.x = 1 / (width * actualDpr);
            this.fxaaPass.material.uniforms['resolution'].value.y = 1 / (height * actualDpr);
        }
    }

    start() {
        const animate = (time) => {
            requestAnimationFrame(animate);

            if (this.config.onBeforeRender) {
                this.config.onBeforeRender(time);
            }

            if (this.controls) this.controls.update();
            if (this.composer) this.composer.render();
        };
        requestAnimationFrame(animate);
    }
}
