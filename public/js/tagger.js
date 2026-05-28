import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { escapeHtml } from './utils.js';

let scene, camera, renderer, controls, composer, kkcShader, fxaaPass;
let loadedModel = null;
let meshEntries = []; // { name, mesh, tag: 'tagged'|'ignore'|null, selected: false }
let categoriesData = {};
let currentMode = 'staging'; // 'staging' | 'category'
let hiddenMeshes = new Set();
const meshToEntry = new Map();
const selectedEntries = new Set();

const statusText = document.getElementById('status-text');
const updateStatus = (msg) => { if (statusText) statusText.innerText = msg; };

// ---------- Hierarchy constants (mirrors server.js) ----------
const OVERLAY_CATEGORIES = ['doors', 'drawer_fronts'];
const NON_OVERLAY_CATEGORIES = ['finished_ends'];
const DIRECT_CATEGORIES = ['base', 'crown', 'drawers', 'case_parts', 'wall', 'counter_top', 'floor'];
const ALL_STYLE_CATEGORIES = [...OVERLAY_CATEGORIES, ...NON_OVERLAY_CATEGORIES];
const SUB_CATEGORIES = {
    doors: ['shaker', 'slab'],
    drawer_fronts: ['shaker', 'slab'],
    finished_ends: ['flat', 'paneled']
};
const GRAIN_DIRS = ['horizontal', 'vertical'];

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

            // Shadow lift: prevents dark textures from crushing to black
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

const CATEGORY_COLORS = {
    base: new THREE.Color(0x4CAF50),
    doors: new THREE.Color(0x2196F3),
    crown: new THREE.Color(0xFF9800),
    drawers: new THREE.Color(0x9C27B0),
    finished_ends: new THREE.Color(0x00BCD4),
    case_parts: new THREE.Color(0x795548),
    wall: new THREE.Color(0x607D8B),
    counter_top: new THREE.Color(0xFFC107),
    floor: new THREE.Color(0x8BC34A),
    drawer_fronts: new THREE.Color(0x9C27B0),
    ignore: new THREE.Color(0xdc3545),
    tagged: new THREE.Color(0x28a745),
    null: new THREE.Color(0x888888)
};

// ============================================================
// INIT
// ============================================================
async function init() {
    try {
        const resp = await fetch('/api/showroom/categories');
        const data = await resp.json();
        if (data.success) categoriesData = data.categories;
    } catch { updateStatus('Failed to load showroom data'); }

    await loadStagingFileList();
    initCategoryModeDropdowns();

    // --- Three.js Setup ---
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 5000);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
    const dpr = Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x111111);
    container.appendChild(renderer.domElement);

    scene.add(camera);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    kkcShader = new ShaderPass(KKCShader);
    composer.addPass(kkcShader);
    fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (container.clientWidth * dpr);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (container.clientHeight * dpr);
    composer.addPass(fxaaPass);
    composer.addPass(new OutputPass());

    // Lighting
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
    makeCamLight(li * 0.5, 1, 1, 1);
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

    // Mode tabs
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.onclick = () => switchMode(tab.dataset.mode);
    });

    // Staging mode buttons & controls
    document.getElementById('btn-load-staging').onclick = loadStagingGlb;
    document.getElementById('btn-auto-parse').onclick = autoParse;
    document.getElementById('btn-split-deploy').onclick = splitAndDeploy;

    // Context toggle buttons
    document.querySelectorAll('.toggle-btn[data-context]').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.toggle-btn[data-context]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
    });

    // Style → show/hide overlay
    document.getElementById('sel-staging-style').onchange = updateOverlayVisibility;
    updateOverlayVisibility();

    // Category mode buttons
    document.getElementById('btn-load').onclick = loadCategoryGlb;
    document.getElementById('btn-save').onclick = saveCategoryTags;

    // Show hidden toggle
    document.getElementById('chk-show-hidden').onchange = (e) => {
        meshEntries.forEach(entry => {
            if (hiddenMeshes.has(entry.name)) {
                entry.mesh.visible = e.target.checked;
                if (e.target.checked) {
                    entry.mesh.material.transparent = true;
                    entry.mesh.material.opacity = 0.2;
                    entry.mesh.material.wireframe = true;
                } else {
                    entry.mesh.visible = false;
                }
            }
        });
    };

    renderer.domElement.addEventListener('click', onCanvasClick);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); });
    document.addEventListener('mousedown', (e) => {
        const popup = document.getElementById('mesh-popup');
        if (popup.style.display !== 'none' && !popup.contains(e.target) && e.target !== renderer.domElement) {
            closePopup();
        }
    });

    window.addEventListener('resize', () => {
        const container = document.getElementById('canvas-container');
        const dpr = renderer.getPixelRatio();
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
        composer.setSize(container.clientWidth, container.clientHeight);
        if (fxaaPass) {
            fxaaPass.material.uniforms['resolution'].value.x = 1 / (container.clientWidth * dpr);
            fxaaPass.material.uniforms['resolution'].value.y = 1 / (container.clientHeight * dpr);
        }
    });

    animate();
}

// ============================================================
// MODE SWITCHING
// ============================================================
function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`${mode}-panel`).classList.add('active');
}

// ============================================================
// OVERLAY VISIBILITY HELPERS
// ============================================================
function updateOverlayVisibility() {
    const style = document.getElementById('sel-staging-style').value;
    document.getElementById('overlay-section').style.display = style === 'face_frame' ? 'block' : 'none';
}

function updateCatOverlayVisibility() {
    const style = document.getElementById('cat-sel-style').value;
    const cat   = document.getElementById('cat-sel-category').value;
    // Show overlay section only for face_frame + overlay categories
    const needsOverlay = style === 'face_frame' && OVERLAY_CATEGORIES.includes(cat);
    document.getElementById('cat-overlay-section').style.display = needsOverlay ? 'block' : 'none';
    // Sub-category
    const subs = SUB_CATEGORIES[cat];
    const subSec = document.getElementById('cat-subcategory-section');
    if (subs) {
        const selSub = document.getElementById('cat-sel-subcategory');
        selSub.innerHTML = subs.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s.replace(/_/g, ' '))}</option>`).join('');
        subSec.style.display = 'block';
        updateCatGrainVisibility();
    } else {
        subSec.style.display = 'none';
        document.getElementById('cat-grain-section').style.display = 'none';
    }
}

function updateCatGrainVisibility() {
    const cat = document.getElementById('cat-sel-category').value;
    const sub = document.getElementById('cat-sel-subcategory')?.value;
    // Grain only for slab doors
    const needsGrain = (cat === 'doors' || cat === 'drawer_fronts') && sub === 'slab';
    document.getElementById('cat-grain-section').style.display = needsGrain ? 'block' : 'none';
}

// ============================================================
// STAGING MODE
// ============================================================
async function loadStagingFileList() {
    try {
        const resp = await fetch('/api/showroom/staging');
        const data = await resp.json();
        if (!data.success) return;
        const sel = document.getElementById('sel-staging-file');
        sel.innerHTML = '<option value="">-- Select --</option>' +
            data.files.map(f => `<option value="${escapeHtml(f.file)}">${escapeHtml(f.name)}${f.tagged ? ' (tagged)' : ''}</option>`).join('');
    } catch { /* ignore */ }
}

async function loadStagingGlb() {
    const file = document.getElementById('sel-staging-file').value;
    if (!file) { updateStatus('Select a staged file first'); return; }

    updateStatus('Loading staged GLB...');
    clearScene();

    let serverMeshNames = [];
    try {
        const meshResp = await fetch(`/api/showroom/staging/meshes/${encodeURIComponent(file)}`);
        const meshData = await meshResp.json();
        if (meshData.success) serverMeshNames = meshData.meshes;
    } catch { /* fallback */ }

    const glbUrl = `/showroom/staging/${encodeURIComponent(file)}`;

    let existingTags = null;
    try {
        const baseName = file.replace(/\.glb$/i, '');
        const tagsResp = await fetch(`/api/showroom/staging/tags/${encodeURIComponent(baseName)}`);
        if (tagsResp.ok) {
            const tagsData = await tagsResp.json();
            if (tagsData.success) existingTags = tagsData.tags;
        }
    } catch { /* no existing tags */ }

    // Optimization: Use a Map for O(1) mesh name lookups instead of O(N) .find() inside the traversal loop.
    // This reduces loading complexity from O(M*N) to O(M+N), where M is meshes and N is server names.
    const serverNameMap = new Map();
    serverMeshNames.forEach((name, idx) => { if (!serverNameMap.has(name)) serverNameMap.set(name, idx); });

    loadGlbFromUrl(glbUrl, (entry, originalIndex) => {
        const idx1 = serverNameMap.get(entry.name);
        const idx2 = serverNameMap.get(`Node_${originalIndex}`);
        let serverName = null;
        if (idx1 !== undefined && idx2 !== undefined) {
            serverName = serverMeshNames[Math.min(idx1, idx2)];
        } else if (idx1 !== undefined) {
            serverName = serverMeshNames[idx1];
        } else if (idx2 !== undefined) {
            serverName = serverMeshNames[idx2];
        }

        if (serverName) { entry.name = serverName; entry.mesh.name = serverName; }
        if (existingTags?.meshCategories?.[entry.name]) {
            entry.tag = existingTags.meshCategories[entry.name];
        }
    }, () => {
        document.getElementById('staging-actions').style.display = 'block';
        document.getElementById('shared-controls').style.display = 'block';
        updateMeshColors();
        updateTagStats();
    });
}

async function autoParse() {
    const file = document.getElementById('sel-staging-file').value;
    if (!file) return;

    updateStatus('Auto-parsing mesh names...');
    try {
        const resp = await fetch(`/api/showroom/staging/parse/${encodeURIComponent(file)}`, { method: 'POST' });
        const data = await resp.json();
        if (!data.success) { updateStatus('Parse failed'); return; }

        for (const entry of meshEntries) {
            if (data.meshCategories[entry.name]) entry.tag = data.meshCategories[entry.name];
        }

        // UI is updated by updateTagStats()

        updateMeshColors();
        updateTagStats();
        updateStatus(`Parsed: ${Object.keys(data.meshCategories).length} meshes categorized`);
    } catch (e) {
        updateStatus('Error during auto-parse');
        console.error(e);
    }
}

/**
 * Build per-category rows: checkbox + sub-category/grain dropdowns for categories
 * that appeared in the parse summary.
 */
function buildCategorySettingsRows(summary) {
    const style = document.getElementById('sel-staging-style').value;
    const container = document.getElementById('category-rows');
    
    // Save existing state
    const existingState = {};
    container.querySelectorAll('.cat-setting-row').forEach(row => {
        const c = row.dataset.cat;
        const chk = row.querySelector(`#cat-chk-${c}`);
        const subSel = row.querySelector(`#cat-sub-${c}`);
        const grainSel = row.querySelector(`#cat-grain-${c}`);
        existingState[c] = {
            checked: chk ? chk.checked : true,
            sub: subSel ? subSel.value : null,
            grain: grainSel ? grainSel.value : null
        };
    });

    container.innerHTML = '';

    // Include all categories that have > 0 count (excluding 'ignore' and 'untagged')
    const activeCats = Object.keys(summary).filter(c => c !== 'ignore' && c !== 'untagged' && summary[c] > 0);
    // Alphabetize categories as requested
    activeCats.sort((a, b) => a.localeCompare(b));

    activeCats.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'cat-setting-row';
        row.dataset.cat = cat;

        // Checkbox label
        const label = document.createElement('label');
        label.className = 'cat-check-label';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.name = `cat-include-${cat}`;
        chk.id = `cat-chk-${cat}`;
        chk.checked = existingState[cat] ? existingState[cat].checked : true; // keep user selected or include by default
        chk.dataset.cat = cat;

        const dotSpan = document.createElement('span');
        dotSpan.className = `dot ${escapeHtml(cat)}`;
        const nameSpan = document.createElement('span');
        nameSpan.textContent = cat.replace(/_/g, ' ');

        label.appendChild(chk);
        label.appendChild(dotSpan);
        label.appendChild(nameSpan);
        row.appendChild(label);

        // Sub-category select (if applicable)
        const subs = SUB_CATEGORIES[cat];
        if (subs) {
            const subSel = document.createElement('select');
            subSel.className = 'cat-sub-sel text-input-sm';
            subSel.id = `cat-sub-${cat}`;
            subs.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s.replace(/_/g, ' ');
                subSel.appendChild(opt);
            });
            if (existingState[cat] && existingState[cat].sub && subs.includes(existingState[cat].sub)) {
                subSel.value = existingState[cat].sub;
            }
            row.appendChild(subSel);

            // Grain select (only for doors/slab)
            if (cat === 'doors' || cat === 'drawer_fronts') {
                const grainSel = document.createElement('select');
                grainSel.className = 'cat-sub-sel text-input-sm';
                grainSel.id = `cat-grain-${cat}`;
                grainSel.style.display = 'none';

                GRAIN_DIRS.forEach(g => {
                    const opt = document.createElement('option');
                    opt.value = g;
                    opt.textContent = g;
                    grainSel.appendChild(opt);
                });
                if (existingState[cat] && existingState[cat].grain && GRAIN_DIRS.includes(existingState[cat].grain)) {
                    grainSel.value = existingState[cat].grain;
                }
                row.appendChild(grainSel);

                subSel.onchange = () => {
                    grainSel.style.display = subSel.value === 'slab' ? 'inline-block' : 'none';
                };
                // Trigger initial
                grainSel.style.display = subSel.value === 'slab' ? 'inline-block' : 'none';
            }
        }

        // Overlay note (informational) for overlay categories with face_frame
        if (OVERLAY_CATEGORIES.includes(cat) && style === 'face_frame') {
            const note = document.createElement('span');
            note.className = 'cat-note';
            note.textContent = '→ overlay';
            row.appendChild(note);
        }

        container.appendChild(row);
    });

    document.getElementById('category-settings').style.display = activeCats.length > 0 ? 'block' : 'none';
}

async function splitAndDeploy() {
    const file        = document.getElementById('sel-staging-file').value;
    const style       = document.getElementById('sel-staging-style').value;
    const overlay     = document.getElementById('sel-staging-overlay')?.value || null;
    const outputName  = document.getElementById('staging-output-name').value.trim();
    const activeContextBtn = document.querySelector('.toggle-btn[data-context].active');
    const context     = activeContextBtn ? activeContextBtn.dataset.context : 'kitchen';

    if (!file) { updateStatus('No file loaded'); return; }
    if (!style) { updateStatus('Select a style'); return; }
    if (!outputName || !/^[a-zA-Z0-9\-_ ]+$/.test(outputName)) {
        updateStatus('Enter a valid output name (letters, numbers, hyphens, underscores)');
        return;
    }

    // Build categorySettings from per-category rows
    const categorySettings = {};
    document.querySelectorAll('.cat-setting-row').forEach(row => {
        const cat = row.dataset.cat;
        const chk = row.querySelector(`#cat-chk-${cat}`);
        if (!chk || !chk.checked) return;
        const setting = { include: true };
        const subSel = row.querySelector(`#cat-sub-${cat}`);
        if (subSel) setting.subCategory = subSel.value;
        const grainSel = row.querySelector(`#cat-grain-${cat}`);
        if (grainSel && grainSel.style.display !== 'none') setting.grain = grainSel.value;
        categorySettings[cat] = setting;
    });

    const meshCategories = {};
    meshEntries.forEach(e => { if (e.tag) meshCategories[e.name] = e.tag; });

    const untagged = meshEntries.filter(e => !e.tag && !hiddenMeshes.has(e.name));
    if (untagged.length > 0) {
        if (!confirm(`${untagged.length} meshes are untagged and will be ignored. Continue?`)) return;
    }

    updateStatus('Splitting and deploying...');
    try {
        // Save tags first
        await fetch(`/api/showroom/staging/tags/${encodeURIComponent(file)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file, context, style, overlay, meshCategories })
        });

        // Split with new payload
        const resp = await fetch(`/api/showroom/staging/split/${encodeURIComponent(file)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ context, style, overlay, categorySettings, meshCategories, outputName })
        });
        const data = await resp.json();
        if (data.success) {
            const resultLines = Object.entries(data.results)
                .map(([cat, info]) => info.error ? `${cat}: FAILED` : `${cat}: ${info.meshCount} meshes`)
                .join(', ');
            updateStatus(`Split complete! ${resultLines}`);
        } else {
            updateStatus(`Split failed: ${data.error}`);
        }
    } catch (e) {
        updateStatus('Error during split');
        console.error(e);
    }
}

// ============================================================
// CATEGORY MODE
// ============================================================
function initCategoryModeDropdowns() {
    const catSel = document.getElementById('cat-sel-category');
    const styleSel = document.getElementById('cat-sel-style');
    const contextSel = document.getElementById('cat-sel-context');

    // All categories for the dropdown (overlay + non-overlay + direct)
    const allCats = [...OVERLAY_CATEGORIES, ...NON_OVERLAY_CATEGORIES, ...DIRECT_CATEGORIES];
    catSel.innerHTML = allCats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c.replace(/_/g, ' '))}</option>`).join('');

    const onChange = () => {
        updateCatOverlayVisibility();
        updateCategoryFileList();
    };

    contextSel.onchange = onChange;
    styleSel.onchange   = () => { updateCatOverlayVisibility(); updateCategoryFileList(); };
    catSel.onchange     = () => { updateCatOverlayVisibility(); updateCategoryFileList(); };
    document.getElementById('cat-sel-overlay').onchange    = updateCategoryFileList;
    document.getElementById('cat-sel-subcategory').onchange = () => { updateCatGrainVisibility(); updateCategoryFileList(); };
    document.getElementById('cat-sel-grain').onchange      = updateCategoryFileList;

    updateCatOverlayVisibility();
    updateCategoryFileList();
}

function buildDeepPath(context, style, overlay, cat, subCat, grain) {
    const parts = [];
    if (DIRECT_CATEGORIES.includes(cat)) {
        // context/category/
        parts.push(context, cat);
    } else if (NON_OVERLAY_CATEGORIES.includes(cat)) {
        // context/style/category/[subCat]/
        parts.push(context, style, cat);
        if (subCat) parts.push(subCat);
    } else {
        // Overlay category: context/style/[overlay/]category/[subCat/[grain/]]
        parts.push(context, style);
        if (style === 'face_frame' && overlay) parts.push(overlay);
        parts.push(cat);
        if (subCat) {
            parts.push(subCat);
            if (grain && (cat === 'doors' || cat === 'drawer_fronts') && subCat === 'slab') parts.push(grain);
        }
    }
    return parts.join('/');
}

function updateCategoryFileList() {
    const context = document.getElementById('cat-sel-context').value;
    const style   = document.getElementById('cat-sel-style').value;
    const overlay = document.getElementById('cat-sel-overlay')?.value || null;
    const cat     = document.getElementById('cat-sel-category').value;
    const subCat  = document.getElementById('cat-sel-subcategory')?.value || null;
    const grain   = document.getElementById('cat-sel-grain')?.value || null;

    // Navigate the categories tree
    let node = categoriesData;
    const pathKeys = [];
    if (DIRECT_CATEGORIES.includes(cat)) {
        pathKeys.push(context, cat);
    } else if (NON_OVERLAY_CATEGORIES.includes(cat)) {
        pathKeys.push(context, style, cat);
        if (subCat && SUB_CATEGORIES[cat]) pathKeys.push(subCat);
    } else {
        pathKeys.push(context, style);
        if (style === 'face_frame' && overlay) pathKeys.push(overlay);
        pathKeys.push(cat);
        if (subCat && SUB_CATEGORIES[cat]) {
            pathKeys.push(subCat);
            if (grain && (cat === 'doors' || cat === 'drawer_fronts') && subCat === 'slab') pathKeys.push(grain);
        }
    }

    for (const key of pathKeys) {
        if (node && typeof node === 'object' && !Array.isArray(node)) node = node[key];
        else { node = null; break; }
    }

    const files = (node && Array.isArray(node.files)) ? node.files : [];
    const selFile = document.getElementById('sel-file');
    selFile.innerHTML = '<option value="">-- Select --</option>' +
        files.map(f => `<option value="${escapeHtml(f.file)}">${escapeHtml(f.name)}${f.tagged ? ' (tagged)' : ''}</option>`).join('');
}

async function loadCategoryGlb() {
    const context = document.getElementById('cat-sel-context').value;
    const style   = document.getElementById('cat-sel-style').value;
    const overlay = document.getElementById('cat-sel-overlay')?.value || null;
    const cat     = document.getElementById('cat-sel-category').value;
    const subCat  = document.getElementById('cat-sel-subcategory')?.value || null;
    const grain   = document.getElementById('cat-sel-grain')?.value || null;
    const file    = document.getElementById('sel-file').value;
    if (!file) { updateStatus('Select a file first'); return; }

    updateStatus('Loading...');
    clearScene();

    const deepPath = buildDeepPath(context, style, overlay, cat, subCat, grain);

    // Fetch mesh names from server
    let serverMeshNames = [];
    try {
        const meshResp = await fetch(`/api/showroom/meshes/${deepPath}/${encodeURIComponent(file)}`);
        const meshData = await meshResp.json();
        if (meshData.success) serverMeshNames = meshData.meshes;
    } catch { /* fallback */ }

    // Check for full version first
    const baseName = file.replace(/\.glb$/i, '');
    const fullUrl   = `/showroom/${deepPath}/${encodeURIComponent(baseName + '.full.glb')}`;
    const normalUrl = `/showroom/${deepPath}/${encodeURIComponent(file)}`;

    let glbUrl = normalUrl;
    try {
        const headResp = await fetch(fullUrl, { method: 'HEAD' });
        if (headResp.ok) glbUrl = fullUrl;
    } catch { /* use normal */ }

    // Load existing tags
    let existingTags = null;
    try {
        const tagsResp = await fetch(`/api/showroom/tags/${deepPath}/${encodeURIComponent(file)}`);
        if (tagsResp.ok) {
            const tagsData = await tagsResp.json();
            if (tagsData.success) existingTags = tagsData.tags;
        }
    } catch { /* no existing tags */ }

    // Optimization: Use a Map for O(1) mesh name lookups instead of O(N) .find() inside the traversal loop.
    const serverNameMap = new Map();
    serverMeshNames.forEach((name, idx) => { if (!serverNameMap.has(name)) serverNameMap.set(name, idx); });

    loadGlbFromUrl(glbUrl, (entry, originalIndex) => {
        const idx1 = serverNameMap.get(entry.name);
        const idx2 = serverNameMap.get(`Node_${originalIndex}`);
        let serverName = null;
        if (idx1 !== undefined && idx2 !== undefined) {
            serverName = serverMeshNames[Math.min(idx1, idx2)];
        } else if (idx1 !== undefined) {
            serverName = serverMeshNames[idx1];
        } else if (idx2 !== undefined) {
            serverName = serverMeshNames[idx2];
        }

        if (serverName) { entry.name = serverName; entry.mesh.name = serverName; }

        if (existingTags?.meshTags?.[entry.name]) {
            entry.tag = existingTags.meshTags[entry.name];
        }
        if (existingTags) {
            if (!entry.tag || (entry.tag !== 'tagged' && entry.tag !== 'paneled_end_replaceable')) {
                entry.hidden = true;
                entry.mesh.visible = false;
                hiddenMeshes.add(entry.name);
            }
        } else {
            entry.tag = 'tagged';
        }
    }, () => {
        document.getElementById('category-actions').style.display = 'block';
        document.getElementById('shared-controls').style.display = 'block';
        updateMeshColors();
        updateTagStats();
    });
}

async function saveCategoryTags() {
    const context = document.getElementById('cat-sel-context').value;
    const style   = document.getElementById('cat-sel-style').value;
    const overlay = document.getElementById('cat-sel-overlay')?.value || null;
    const cat     = document.getElementById('cat-sel-category').value;
    const subCat  = document.getElementById('cat-sel-subcategory')?.value || null;
    const grain   = document.getElementById('cat-sel-grain')?.value || null;
    const file    = document.getElementById('sel-file').value;
    if (!file) { updateStatus('No file loaded'); return; }

    const deepPath = buildDeepPath(context, style, overlay, cat, subCat, grain);

    const meshTags = {};
    const taggedMeshes = [];
    const paneledEndReplacements = [];
    meshEntries.forEach(entry => {
        if (entry.tag) {
            meshTags[entry.name] = entry.tag;
            if (entry.tag === 'tagged') taggedMeshes.push(entry.name);
            if (entry.tag === 'paneled_end_replaceable') {
                taggedMeshes.push(entry.name);
                paneledEndReplacements.push(entry.name);
            }
        }
    });

    const tags = { file, context, style, overlay, cat, subCat, grain, extracted: false, meshTags, taggedMeshes };
    if (cat === 'base' && paneledEndReplacements.length > 0) {
        tags.paneledEndReplacements = paneledEndReplacements;
    }

    updateStatus('Saving tags...');
    try {
        const resp = await fetch(`/api/showroom/tags/${deepPath}/${encodeURIComponent(file)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tags)
        });
        const data = await resp.json();
        if (data.success) {
            updateStatus(`Tags saved! (${taggedMeshes.length} tagged)`);
        } else {
            updateStatus('Failed to save tags');
        }
    } catch (e) {
        updateStatus('Error saving tags');
        console.error(e);
    }
}

// ============================================================
// CAMERA FRAMING
// ============================================================
function frameCameraToModel(model) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const distance = Math.abs(maxDim / Math.sin(fov / 2)) * 0.8;
    camera.position.set(center.x, center.y + size.y * 0.3, center.z + distance);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
}

// ============================================================
// SHARED GLB LOADING
// ============================================================
function clearScene() {
    if (loadedModel) { scene.remove(loadedModel); loadedModel = null; }
    meshEntries = [];
    hiddenMeshes.clear();
    meshToEntry.clear();
    selectedEntries.clear();
    closePopup();
    document.querySelectorAll('#staging-actions, #category-actions, #shared-controls').forEach(el => el.style.display = 'none');
    document.getElementById('parse-summary').style.display = 'none';
    document.getElementById('category-settings').style.display = 'none';
}

function loadGlbFromUrl(url, onEntry, onComplete) {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
        const model = gltf.scene;
        loadedModel = model;

        model.traverse((child) => {
            if (child.isMesh) {
                let originalIndex = meshEntries.length;
                if (gltf.parser?.associations) {
                    const assoc = gltf.parser.associations.get(child);
                    if (assoc?.nodes !== undefined) originalIndex = assoc.nodes;
                }
                const name = child.name || `Node_${originalIndex}`;
                const prevMat = Array.isArray(child.material) ? child.material[0] : child.material;
                child.material = new THREE.MeshLambertMaterial({
                    map: prevMat.map,
                    color: prevMat.map ? 0xffffff : (prevMat.color || 0xcccccc),
                    side: THREE.DoubleSide,
                    polygonOffset: true,
                    polygonOffsetFactor: 1,
                    polygonOffsetUnits: 1
                });

                const entry = { name, mesh: child, tag: null, selected: false };
                if (onEntry) onEntry(entry, originalIndex);
                meshEntries.push(entry);
                meshToEntry.set(child, entry);
            }
        });

        scene.add(model);
        frameCameraToModel(model);
        document.getElementById('mesh-count').textContent = `${meshEntries.length} meshes`;
        updateStatus(`Loaded ${meshEntries.length} meshes`);
        if (onComplete) onComplete();
    }, (xhr) => {
        if (xhr.lengthComputable) updateStatus(`Downloading: ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
    }, (err) => {
        updateStatus('Failed to load GLB');
        console.error(err);
    });
}

// ============================================================
// MESH COLOR + STATS
// ============================================================
function updateTagStats() {
    const counts = {};
    meshEntries.forEach(e => {
        if (e.hidden) return;
        const key = e.tag || 'untagged';
        counts[key] = (counts[key] || 0) + 1;
    });

    const el = document.getElementById('tag-stats');
    if (el) el.innerHTML = Object.entries(counts).map(([k, v]) =>
        `<div class="parse-count-row"><span><span class="dot ${escapeHtml(k)}"></span> ${escapeHtml(k.replace(/_/g, ' '))}</span><span class="count-badge">${v}</span></div>`
    ).join('');

    if (currentMode === 'staging') {
        const countsEl = document.getElementById('parse-counts');
        if (countsEl) {
            countsEl.innerHTML = Object.entries(counts)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([cat, count]) => `<div class="parse-count-row"><span><span class="dot ${escapeHtml(cat)}"></span> ${escapeHtml(cat.replace(/_/g, ' '))}</span><span class="count-badge">${count}</span></div>`)
                .join('');
        }
        buildLegend('staging-legend', Object.keys(counts));
        buildCategorySettingsRows(counts);

        const activeCats = Object.keys(counts).filter(c => c !== 'ignore' && c !== 'untagged' && counts[c] > 0);
        if (activeCats.length > 0) {
            document.getElementById('parse-summary').style.display = 'block';
        } else {
            document.getElementById('parse-summary').style.display = 'none';
        }
    }

    const meshCount = document.getElementById('mesh-count');
    if (meshCount) meshCount.textContent = `${meshEntries.filter(e => !e.hidden).length} meshes`;
}

function buildLegend(elementId, categories) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = categories.map(c =>
        `<span class="legend-item"><span class="dot ${escapeHtml(c)}"></span> ${escapeHtml(c.replace(/_/g, ' '))}</span>`
    ).join('');
}

function updateMeshColors() {
    meshEntries.forEach(entry => updateSingleMeshColor(entry));
}

function updateSingleMeshColor(entry) {
    if (!entry || entry.hidden) return;
    const color = CATEGORY_COLORS[entry.tag] || CATEGORY_COLORS['null'];
    entry.mesh.material.emissive = entry.selected ? new THREE.Color(0x3b82f6) : color;
    entry.mesh.material.emissiveIntensity = entry.selected ? 0.3 : 0.08;
}

function toggleSelection(entry, selected) {
    if (entry.selected === selected) return;
    entry.selected = selected;
    if (selected) selectedEntries.add(entry);
    else selectedEntries.delete(entry);
    updateSingleMeshColor(entry);
}

// ============================================================
// CANVAS CLICK / POPUP
// ============================================================
function onCanvasClick(e) {
    if (!loadedModel) return;
    const container = document.getElementById('canvas-container');
    const rect = container.getBoundingClientRect();
    const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(loadedModel.children, true);
    if (!intersects.length) return;

    const hitMesh = intersects[0].object;
    const entry = meshToEntry.get(hitMesh);
    if (!entry) return;

    if (e.shiftKey) {
        toggleSelection(entry, !entry.selected);
    } else {
        selectedEntries.forEach(en => { if (en !== entry) toggleSelection(en, false); });
        toggleSelection(entry, true);
    }
    showPopup(entry, e.clientX, e.clientY);
}

function showPopup(entry, x, y) {
    const popup = document.getElementById('mesh-popup');
    popup.querySelector('.popup-name').textContent = entry.name;
    popup.querySelector('.popup-current-tag').textContent = entry.tag ? `Current: ${entry.tag.replace(/_/g, ' ')}` : 'Untagged';

    const actionsEl = popup.querySelector('.popup-actions');
    actionsEl.innerHTML = '';

    let tagOptions;
    if (currentMode === 'staging') {
        tagOptions = ['base', 'doors', 'drawer_fronts', 'crown', 'drawers', 'finished_ends', 'case_parts', 'wall', 'counter_top', 'floor', 'ignore'];
    } else {
        const selectedCat = document.getElementById('cat-sel-category')?.value;
        tagOptions = selectedCat === 'base' ? ['tagged', 'paneled_end_replaceable', 'ignore'] : ['tagged', 'ignore'];
    }

    for (const opt of tagOptions) {
        const btn = document.createElement('button');
        btn.textContent = opt.replace(/_/g, ' ');
        if (entry.tag === opt) btn.classList.add('active');
        btn.onclick = () => {
            const targets = meshEntries.filter(e => e.selected);
            if (targets.length === 0) targets.push(entry);
            targets.forEach(t => t.tag = opt);
            updateMeshColors();
            updateTagStats();
            popup.querySelector('.popup-current-tag').textContent = `Current: ${opt.replace(/_/g, ' ')}`;
            actionsEl.querySelectorAll('button:not(.btn-hide)').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        };
        actionsEl.appendChild(btn);
    }

    const hideBtn = document.createElement('button');
    hideBtn.textContent = 'Hide';
    hideBtn.className = 'btn-hide';
    hideBtn.onclick = () => {
        const targets = meshEntries.filter(e => e.selected);
        if (targets.length === 0) targets.push(entry);
        targets.forEach(t => { t.hidden = true; t.mesh.visible = false; hiddenMeshes.add(t.name); });
        closePopup();
        updateTagStats();
    };
    actionsEl.appendChild(hideBtn);

    popup.style.display = 'block';
    const popupRect = popup.getBoundingClientRect();
    let px = x + 15, py = y - 10;
    if (px + popupRect.width > window.innerWidth - 10) px = x - popupRect.width - 15;
    if (py + popupRect.height > window.innerHeight - 10) py = window.innerHeight - popupRect.height - 10;
    if (py < 10) py = 10;
    popup.style.left = px + 'px';
    popup.style.top = py + 'px';
    popup.querySelector('.popup-close').onclick = closePopup;
}

function closePopup() {
    document.getElementById('mesh-popup').style.display = 'none';
}

// ============================================================
// ANIMATION
// ============================================================
function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (composer) composer.render();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
