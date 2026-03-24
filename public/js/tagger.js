import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

let scene, camera, renderer, controls;
let loadedModel = null;
let meshEntries = []; // { name, mesh, tag: 'tagged'|'ignore'|null, selected: false }
let categoriesData = {};
const meshToEntry = new Map(); // O(1) lookup from THREE.Mesh to entry object
const selectedEntries = new Set(); // O(1) tracking of selected meshes

const statusText = document.getElementById('status-text');
const updateStatus = (msg) => { if (statusText) statusText.innerText = msg; };

// Category colors for staging mode
const CATEGORY_COLORS = {
    base: new THREE.Color(0x4CAF50),
    doors: new THREE.Color(0x2196F3),
    crown: new THREE.Color(0xFF9800),
    drawers: new THREE.Color(0x9C27B0),
    finished_ends: new THREE.Color(0x00BCD4),
    case_parts: new THREE.Color(0x795548),
    island: new THREE.Color(0xE91E63),
    wall: new THREE.Color(0x607D8B),
    counter_top: new THREE.Color(0xFFC107),
    floor: new THREE.Color(0x8BC34A),
    ignore: new THREE.Color(0xdc3545),
    // Doors sub-categories
    drawer_fronts: new THREE.Color(0x9C27B0),
    paneled_ends: new THREE.Color(0x00BCD4),
    island_backs: new THREE.Color(0xE91E63),
    // Category mode
    tagged: new THREE.Color(0x28a745),
    paneled_end_replaceable: new THREE.Color(0xFFD600),
    null: new THREE.Color(0x888888)
};

// --- INIT ---
async function init() {
    // Fetch showroom data
    try {
        const resp = await fetch('/api/showroom/categories');
        const data = await resp.json();
        if (data.success) categoriesData = data.categories;
    } catch { updateStatus('Failed to load showroom data'); }

    // Populate category mode dropdowns
    const selCategory = document.getElementById('sel-category');
    const selStyle = document.getElementById('sel-style');
    const categories = Object.keys(categoriesData);
    selCategory.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c.replace(/_/g, ' '))}</option>`).join('');

    const styles = ['face_frame', 'full_inset', 'frameless'];
    selStyle.innerHTML = styles.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s.replace(/_/g, ' '))}</option>`).join('');

    function updateFileList() {
        const cat = selCategory.value;
        const style = selStyle.value;
        const files = (categoriesData[cat] && categoriesData[cat][style]) || [];
        selFile.innerHTML = '<option value="">-- Select --</option>' +
            files.map(f => `<option value="${escapeHtml(f.file)}">${escapeHtml(f.name)}${f.tagged ? ' (tagged)' : ''}</option>`).join('');
    }

    selCategory.onchange = updateFileList;
    selStyle.onchange = updateFileList;
    updateFileList();

    // Load staging files
    await loadStagingFileList();

    // Setup Three.js
    const container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 5000);
    renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dl1 = new THREE.DirectionalLight(0xffffff, 0.6);
    dl1.position.set(2, 3, 2);
    scene.add(dl1);
    const dl2 = new THREE.DirectionalLight(0xffffff, 0.3);
    dl2.position.set(-2, 1, -2);
    scene.add(dl2);

    // Mode tab switching
    document.querySelectorAll('.mode-tab').forEach(tab => {
        tab.onclick = () => switchMode(tab.dataset.mode);
    });

    // Button handlers
    document.getElementById('btn-load-staging').onclick = loadStagingGlb;
    document.getElementById('btn-auto-parse').onclick = autoParse;
    document.getElementById('btn-split-deploy').onclick = splitAndDeploy;
    document.getElementById('btn-load').onclick = loadCategoryGlb;
    document.getElementById('btn-save').onclick = saveCategoryTags;
    document.getElementById('btn-load-doors').onclick = loadDoorsGlb;
    document.getElementById('btn-split-doors').onclick = splitDoors;

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

    // Tag actions
    document.getElementById('btn-tag-selected').onclick = () => tagSelected();
    document.getElementById('btn-select-all').onclick = () => {
        meshEntries.forEach(e => toggleSelection(e, true));
    };
    document.getElementById('btn-deselect-all').onclick = () => {
        selectedEntries.forEach(e => toggleSelection(e, false));
    };
    document.getElementById('btn-save').onclick = () => saveTags();

    // Canvas click
    renderer.domElement.addEventListener('click', onCanvasClick);
    // Close popup on escape or click outside
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); });
    document.addEventListener('mousedown', (e) => {
        const popup = document.getElementById('mesh-popup');
        if (popup.style.display !== 'none' && !popup.contains(e.target) && e.target !== renderer.domElement) {
            closePopup();
        }
    });

    window.addEventListener('resize', () => {
        const container = document.getElementById('canvas-container');
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    animate();
}

// --- MODE SWITCHING ---
function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`${mode === 'doors' ? 'doors' : mode === 'category' ? 'category' : 'staging'}-panel`).classList.add('active');
}

// --- STAGING MODE ---
async function loadStagingFileList() {
    try {
        const resp = await fetch('/api/showroom/staging');
        const data = await resp.json();
        if (!data.success) return;
        const sel = document.getElementById('sel-staging-file');
        sel.innerHTML = '<option value="">-- Select --</option>' +
            data.files.map(f => `<option value="${f.file}">${f.name}${f.tagged ? ' (tagged)' : ''}</option>`).join('');
    } catch { /* ignore */ }
}

async function loadStagingGlb() {
    const file = document.getElementById('sel-staging-file').value;
    if (!file) { updateStatus('Select a staged file first'); return; }

    updateStatus('Loading staged GLB...');
    clearScene();

    const glbUrl = `/showroom/staging/${encodeURIComponent(file)}`;

    // Load existing tags if any
    let existingTags = null;
    try {
        const baseName = file.replace(/\.glb$/i, '');
        const tagsResp = await fetch(`/api/showroom/staging/tags/${encodeURIComponent(baseName)}`);
        if (tagsResp.ok) {
            const tagsData = await tagsResp.json();
            if (tagsData.success) existingTags = tagsData.tags;
        }
    } catch { /* no existing tags */ }

    loadGlbFromUrl(glbUrl, (entry) => {
        // Apply existing tags
        if (existingTags && existingTags.meshCategories && existingTags.meshCategories[entry.name]) {
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

        // Apply parsed categories to mesh entries
        for (const entry of meshEntries) {
            if (data.meshCategories[entry.name]) {
                entry.tag = data.meshCategories[entry.name];
            }
        }

        // Show summary
        const summaryEl = document.getElementById('parse-summary');
        summaryEl.style.display = 'block';
        const countsEl = document.getElementById('parse-counts');
        countsEl.innerHTML = Object.entries(data.summary)
            .sort(([, a], [, b]) => b - a)
            .map(([cat, count]) => `<div class="parse-count-row"><span><span class="dot ${cat}"></span> ${cat.replace(/_/g, ' ')}</span><span class="count-badge">${count}</span></div>`)
            .join('');

        // Build legend
        buildLegend('staging-legend', Object.keys(data.summary));

        updateMeshColors();
        updateTagStats();
        updateStatus(`Parsed: ${Object.keys(data.meshCategories).length} meshes categorized`);
    } catch (e) {
        updateStatus('Error during auto-parse');
        console.error(e);
    }
}

async function splitAndDeploy() {
    const file = document.getElementById('sel-staging-file').value;
    const style = document.getElementById('sel-staging-style').value;
    const outputName = document.getElementById('staging-output-name').value.trim();

    if (!file) { updateStatus('No file loaded'); return; }
    if (!style) { updateStatus('Select a style'); return; }
    if (!outputName || !/^[a-zA-Z0-9\-_ ]+$/.test(outputName)) {
        updateStatus('Enter a valid output name (letters, numbers, hyphens, underscores)');
        return;
    }

    // Gather mesh categories
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
            body: JSON.stringify({ file, style, meshCategories })
        });

        // Split
        const resp = await fetch(`/api/showroom/staging/split/${encodeURIComponent(file)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ style, meshCategories, outputName })
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

// --- CATEGORY MODE ---
function updateFileList() {
    const cat = document.getElementById('sel-category').value;
    const style = document.getElementById('sel-style').value;
    const files = (categoriesData[cat] && categoriesData[cat][style]) || [];
    const selFile = document.getElementById('sel-file');
    selFile.innerHTML = '<option value="">-- Select --</option>' +
        files.map(f => `<option value="${f.file}">${f.name}${f.tagged ? ' (tagged)' : ''}</option>`).join('');
}

async function loadCategoryGlb() {
    const category = document.getElementById('sel-category').value;
    const style = document.getElementById('sel-style').value;
    const file = document.getElementById('sel-file').value;
    if (!file) { updateStatus('Select a file first'); return; }

    updateStatus('Loading...');
    clearScene();

    // Clear previous
    if (loadedModel) { scene.remove(loadedModel); loadedModel = null; }
    meshEntries = [];
    meshToEntry.clear();
    selectedEntries.clear();

    // Check for full version first (for re-tagging)
    const baseName = file.replace(/\.glb$/i, '');
    const fullUrl = `/showroom/${encodeURIComponent(category)}/${encodeURIComponent(style)}/${encodeURIComponent(baseName + '.full.glb')}`;
    const normalUrl = `/showroom/${encodeURIComponent(category)}/${encodeURIComponent(style)}/${encodeURIComponent(file)}`;

    let glbUrl = normalUrl;
    try {
        const headResp = await fetch(fullUrl, { method: 'HEAD' });
        if (headResp.ok) glbUrl = fullUrl;
    } catch { /* use normal */ }

    // Load existing tags
    let existingTags = null;
    try {
        const tagsResp = await fetch(`/api/showroom/tags/${encodeURIComponent(category)}/${encodeURIComponent(style)}/${encodeURIComponent(file)}`);
        if (tagsResp.ok) {
            const tagsData = await tagsResp.json();
            if (tagsData.success) existingTags = tagsData.tags;
        }
    } catch { /* no existing tags */ }

    loadGlbFromUrl(glbUrl, (entry) => {
        if (existingTags && existingTags.meshTags && existingTags.meshTags[entry.name]) {
            entry.tag = existingTags.meshTags[entry.name];
        }
    }, () => {
        document.getElementById('category-actions').style.display = 'block';
        document.getElementById('shared-controls').style.display = 'block';
        updateMeshColors();
        updateTagStats();
    });
}

async function saveCategoryTags() {
    const category = document.getElementById('sel-category').value;
    const style = document.getElementById('sel-style').value;
    const file = document.getElementById('sel-file').value;
    if (!file) { updateStatus('No file loaded'); return; }

    const meshTags = {};
    const taggedMeshes = [];
    const paneledEndReplacements = [];
    meshEntries.forEach(entry => {
        if (entry.tag) {
            meshTags[entry.name] = entry.tag;
            if (entry.tag === 'tagged') taggedMeshes.push(entry.name);
            if (entry.tag === 'paneled_end_replaceable') {
                taggedMeshes.push(entry.name); // still visible by default
                paneledEndReplacements.push(entry.name);
            }
        }
    });

    const tags = { file, category, style, extracted: false, meshTags, taggedMeshes };
    if (category === 'base' && paneledEndReplacements.length > 0) {
        tags.paneledEndReplacements = paneledEndReplacements;
    }

    updateStatus('Saving tags...');
    try {
        const resp = await fetch(`/api/showroom/tags/${encodeURIComponent(category)}/${encodeURIComponent(style)}/${encodeURIComponent(file)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tags)
        });
        const data = await resp.json();
        if (data.success) {
            updateStatus(`Tags saved! (${taggedMeshes.length} tagged, ${Object.keys(meshTags).length - taggedMeshes.length} ignored)`);
        } else {
            updateStatus('Failed to save tags');
        }
    } catch (e) {
        updateStatus('Error saving tags');
        console.error(e);
    }
}

// --- DOORS REFINEMENT MODE ---
function updateDoorsFileList() {
    const style = document.getElementById('sel-doors-style').value;
    const files = (categoriesData['doors'] && categoriesData['doors'][style]) || [];
    const sel = document.getElementById('sel-doors-file');
    sel.innerHTML = '<option value="">-- Select --</option>' +
        files.map(f => `<option value="${f.file}">${f.name}</option>`).join('');
}

async function loadDoorsGlb() {
    const style = document.getElementById('sel-doors-style').value;
    const file = document.getElementById('sel-doors-file').value;
    if (!file) { updateStatus('Select a doors file'); return; }

    updateStatus('Loading doors GLB...');
    clearScene();

    const baseName = file.replace(/\.glb$/i, '');
    const fullUrl = `/showroom/doors/${encodeURIComponent(style)}/${encodeURIComponent(baseName + '.full.glb')}`;
    const normalUrl = `/showroom/doors/${encodeURIComponent(style)}/${encodeURIComponent(file)}`;

    let glbUrl = normalUrl;
    try {
        const headResp = await fetch(fullUrl, { method: 'HEAD' });
        if (headResp.ok) glbUrl = fullUrl;
    } catch { /* use normal */ }

    loadGlbFromUrl(glbUrl, (entry) => {
        entry.tag = 'doors'; // default all to doors
    }, () => {
        document.getElementById('doors-actions').style.display = 'block';
        document.getElementById('shared-controls').style.display = 'block';
        buildLegend('doors-legend', ['doors', 'drawer_fronts', 'paneled_ends', 'island_backs', 'ignore']);
        updateMeshColors();
        updateTagStats();
    });
}

async function splitDoors() {
    const style = document.getElementById('sel-doors-style').value;
    const file = document.getElementById('sel-doors-file').value;
    if (!file) { updateStatus('No doors file loaded'); return; }

    const meshCategories = {};
    meshEntries.forEach(e => { if (e.tag) meshCategories[e.name] = e.tag; });

    updateStatus('Splitting doors...');
    try {
        const resp = await fetch('/api/showroom/doors/split', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ style, file, meshCategories })
        });
        const data = await resp.json();
        if (data.success) {
            const lines = Object.entries(data.results)
                .map(([cat, info]) => info.error ? `${cat}: FAILED` : `${cat}: ${info.meshCount} -> ${info.folder}/`)
                .join(', ');
            updateStatus(`Doors split complete! ${lines}`);
        } else {
            updateStatus(`Doors split failed: ${data.error}`);
        }
    } catch (e) {
        updateStatus('Error splitting doors');
        console.error(e);
    }
}

// --- SHARED: GLB Loading ---
function clearScene() {
    if (loadedModel) { scene.remove(loadedModel); loadedModel = null; }
    meshEntries = [];
    hiddenMeshes.clear();
    closePopup();
    // Hide action panels
    document.querySelectorAll('#staging-actions, #category-actions, #doors-actions, #shared-controls').forEach(el => el.style.display = 'none');
    document.getElementById('parse-summary').style.display = 'none';
}

function loadGlbFromUrl(url, onEntry, onComplete) {
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
        const model = gltf.scene;
        loadedModel = model;

        model.traverse((child) => {
            if (child.isMesh) {
                const name = child.name || `Mesh_${meshEntries.length}`;
                const prevMat = child.material;
                child.material = new THREE.MeshLambertMaterial({
                    map: prevMat.map,
                    color: prevMat.map ? 0xffffff : (prevMat.color || 0xcccccc),
                    side: THREE.DoubleSide,
                    polygonOffset: true,
                    polygonOffsetFactor: 1,
                    polygonOffsetUnits: 1
                });

                let tag = null;
                if (existingTags && existingTags.meshTags && existingTags.meshTags[name]) {
                    tag = existingTags.meshTags[name];
                }

                const entry = { name, mesh: child, tag, selected: false };
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

/**
 * Initial render of the mesh list. This builds the DOM once per GLB load.
 * We store a reference to the DOM element in each entry for fast updates.
 */
function renderMeshList() {
    const list = document.getElementById('mesh-list');
    list.innerHTML = '';

    const fragment = document.createDocumentFragment();

    meshEntries.forEach((entry) => {
        const div = document.createElement('div');
        entry.el = div; // Store reference for fast O(1) updates
        updateEntryUI(entry);

        div.onclick = (e) => {
            if (e.target.tagName === 'INPUT') return;
            toggleSelection(entry, !entry.selected);
        };

        fragment.appendChild(div);
    });

    list.appendChild(fragment);
}

/**
 * Targeted UI update for a single mesh entry.
 * Prevents full list re-renders (O(N) -> O(1)).
 */
function updateEntryUI(entry) {
    if (!entry.el) return;

    const dotClass = entry.tag === 'tagged' ? 'tagged' : entry.tag === 'ignore' ? 'ignore' : 'untagged';
    const tagLabel = entry.tag || 'untagged';

    // Update innerHTML only if tag changed or it's empty
    if (!entry.el.innerHTML || entry.el.dataset.tag !== (entry.tag || 'null')) {
        entry.el.innerHTML = `
            <input type="checkbox">
            <span class="mesh-dot ${dotClass}"></span>
            <span class="mesh-name">${escapeHtml(entry.name)}</span>
            <span class="mesh-tag-label">${escapeHtml(tagLabel)}</span>
        `;
        entry.el.dataset.tag = entry.tag || 'null';

        // Re-bind checkbox
        const cb = entry.el.querySelector('input');
        cb.onchange = (e) => toggleSelection(entry, e.target.checked);
    }

    entry.el.className = 'mesh-item' + (entry.selected ? ' selected' : '');
    entry.el.querySelector('input').checked = entry.selected;
}

function highlightMesh(mesh, highlight) {
    if (highlight) {
        mesh.material.emissive = new THREE.Color(0x3b82f6);
        mesh.material.emissiveIntensity = 0.3;
    } else {
        updateSingleMeshColor(meshToEntry.get(mesh));
    }
}

// --- SHARED: Mesh Colors ---
function updateMeshColors() {
    meshEntries.forEach(entry => updateSingleMeshColor(entry));
}

function updateSingleMeshColor(entry) {
    if (!entry || entry.hidden) return;
    let color;
    if (currentMode === 'staging' || currentMode === 'doors') {
        color = CATEGORY_COLORS[entry.tag] || CATEGORY_COLORS['null'];
    } else {
        color = CATEGORY_COLORS[entry.tag] || CATEGORY_COLORS['null'];
    }
    entry.mesh.material.emissive = entry.selected ? new THREE.Color(0x3b82f6) : color;
    entry.mesh.material.emissiveIntensity = entry.selected ? 0.3 : 0.08;
}

function toggleSelection(entry, selected) {
    if (entry.selected === selected) return;
    entry.selected = selected;
    if (selected) selectedEntries.add(entry);
    else selectedEntries.delete(entry);

    updateEntryUI(entry);
    updateSingleMeshColor(entry);
}

function tagSelected() {
    const tagValue = document.getElementById('tag-assign').value;
    selectedEntries.forEach(entry => {
        entry.tag = tagValue;
        updateEntryUI(entry);
        updateSingleMeshColor(entry);
    });
}

// --- CLICK POPUP ---
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
        // Fast clear existing selection (O(M) where M is selected count, instead of O(N))
        selectedEntries.forEach(e => { if (e !== entry) toggleSelection(e, false); });
        toggleSelection(entry, true);
    }

    // Scroll to the item (O(1))
    if (entry.el) entry.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showPopup(entry, x, y) {
    const popup = document.getElementById('mesh-popup');
    popup.querySelector('.popup-name').textContent = entry.name;
    popup.querySelector('.popup-current-tag').textContent = entry.tag ? `Current: ${entry.tag.replace(/_/g, ' ')}` : 'Untagged';

    // Build action buttons based on mode
    const actionsEl = popup.querySelector('.popup-actions');
    actionsEl.innerHTML = '';

    let tagOptions;
    if (currentMode === 'staging') {
        tagOptions = ['base', 'doors', 'crown', 'drawers', 'finished_ends', 'case_parts', 'island', 'wall', 'counter_top', 'floor', 'ignore'];
    } else if (currentMode === 'doors') {
        tagOptions = ['doors', 'drawer_fronts', 'paneled_ends', 'island_backs', 'ignore'];
    } else {
        const selectedCat = document.getElementById('sel-category')?.value;
        if (selectedCat === 'base') {
            tagOptions = ['tagged', 'paneled_end_replaceable', 'ignore'];
        } else {
            tagOptions = ['tagged', 'ignore'];
        }
    }

    for (const opt of tagOptions) {
        const btn = document.createElement('button');
        btn.textContent = opt.replace(/_/g, ' ');
        if (entry.tag === opt) btn.classList.add('active');
        btn.onclick = () => {
            // Apply to all selected meshes (or just this one)
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

    // Hide button
    const hideBtn = document.createElement('button');
    hideBtn.textContent = 'Hide';
    hideBtn.className = 'btn-hide';
    hideBtn.onclick = () => {
        const targets = meshEntries.filter(e => e.selected);
        if (targets.length === 0) targets.push(entry);
        targets.forEach(t => {
            t.hidden = true;
            t.mesh.visible = false;
            hiddenMeshes.add(t.name);
        });
        closePopup();
        updateTagStats();
    };
    actionsEl.appendChild(hideBtn);

    // Position popup
    popup.style.display = 'block';
    const popupRect = popup.getBoundingClientRect();
    let px = x + 15;
    let py = y - 10;
    // Clamp to viewport
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

// --- ANIMATION ---
function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
