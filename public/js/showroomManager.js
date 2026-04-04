import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';


// Must stay in sync with server.js
const OVERLAY_CATEGORIES_V    = ['doors', 'drawer_fronts'];
const NON_OVERLAY_CATEGORIES_V = ['finished_ends'];
const DIRECT_CATEGORIES_V     = ['base', 'crown', 'drawers', 'case_parts', 'wall', 'counter_top', 'floor'];
const KITCHEN_CATS = [...DIRECT_CATEGORIES_V, ...OVERLAY_CATEGORIES_V, ...NON_OVERLAY_CATEGORIES_V];
const ISLAND_CATS  = [...DIRECT_CATEGORIES_V, ...OVERLAY_CATEGORIES_V, ...NON_OVERLAY_CATEGORIES_V];

export class ShowroomManager {
    constructor(options) {
        this.scene = options.scene;
        this.camera = options.camera;
        this.renderer = options.renderer;
        this.controls = options.controls;
        this.composer = options.composer;
        this.callbacks = options.callbacks || {};

        this.showroomPin = null;
        this.showroomCategories = {};
        this.showroomParts = {}; // { category: { group, style, file, tagData } }
        this.kitchenMaterials = [];
        this.islandMaterials = [];

        this.kitchenStyle = 'face_frame';
        this.overlayStyle = 'full';
        this.islandOverlayStyle = 'full';
        this.islandStyle = 'face_frame';
    }


    async initShowroomMode(pinToLoad) {
        this.updateStatus('Loading Showroom...');

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
            if (data.success) this.showroomCategories = data.categories;
        } catch (e) {
            this.updateStatus('Failed to load showroom data', true);
            return;
        }

        // Setup style toggles
        this.setupStyleToggle('kitchen-style-toggle', (style) => {
            this.kitchenStyle = style;
            this.populateKitchenParts();
        });
        this.setupStyleToggle('island-style-toggle', (style) => {
            this.islandStyle = style;
            this.populateIslandParts();
        });
        // Setup overlay toggles
        this.setupStyleToggle('overlay-toggle', (style) => {
            this.overlayStyle = style;
            this.populateKitchenParts();
        });
        this.setupStyleToggle('island-overlay-toggle', (style) => {
            this.islandOverlayStyle = style;
            this.populateIslandParts();
        });

        // Populate initial parts
        await Promise.all([
            this.populateKitchenParts(),
            this.populateIslandParts()
        ]);

        if (!pinToLoad) {
            this.reframeShowroomCamera();
        }

        // Setup save config button
        if (saveConfigBtn) saveConfigBtn.onclick = () => this.saveShowroomConfig();

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
                    }, 2000);
                }).catch(err => {
                    this.updateStatus('Failed to copy PIN', true);
                });
            };
        }

        if (pinToLoad) {
            await this.loadShowroomConfig(pinToLoad);
        } else {
            this.updateStatus('Showroom Ready');
        }
    }

    setupStyleToggle(elementId, onChange) {
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

    setStyleToggle(elementId, style) {
        const toggle = document.getElementById(elementId);
        if (!toggle) return;
        const buttons = toggle.querySelectorAll('.style-btn');
        buttons.forEach(btn => {
            if (btn.dataset.style === style) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }


    flattenCatTree(node, prefix) {
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

    resolveCatNode(catData, cat, style, overlay) {
        if (!catData) return null;
        if (DIRECT_CATEGORIES_V.includes(cat)) {
            return catData[cat] ? { node: catData[cat], prefix: cat } : null;
        }
        if (!style) return null;
        if (style === 'face_frame') {
            if (OVERLAY_CATEGORIES_V.includes(cat)) {
                const ov = overlay || 'full_overlay';
                const node = catData[style]?.[ov]?.[cat];
                return node ? { node, prefix: `${style}/${ov}/${cat}` } : null;
            }
            if (NON_OVERLAY_CATEGORIES_V.includes(cat)) {
                const node = catData[style]?.[cat];
                return node ? { node, prefix: `${style}/${cat}` } : null;
            }
        } else {
            const node = catData[style]?.[cat];
            return node ? { node, prefix: `${style}/${cat}` } : null;
        }
        return null;
    }

    async populateContextParts(ctx, panelId, style, overlay) {
        const catData = this.showroomCategories?.[ctx];
        const categories = ctx === 'kitchen' ? KITCHEN_CATS : ISLAND_CATS;

        const overlaySection = document.getElementById(
            ctx === 'kitchen' ? 'overlay-section' : 'island-overlay-section'
        );
        if (overlaySection) overlaySection.style.display = (style === 'face_frame') ? '' : 'none';

        const promises = categories.map(cat => {
            const container = document.querySelector(`#${panelId} .part-options[data-category="${cat}"]`);
            const catWrapper = document.querySelector(`#${panelId} .part-category[data-category="${cat}"]`);
            if (!container) return Promise.resolve();

            const resolved = this.resolveCatNode(catData, cat, style, overlay);
            const entries  = resolved ? this.flattenCatTree(resolved.node, `${ctx}/${resolved.prefix}`) : [];

            if (catWrapper) catWrapper.style.display = entries.length > 0 ? '' : 'none';
            this.renderPartOptions(container, cat, ctx, entries);

            const buttons = container.querySelectorAll('.part-option-btn');
            if (buttons.length > 0) {
                const hasActive = Array.from(buttons).some(b => b.classList.contains('active'));
                if (!hasActive) {
                    const btn = buttons[0];
                    return this.loadShowroomPart(cat, ctx, btn.dataset.deeppath, btn);
                }
            }
            return Promise.resolve();
        });
        await Promise.all(promises);
    }

    async populateKitchenParts() {
        const ov = this.overlayStyle === 'full' ? 'full_overlay' : 'half_overlay';
        await this.populateContextParts('kitchen', 'kitchen-parts', this.kitchenStyle, ov);
    }

    async populateIslandParts() {
        const ov = this.islandOverlayStyle === 'full' ? 'full_overlay' : 'half_overlay';
        await this.populateContextParts('island', 'island-parts', this.islandStyle, ov);
    }

    renderPartOptions(container, category, ctx, entries) {
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

            const current = this.showroomParts[`${ctx}/${category}`];
            if (current && current.deepPath === entry.deepPath) btn.classList.add('active');

            btn.onclick = () => this.loadShowroomPart(category, ctx, entry.deepPath, btn);
            container.appendChild(btn);
        });
    }


    async loadShowroomPart(category, ctx, deepPath, btnEl) {
        if (!this.renderer || !deepPath) return;
        const partKey = `${ctx}/${category}`;

        if (btnEl) {
            btnEl.parentElement.querySelectorAll('.part-option-btn').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active', 'loading');
        }

        if (this.showroomParts[partKey]) {
            if (category === 'finished_ends') this.restoreBasePaneledEndMeshes(ctx);

            const oldPart = this.showroomParts[partKey].group;
            this.scene.remove(oldPart);

            // Collect meshes for array filtering
            const oldMeshes = new Set();
            oldPart.traverse(c => { if (c.isMesh) oldMeshes.add(c); });

            // Memory cleanup logic for WebGL
            oldPart.traverse((child) => {
                if (child.isMesh) {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => {
                            if (m.map) m.map.dispose();
                            m.dispose();
                        });
                    }
                }
            });

            // Tell viewer.js to prune old meshes from materials arrays
            if (this.callbacks.onMeshesUpdated) {
                this.callbacks.onMeshesUpdated('remove', oldMeshes);
            }

            delete this.showroomParts[partKey];
        }

        let tagData = null;
        try {
            const tagsResp = await fetch(`/api/showroom/tags/${deepPath}`);
            if (tagsResp.ok) { const td = await tagsResp.json(); if (td.success) tagData = td.tags; }
        } catch { /* no tags */ }

        const glbUrl = `/showroom/${deepPath}`;
        const loader = new GLTFLoader();

        if (this.scene) {
            const isLightMode = localStorage.getItem("lightMode") === "true";
            this.scene.background = new THREE.Color(isLightMode ? 0xf0f0f0 : 0x111111);
        }

        return new Promise((resolve) => {
            loader.load(glbUrl, (gltf) => {
                const group = gltf.scene;
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

                    child.castShadow = true;
                    child.receiveShadow = true;
                });

                this.scene.add(group);
                this.showroomParts[partKey] = {
                    group,
                    style: ctx === 'kitchen' ? this.kitchenStyle : this.islandStyle,
                    file: deepPath,
                    tagData
                };

                if (category === 'finished_ends') this.handlePaneledEndSwap(ctx, deepPath);

                if (btnEl) btnEl.classList.remove('loading');

                // Let viewer.js parse the new meshes and add them to detectedMaterials
                if (this.callbacks.onMeshesUpdated) {
                    this.callbacks.onMeshesUpdated('add', group);
                }

                if (this.composer) {
                    this.composer.render();
                } else {
                    this.renderer.render(this.scene, this.camera);
                }

                resolve();
            }, undefined, (err) => {
                console.error(`[Showroom] Failed to load /showroom/${deepPath}`, err);
                if (btnEl) btnEl.classList.remove('loading');
                resolve();
            });
        });
    }

    handlePaneledEndSwap(ctx, deepPath) {
        if (!/paneled/i.test(deepPath)) { this.restoreBasePaneledEndMeshes(ctx); return; }
        const basePart = this.showroomParts[`${ctx}/base`];
        if (!basePart?.tagData?.paneledEndReplacements) return;
        const replaceableNames = new Set(basePart.tagData.paneledEndReplacements);
        basePart.group.traverse(child => {
            if (child.isMesh && replaceableNames.has(child.name)) {
                child.visible = false;
                child.userData._hiddenByPaneledEnd = true;
            }
        });
    }

    restoreBasePaneledEndMeshes(ctx) {
        const basePart = this.showroomParts[`${ctx}/base`];
        if (!basePart) return;
        basePart.group.traverse(child => {
            if (child.isMesh && child.userData._hiddenByPaneledEnd) {
                child.visible = true;
                delete child.userData._hiddenByPaneledEnd;
            }
        });
    }

    reframeShowroomCamera() {
        const box = new THREE.Box3();
        let hasContent = false;
        for (const part of Object.values(this.showroomParts)) {
            const partBox = new THREE.Box3().setFromObject(part.group);
            if (!partBox.isEmpty()) {
                box.union(partBox);
                hasContent = true;
            }
        }
        if (hasContent && this.camera && this.controls) {
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = this.camera.fov * (Math.PI / 180);
            let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
            cameraZ *= 2.0;

            this.camera.position.set(center.x, center.y + size.y / 2, center.z + cameraZ);
            this.camera.lookAt(center);
            this.controls.target.copy(center);
            this.controls.update();

            if (this.composer) {
                this.composer.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        }
    }


    async saveShowroomConfig() {
        const config = {
            kitchen: {
                style: this.kitchenStyle,
                parts: {},
                textures: {}
            },
            island: {
                style: this.islandStyle,
                parts: {},
                textures: {}
            },
            camera: {
                position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
                target: [this.controls.target.x, this.controls.target.y, this.controls.target.z]
            }
        };

        for (const [partKey, part] of Object.entries(this.showroomParts)) {
            const [ctx, cat] = partKey.split('/');
            const section = ctx === 'island' ? config.island : config.kitchen;
            section.parts[partKey] = { deepPath: part.file }; // using file instead of deepPath
        }

        // We need detectedMaterials to save the textures
        // We will request it via a callback or a getter from the wrapper.
        let currentMaterials = [];
        if (this.callbacks.getDetectedMaterials) {
            currentMaterials = this.callbacks.getDetectedMaterials();
        }

        for (const mat of currentMaterials) {
            if (!mat.hasTexture) continue;
            const section = mat.isIsland ? config.island : config.kitchen;
            const key = mat.name;
            if (mat.isColor) {
                section.textures[key] = { type: 'color', hex: mat.colorHex };
            } else if (mat.matchedName) {
                section.textures[key] = { type: 'texture', name: mat.matchedName, category: mat.bestCategory };
            }
        }

        this.updateStatus('Saving configuration...');
        try {
            const resp = await fetch('/api/showroom/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            const data = await resp.json();
            if (data.success) {
                this.showroomPin = data.pin;
                const roomDisplay = document.getElementById('room-name-display');
                if (roomDisplay) roomDisplay.innerText = `PIN: ${data.pin}`;

                const pinModal = document.getElementById('pin-modal');
                const pinDisplay = document.getElementById('pin-display');
                if (pinDisplay) pinDisplay.textContent = data.pin;
                if (pinModal) {
                    pinModal.classList.add('show');
                    const closeBtn = document.getElementById('pin-modal-close');
                    if (closeBtn) closeBtn.focus();
                }
                this.updateStatus('Configuration saved!');
                setTimeout(() => this.updateStatus(''), 3000);
            } else {
                this.updateStatus('Failed to save', true);
            }
        } catch (e) {
            this.updateStatus('Save error', true);
            console.error(e);
        }
    }

    async loadShowroomConfig(pin) {
        this.updateStatus(`Loading PIN ${pin}...`);
        try {
            const resp = await fetch(`/api/showroom/config/${encodeURIComponent(pin)}`);
            const data = await resp.json();
            if (!data.success || !data.config) {
                this.updateStatus('PIN not found', true);
                return;
            }

            const config = data.config;
            this.showroomPin = pin;

            if (config.kitchen && config.kitchen.style) {
                this.kitchenStyle = config.kitchen.style;
                this.setStyleToggle('kitchen-style-toggle', this.kitchenStyle);
                this.populateKitchenParts();
            }
            if (config.island && config.island.style) {
                this.islandStyle = config.island.style;
                this.setStyleToggle('island-style-toggle', this.islandStyle);
                this.populateIslandParts();
            }

            const loadPromises = [];
            const allParts = { ...(config.kitchen?.parts || {}), ...(config.island?.parts || {}) };
            for (const [partKey, partInfo] of Object.entries(allParts)) {
                const [ctx, cat] = partKey.split('/');
                if (partInfo.deepPath) {
                    loadPromises.push(this.loadShowroomPart(cat, ctx, partInfo.deepPath, null));
                }
            }
            await Promise.all(loadPromises);

            if (config.camera) {
                this.camera.position.set(...config.camera.position);
                this.controls.target.set(...config.camera.target);
                this.controls.update();
            }

            // Restore Textures using MaterialManager via callback
            if (this.callbacks.onRefineMaterials) {
                this.callbacks.onRefineMaterials(config);
            }

            this.updateStatus('Configuration loaded!');
            setTimeout(() => this.updateStatus(''), 3000);

            if (this.composer) {
                this.composer.render();
            } else {
                this.renderer.render(this.scene, this.camera);
            }
        } catch (e) {
            this.updateStatus('Load error', true);
            console.error(e);
        }
    }

    updateStatus(msg, isError = false) {
        if (this.callbacks.onStatusUpdate) {
            this.callbacks.onStatusUpdate(msg, isError);
        }
    }
}
