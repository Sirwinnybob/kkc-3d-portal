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
const meshToEntry = new Map(); // O(1) lookup from THREE.Mesh to entry object
const selectedEntries = new Set(); // O(1) tracking of selected meshes

const statusText = document.getElementById('status-text');
const updateStatus = (msg) => { if (statusText) statusText.innerText = msg; };

const CATEGORY_COLORS = {
    tagged: new THREE.Color(0x28a745),
    ignore: new THREE.Color(0xdc3545),
    null: new THREE.Color(0x888888)
};

// --- INIT ---
async function init() {
    // Populate dropdowns
    const selCategory = document.getElementById('sel-category');
    const selStyle = document.getElementById('sel-style');
    const selFile = document.getElementById('sel-file');

    let categoriesData = {};

    try {
        const resp = await fetch('/api/showroom/categories');
        const data = await resp.json();
        if (data.success) categoriesData = data.categories;
    } catch (e) {
        updateStatus('Failed to load showroom data');
        return;
    }

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

    // Load button
    document.getElementById('btn-load').onclick = () => loadGlb();

    // Tag actions
    document.getElementById('btn-tag-selected').onclick = () => tagSelected();
    document.getElementById('btn-select-all').onclick = () => {
        meshEntries.forEach(e => toggleSelection(e, true));
    };
    document.getElementById('btn-deselect-all').onclick = () => {
        selectedEntries.forEach(e => toggleSelection(e, false));
    };
    document.getElementById('btn-save').onclick = () => saveTags();

    // Click-to-select on 3D view
    renderer.domElement.addEventListener('click', onCanvasClick);

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });

    animate();
}

async function loadGlb() {
    const category = document.getElementById('sel-category').value;
    const style = document.getElementById('sel-style').value;
    const file = document.getElementById('sel-file').value;
    if (!file) { updateStatus('Select a file first'); return; }

    updateStatus('Loading...');

    // Clear previous
    if (loadedModel) { scene.remove(loadedModel); loadedModel = null; }
    meshEntries = [];
    meshToEntry.clear();
    selectedEntries.clear();

    // Check for full version first (for re-tagging)
    const baseName = file.replace(/\.glb$/i, '');
    const fullUrl = `/showroom/${encodeURIComponent(category)}/${encodeURIComponent(style)}/${encodeURIComponent(baseName + '.full.glb')}`;
    const normalUrl = `/showroom/${encodeURIComponent(category)}/${encodeURIComponent(style)}/${encodeURIComponent(file)}`;

    // Try full version first, fall back to normal
    let glbUrl = normalUrl;
    try {
        const headResp = await fetch(fullUrl, { method: 'HEAD' });
        if (headResp.ok) glbUrl = fullUrl;
    } catch { /* use normal */ }

    // Load existing tags if any
    let existingTags = null;
    try {
        const tagsResp = await fetch(`/api/showroom/tags/${encodeURIComponent(category)}/${encodeURIComponent(style)}/${encodeURIComponent(file)}`);
        if (tagsResp.ok) {
            const tagsData = await tagsResp.json();
            if (tagsData.success) existingTags = tagsData.tags;
        }
    } catch { /* no existing tags */ }

    const loader = new GLTFLoader();
    loader.load(glbUrl, (gltf) => {
        const model = gltf.scene;
        loadedModel = model;

        // Traverse and collect meshes
        model.traverse((child) => {
            if (child.isMesh) {
                const name = child.name || `Mesh_${meshEntries.length}`;
                // Convert to Lambert for consistent look
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

        // Frame camera
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
        camera.lookAt(center);
        controls.target.copy(center);
        controls.update();

        // Show mesh list
        document.getElementById('mesh-list-section').style.display = 'block';
        document.getElementById('mesh-count').textContent = `(${meshEntries.length})`;
        renderMeshList();
        updateMeshColors();
        updateStatus(`Loaded ${meshEntries.length} meshes`);
    }, (xhr) => {
        if (xhr.lengthComputable) {
            updateStatus(`Downloading: ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
        }
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

function updateMeshColors() {
    meshEntries.forEach(entry => updateSingleMeshColor(entry));
}

function updateSingleMeshColor(entry) {
    if (!entry) return;
    const color = CATEGORY_COLORS[entry.tag] || CATEGORY_COLORS[null];
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

    // Toggle selection
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

async function saveTags() {
    const category = document.getElementById('sel-category').value;
    const style = document.getElementById('sel-style').value;
    const file = document.getElementById('sel-file').value;
    if (!file) { updateStatus('No file loaded'); return; }

    const meshTags = {};
    const taggedMeshes = [];
    meshEntries.forEach(entry => {
        if (entry.tag) {
            meshTags[entry.name] = entry.tag;
            if (entry.tag === 'tagged') taggedMeshes.push(entry.name);
        }
    });

    const tags = {
        file,
        category,
        style,
        extracted: false,
        meshTags,
        taggedMeshes
    };

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

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
