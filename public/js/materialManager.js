export class MaterialManager {
    constructor(config) {
        this.detectedMaterials = config.detectedMaterials || [];
        this.jobCode = config.jobCode;
        this.room = config.room;
        this.isShowroomMode = config.isShowroomMode || false;

        // Callbacks
        this.onStatusUpdate = config.callbacks.onStatusUpdate || (() => {});
        this.onHighlightMesh = config.callbacks.onHighlightMesh || (() => {});
        this.onClearHighlight = config.callbacks.onClearHighlight || (() => {});
        this.onApplyTexture = config.callbacks.onApplyTexture || (() => {});
        this.onApplyColor = config.callbacks.onApplyColor || (() => {});

        // State
        this.selectedMaterialIndex = -1;
        this.textureCategories = [];
        this.currentCategoryTextures = [];
        this.isMatchingAll = false;

        // Quick Picker State
        this.qpMatGroupIndex = -1;
        this.qpTappedMesh = null;
        this.qpReplaceAll = true;
        this.qpCurrentTextures = [];
        this.qpPaintMode = false;
        this.qpLastTextureUrl = null;
        this.qpLastTextureName = null;
        this.qpLastColorHex = null;
        this.qpLastColorHex = null;

        this.COLOR_PRESETS = [
            { name: 'White', hex: '#FFFFFF' },
            { name: 'Cream', hex: '#F5F0E1' },
            { name: 'Navy', hex: '#1B2A4A' },
            { name: 'Sage Green', hex: '#9CAF88' },
            { name: 'Charcoal', hex: '#36454F' },
            { name: 'Black', hex: '#1C1C1C' },
            { name: 'Dove Gray', hex: '#B0B0B0' },
            { name: 'Warm Taupe', hex: '#B39B86' }
        ];

        this.initDOM();
        this.bindEvents();
    }

    escapeHtml(unsafe) {
        if (!unsafe || typeof unsafe !== 'string') return unsafe;
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    initDOM() {
        // Texture Panel
        this.textureBtn = document.getElementById('texture-btn');
        this.texturePanel = document.getElementById('texture-panel');
        this.closeTextureBtn = document.getElementById('close-texture-btn');
        this.materialList = document.getElementById('material-list');
        this.textureGrid = document.getElementById('texture-grid');
        this.textureSearch = document.getElementById('texture-search');
        this.catalogTitle = document.getElementById('catalog-title');
        this.backToMaterialsBtn = document.getElementById('back-to-materials');

        this.clearSearchBtn = document.getElementById('clear-texture-search');
        this.clearSearchEmptyBtn = document.getElementById('clear-search-empty');
        this.searchEmptyState = document.getElementById('texture-search-empty');

        // Replace Sheet
        this.tapReplaceSheet = document.getElementById('tap-replace-sheet');
        this.tapReplaceLabel = document.getElementById('tap-replace-label');
        this.tapReplaceAllBtn = document.getElementById('tap-replace-all-btn');
        this.tapReplaceOneBtn = document.getElementById('tap-replace-one-btn');
        this.tapReplaceCancel = document.getElementById('tap-replace-cancel');
        this.tapReplaceBackdrop = document.getElementById('tap-replace-backdrop');

        // Quick Picker
        this.qpEl = document.getElementById('quick-picker');
        this.qpTitle = document.getElementById('qp-title');
        this.qpCategoriesBack = document.getElementById('qp-categories-back');
        this.qpClose = document.getElementById('qp-close');
        this.qpSearchInput = document.getElementById('qp-search-input');
        this.qpClearSearch = document.getElementById('qp-clear-search');
        this.qpViewsContainer = document.getElementById('qp-views-container');
        this.qpCategoriesView = document.getElementById('qp-categories-view');
        this.qpCategoryGrid = document.getElementById('qp-category-grid');
        this.qpTexturesView = document.getElementById('qp-textures-view');
        this.qpTextureStrip = document.getElementById('qp-texture-strip');
    }

    bindEvents() {
        // Toggle texture panel
        if (this.textureBtn) {
            this.textureBtn.onclick = () => {
                this.texturePanel.classList.toggle('show');
                const isVisible = this.texturePanel.classList.contains('show');
                this.textureBtn.setAttribute('aria-expanded', isVisible.toString());
                if (isVisible) {
                    this.renderMaterialList();
                    if (this.closeTextureBtn) {
                        requestAnimationFrame(() => this.closeTextureBtn.focus());
                    }
                }
            };
        }
        if (this.closeTextureBtn) {
            this.closeTextureBtn.onclick = () => {
                this.texturePanel.classList.remove('show');
                if (this.textureBtn) {
                    this.textureBtn.setAttribute('aria-expanded', 'false');
                    this.textureBtn.focus();
                }
            };
        }

        // Back to materials
        if (this.backToMaterialsBtn) {
            this.backToMaterialsBtn.onclick = () => {
                this.renderMaterialList();
                if (this.selectedMaterialIndex >= 0) {
                    const index = this.selectedMaterialIndex;
                    requestAnimationFrame(() => {
                        const item = this.materialList.querySelector(`.material-item[data-index="${index}"]`);
                        if (item) item.focus();
                    });
                }
            };
        }

        // Search in texture grid
        if (this.textureSearch) {
            this.textureSearch.oninput = () => {
                const q = this.textureSearch.value.toLowerCase();
                const thumbs = this.textureGrid.querySelectorAll('.texture-thumb');
                let visibleCount = 0;

                thumbs.forEach(th => {
                    const name = th.dataset.search || '';
                    const isVisible = name.includes(q);
                    th.style.display = isVisible ? '' : 'none';
                    if (isVisible) visibleCount++;
                });

                if (this.clearSearchBtn) this.clearSearchBtn.style.display = q ? 'flex' : 'none';
                if (this.searchEmptyState) this.searchEmptyState.style.display = (q && visibleCount === 0) ? 'block' : 'none';
            };
        }

        if (this.clearSearchBtn) {
            this.clearSearchBtn.onclick = () => this.clearSearch(true);
        }
        if (this.clearSearchEmptyBtn) {
            this.clearSearchEmptyBtn.onclick = () => this.clearSearch(true);
        }

        // Replace Sheet Events
        if (this.tapReplaceAllBtn) {
            this.tapReplaceAllBtn.addEventListener('click', () => {
                this.qpReplaceAll = true;
                this.closeReplaceSheet();
                this._doOpenQuickPicker();
            });
        }
        if (this.tapReplaceOneBtn) {
            this.tapReplaceOneBtn.addEventListener('click', () => {
                this.qpReplaceAll = false;
                this.qpPaintMode = true;
                this.closeReplaceSheet();
                this._doOpenQuickPicker();
            });
        }
        if (this.tapReplaceCancel) this.tapReplaceCancel.addEventListener('click', () => this.closeReplaceSheet());
        if (this.tapReplaceBackdrop) this.tapReplaceBackdrop.addEventListener('click', () => this.closeReplaceSheet());

        // Quick Picker Events
        if (this.qpClose) this.qpClose.addEventListener('click', () => this.closeQuickPicker());
        if (this.qpCategoriesBack) {
            this.qpCategoriesBack.addEventListener('click', () => {
                const mat = this.qpMatGroupIndex >= 0 ? this.detectedMaterials[this.qpMatGroupIndex] : null;
                this.showQpCategoriesView();
                if (mat) this.loadQpCategories(mat);
            });
        }

        if (this.qpSearchInput) {
            this.qpSearchInput.addEventListener('input', () => {
                const q = this.qpSearchInput.value.toLowerCase();
                if (this.qpClearSearch) this.qpClearSearch.style.display = q ? 'block' : 'none';

                const isTexturesView = this.qpViewsContainer.classList.contains('show-textures');
                if (isTexturesView) {
                    const thumbs = this.qpTextureStrip.querySelectorAll('.qp-tex-item');
                    thumbs.forEach(th => {
                        const name = th.dataset.search || '';
                        th.style.display = name.includes(q) ? '' : 'none';
                    });
                } else {
                    const cats = this.qpCategoryGrid.querySelectorAll('.qp-category-btn');
                    cats.forEach(btn => {
                        const name = btn.dataset.search || '';
                        btn.style.display = name.includes(q) ? '' : 'none';
                    });
                }
            });
        }
        if (this.qpClearSearch) {
            this.qpClearSearch.addEventListener('click', () => {
                if (this.qpSearchInput) {
                    this.qpSearchInput.value = '';
                    this.qpSearchInput.dispatchEvent(new Event('input'));
                    this.qpSearchInput.focus();
                }
            });
        }
    }

    insertBrowseButton() {
        const browseBtn = document.createElement('button');
        browseBtn.className = 'browse-all-categories-btn';
        browseBtn.innerText = '\u2190 Browse All Categories';
        browseBtn.onclick = () => this.showAllCategories();
        this.textureGrid.insertBefore(browseBtn, this.textureGrid.firstChild);
    }

    clearSearch(shouldFocus = false) {
        if (this.textureSearch) {
            this.textureSearch.value = '';
            this.textureSearch.dispatchEvent(new Event('input'));
            if (shouldFocus) this.textureSearch.focus();
        }
    }

    async matchAllTextures() {
        if (this.isMatchingAll) return;
        this.isMatchingAll = true;

        const texturedMaterials = this.detectedMaterials.filter(m => m.hasTexture);
        if (texturedMaterials.length === 0) {
            this.isMatchingAll = false;
            return;
        }

        this.onStatusUpdate('Loading texture data...');

        let manifestLoaded = false;
        try {
            const resp = await fetch(`/api/job/${encodeURIComponent(this.jobCode)}/${encodeURIComponent(this.room)}/textures`);
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
                            if (entry.bestMatch) {
                                mat.urlHigh = entry.bestMatch.url;
                                mat.urlMedium = entry.bestMatch.urlMedium;
                                mat.urlLow = entry.bestMatch.urlLow;
                                mat.width = entry.bestMatch.width;
                                mat.height = entry.bestMatch.height;
                                mat.currentLODUrl = mat.urlHigh;

                                // Auto-replace texture if it's an exact/very close match
                                if (entry.distance !== undefined && entry.distance <= 5) {
                                    const texUrl = mat.urlLow || mat.urlHigh; // Load lowest res first to be fast
                                    if (texUrl) {
                                        // We trigger the same logic as onApplyTexture but silently
                                        this.onApplyTexture(
                                            this.detectedMaterials.indexOf(mat),
                                            mat.urlHigh,
                                            mat.urlMedium,
                                            mat.urlLow,
                                            mat.matchedName,
                                            null,
                                            true,
                                            mat.width,
                                            mat.height
                                        );
                                    }
                                }
                            }
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

        if (!manifestLoaded) {
            this.onStatusUpdate(`Matching ${texturedMaterials.length} textures...`);
            for (let i = 0; i < texturedMaterials.length; i++) {
                const mat = texturedMaterials[i];
                try {
                    await this.matchTexture(mat);
                } catch (e) {
                    console.error("Match error:", e);
                }
                if (this.texturePanel.classList.contains('show')) this.renderMaterialList();
            }
        }

        this.isMatchingAll = false;
        this.onStatusUpdate('');
        if (this.texturePanel.classList.contains('show')) this.renderMaterialList();
    }

    renderMaterialList() {
        this.clearSearch(false);
        if (!this.materialList) return;
        this.materialList.innerHTML = '';

        const visibleMaterials = this.detectedMaterials.filter(mat => mat.hasTexture && !mat.isHidden);

        if (visibleMaterials.length === 0) {
            const div = document.createElement('div');
            div.style.cssText = 'padding:20px; text-align:center; color:#888;';
            div.textContent = this.isMatchingAll ? 'Matching textures...' : 'No customizable textures found.';
            this.materialList.appendChild(div);
            return;
        }

        if (this.isShowroomMode) {
            const kitchenVis = [];
            const islandVis = [];
            for (const m of visibleMaterials) {
                if (m.isIsland) islandVis.push(m);
                else kitchenVis.push(m);
            }

            if (kitchenVis.length > 0) {
                const header = document.createElement('div');
                header.className = 'material-section-header';
                header.textContent = 'Kitchen';
                this.materialList.appendChild(header);
                kitchenVis.forEach(mat => this.materialList.appendChild(this.createMaterialItem(mat)));
            }
            if (islandVis.length > 0) {
                const header = document.createElement('div');
                header.className = 'material-section-header';
                header.textContent = 'Island';
                this.materialList.appendChild(header);
                islandVis.forEach(mat => this.materialList.appendChild(this.createMaterialItem(mat)));
            }
        } else {
            // Group materials by matchedName or original texture name
            const groupedMaterials = new Map();
            visibleMaterials.forEach(mat => {
                let displayName = mat.matchedName;
                if (!displayName) {
                    // Provide a cleaner fallback name instead of raw mesh names
                    if (mat.name && mat.name.startsWith('N_Sh')) {
                        displayName = 'Customizable Material';
                    } else if (mat.name && mat.name.includes('Material_')) {
                        displayName = 'Customizable Material';
                    } else {
                        displayName = mat.name || 'Customizable Material';
                    }
                }

                if (!groupedMaterials.has(displayName)) {
                    groupedMaterials.set(displayName, {
                        displayName: displayName,
                        primaryMat: mat,
                        indices: [this.detectedMaterials.indexOf(mat)]
                    });
                } else {
                    groupedMaterials.get(displayName).indices.push(this.detectedMaterials.indexOf(mat));
                }
            });

            Array.from(groupedMaterials.values()).forEach(group => {
                this.materialList.appendChild(this.createGroupedMaterialItem(group));
            });
        }

        document.getElementById('materials-view').style.display = 'block';
        document.getElementById('catalog-view').style.display = 'none';
    }

    createGroupedMaterialItem(group) {
        const btn = document.createElement('button');
        btn.className = 'material-item';
        const mat = group.primaryMat;
        // Store indices to apply to all when clicked
        btn.dataset.indices = JSON.stringify(group.indices);

        if (!mat.previewCache && mat.hasTexture && mat.material.map && mat.material.map.image) {
            try {
                const img = mat.material.map.image;
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 64, 64);
                mat.previewCache = `<img class="material-preview" src="${canvas.toDataURL()}" alt="Preview">`;
            } catch {
                mat.previewCache = `<div class="material-preview-placeholder" style="background-color: #${mat.material.color.getHexString()}"></div>`;
            }
        } else if (!mat.previewCache) {
            const colorHex = mat.material.color ? mat.material.color.getHexString() : 'cccccc';
            mat.previewCache = `<div class="material-preview-placeholder" style="background-color: #${colorHex}"></div>`;
        }

        const previewHtml = mat.previewCache;
        const displayName = group.displayName;
        btn.innerHTML = `
            <div class="material-item-left">
                ${previewHtml}
                <div class="material-info">
                    <span class="material-name" title="${this.escapeHtml(displayName)}">${this.escapeHtml(displayName)}</span>
                    <span class="material-status">Customizable</span>
                </div>
            </div>
            <span class="material-badge">${mat.isColor ? 'Color' : 'Has Texture'}</span>
        `;
        btn.onclick = () => {
            // When user clicks a grouped material row, we just treat the first index as the active one
            // for the catalog view, but we'll apply texture changes to ALL grouped indices
            this.selectedGroupIndices = group.indices;
            this.selectMaterial(group.indices[0], group.displayName);
        };
        return btn;
    }

    createMaterialItem(mat) {
        const btn = document.createElement('button');
        btn.className = 'material-item';
        const originalIndex = this.detectedMaterials.indexOf(mat);
        btn.dataset.index = originalIndex.toString();

        if (!mat.previewCache && mat.hasTexture && mat.material.map && mat.material.map.image) {
            try {
                const img = mat.material.map.image;
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 64, 64);
                mat.previewCache = `<img class="material-preview" src="${canvas.toDataURL()}" alt="Preview">`;
            } catch {
                mat.previewCache = `<div class="material-preview-placeholder" style="background-color: #${mat.material.color.getHexString()}"></div>`;
            }
        } else if (!mat.previewCache) {
            const colorHex = mat.material.color ? mat.material.color.getHexString() : 'cccccc';
            mat.previewCache = `<div class="material-preview-placeholder" style="background-color: #${colorHex}"></div>`;
        }

        const previewHtml = mat.previewCache;
        const displayName = mat.matchedName || mat.name;
        btn.innerHTML = `
            <div class="material-item-left">
                ${previewHtml}
                <div class="material-info">
                    <span class="material-name" title="${this.escapeHtml(displayName)}">${this.escapeHtml(displayName)}</span>
                    <span class="material-status">Customizable</span>
                </div>
            </div>
            <span class="material-badge">${mat.isColor ? 'Color' : 'Has Texture'}</span>
        `;
        btn.onclick = () => this.selectMaterial(originalIndex);
        return btn;
    }

    async selectMaterial(index, customTitle = null) {
        this.selectedMaterialIndex = index;
        const mat = this.detectedMaterials[index];
        document.getElementById('materials-view').style.display = 'none';
        document.getElementById('catalog-view').style.display = 'block';
        this.catalogTitle.innerText = `Replace: ${customTitle || mat.matchedName || mat.name}`;

        if (this.backToMaterialsBtn) {
            requestAnimationFrame(() => this.backToMaterialsBtn.focus());
        }

        if (mat.bestCategory) {
            await this.loadCategoryTextures(mat.bestCategory);
            if (mat.similarTextures && mat.similarTextures.length > 0) {
                const existingUrls = new Set(this.currentCategoryTextures.map(ct => ct.url));
                const uniqueSimilar = mat.similarTextures.filter(t => !existingUrls.has(t.url));
                this.currentCategoryTextures = [...uniqueSimilar, ...this.currentCategoryTextures];
                this.renderTextureGrid();
                this.insertBrowseButton();
            }
        } else if (mat.hasTexture && mat.originalMap) {
            await this.matchAndShowCatalog(mat);
        } else {
            await this.showAllCategories();
        }
    }

    async matchTexture(mat) {
        if (!mat.hasTexture || !mat.originalMap) return null;
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
            body: JSON.stringify({ imageData, jobCode: this.jobCode, room: this.room, materialName: mat.name })
        });
        const data = await resp.json();

        if (data.success && data.matched) {
            mat.matchedName = data.bestMatch ? data.bestMatch.name : null;
            mat.bestCategory = data.bestCategory;
            mat.similarTextures = data.similarTextures;
            mat.isHidden = !!data.isHidden;
            mat.previewCache = null;
            if (data.bestMatch) {
                mat.urlHigh = data.bestMatch.url;
                mat.urlMedium = data.bestMatch.urlMedium;
                mat.urlLow = data.bestMatch.urlLow;
                mat.width = data.bestMatch.width;
                mat.height = data.bestMatch.height;
                mat.currentLODUrl = mat.urlHigh;

                // Auto-replace texture if it's an exact/very close match
                if (data.distance !== undefined && data.distance <= 5) {
                    const texUrl = mat.urlLow || mat.urlHigh;
                    if (texUrl) {
                        this.onApplyTexture(
                            this.detectedMaterials.indexOf(mat),
                            mat.urlHigh,
                            mat.urlMedium,
                            mat.urlLow,
                            mat.matchedName,
                            null,
                            true,
                            mat.width,
                            mat.height
                        );
                    }
                }
            }
        } else {
            mat.matchedName = null;
            mat.isHidden = false;
        }
        if (mat.originalMatchedName === undefined) mat.originalMatchedName = mat.matchedName;
        return data;
    }

    async matchAndShowCatalog(mat) {
        this.onStatusUpdate("Matching texture...");
        try {
            const data = await this.matchTexture(mat);

            if (data && data.success && data.matched && data.bestCategory) {
                if (mat.matchedName) {
                    this.catalogTitle.innerText = `Replace: ${mat.matchedName}`;
                }

                await this.loadCategoryTextures(data.bestCategory);
                if (data.similarTextures && data.similarTextures.length > 0) {
                    const existingUrls = new Set(this.currentCategoryTextures.map(ct => ct.url));
                    const uniqueSimilar = data.similarTextures.filter(t => !existingUrls.has(t.url));
                    this.currentCategoryTextures = [...uniqueSimilar, ...this.currentCategoryTextures];
                }
                this.renderTextureGrid();
                this.insertBrowseButton();
            } else {
                await this.showAllCategories();
            }
            this.onStatusUpdate("");
        } catch (e) {
            console.error("Texture match error:", e);
            this.onStatusUpdate("");
            await this.showAllCategories();
        }
    }

    async showAllCategories() {
        try {
            const resp = await fetch('/api/textures');
            const data = await resp.json();
            if (data.success) {
                this.textureCategories = data.categories;
                this.textureGrid.innerHTML = '';
                this.catalogTitle.innerText = 'Select a Category';

                const colorBtn = document.createElement('button');
                colorBtn.className = 'texture-category-btn';
                colorBtn.innerText = 'Solid Colors';
                colorBtn.onclick = () => this.showSolidColorsView();
                this.textureGrid.appendChild(colorBtn);

                this.textureCategories.forEach(cat => {
                    const btn = document.createElement('button');
                    btn.className = 'texture-category-btn';
                    btn.innerText = cat;
                    btn.onclick = () => this.loadCategoryTextures(cat);
                    this.textureGrid.appendChild(btn);
                });
            }
        } catch (e) {
            console.error("Failed to load categories:", e);
        }
    }

    showSolidColorsView() {
        if (this.selectedMaterialIndex < 0) return;
        this.catalogTitle.innerText = 'Solid Colors';
        this.textureGrid.innerHTML = '';

        this.insertBrowseButton();

        const presetsDiv = document.createElement('div');
        presetsDiv.className = 'color-presets';
        this.COLOR_PRESETS.forEach(preset => {
            const swatch = document.createElement('button');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = preset.hex;
            swatch.title = preset.name;
            swatch.onclick = () => {
                const indices = this.selectedGroupIndices || [this.selectedMaterialIndex];
                indices.forEach(idx => this.onApplyColor(idx, preset.hex, null, true));
                presetsDiv.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
                swatch.classList.add('active');
            };
            presetsDiv.appendChild(swatch);
        });
        this.textureGrid.appendChild(presetsDiv);

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
            const indices = this.selectedGroupIndices || [this.selectedMaterialIndex];
            indices.forEach(idx => this.onApplyColor(idx, picker.value, null, true));
            presetsDiv.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        };
        pickerRow.appendChild(pickerLabel);
        pickerRow.appendChild(picker);
        pickerRow.appendChild(hexDisplay);
        this.textureGrid.appendChild(pickerRow);

        const recent = this.getRecentColors();
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
                    const indices = this.selectedGroupIndices || [this.selectedMaterialIndex];
                    indices.forEach(idx => this.onApplyColor(idx, hex, null, true));
                };
                recentRow.appendChild(swatch);
            });
            recentSection.appendChild(recentRow);
            this.textureGrid.appendChild(recentSection);
        }
    }

    async loadCategoryTextures(category) {
        this.clearSearch(false);
        try {
            const resp = await fetch(`/api/textures/${encodeURIComponent(category)}`);
            const data = await resp.json();
            if (data.success) {
                this.currentCategoryTextures = data.textures;
                this.catalogTitle.innerText = category;
                this.renderTextureGrid();
                this.insertBrowseButton();
            }
        } catch (e) {
            console.error("Failed to load textures:", e);
        }
    }

    renderTextureGrid() {
        if (!this.textureGrid) return;
        this.textureGrid.innerHTML = '';
        this.currentCategoryTextures.forEach(tex => {
            const btn = document.createElement('button');
            btn.className = 'texture-thumb';
            btn.dataset.search = (tex.name || '').toLowerCase();
            btn.setAttribute('aria-label', `Select texture ${this.escapeHtml(tex.name)}`);
            btn.innerHTML = `<img src="${this.escapeHtml(tex.url)}" alt="${this.escapeHtml(tex.name)}" loading="lazy"><span>${this.escapeHtml(tex.name)}</span>`;
            btn.onclick = () => {
                const indices = this.selectedGroupIndices || [this.selectedMaterialIndex];
                indices.forEach(idx => this.onApplyTexture(idx, tex.url, tex.urlMedium, tex.urlLow, tex.name, null, true, tex.width, tex.height));
            };
            this.textureGrid.appendChild(btn);
        });
    }

    // --- QUICK PICKER ---

    openQuickPicker(matGroupIndex, mesh) {
        this.qpMatGroupIndex = matGroupIndex;
        this.qpTappedMesh = mesh;
        this.onHighlightMesh(mesh);

        const mat = this.detectedMaterials[matGroupIndex];
        const label = mat.matchedName || mat.name;

        if (mat.meshes.length > 1) {
            if (this.tapReplaceLabel) {
                this.tapReplaceLabel.textContent = `How do you want to change "${label}"?`;
            }
            if (this.tapReplaceSheet) {
                this.tapReplaceSheet.classList.add('show');
            }
            if (this.tapReplaceAllBtn) {
                requestAnimationFrame(() => this.tapReplaceAllBtn.focus());
            }
        } else {
            this.qpReplaceAll = true;
            this._doOpenQuickPicker();
        }
    }

    closeReplaceSheet() {
        if (this.tapReplaceSheet) this.tapReplaceSheet.classList.remove('show');
    }

    async _doOpenQuickPicker() {
        if (this.qpSearchInput) {
            this.qpSearchInput.value = '';
            this.qpSearchInput.dispatchEvent(new Event('input'));
        }

        if (this.qpMatGroupIndex < 0) return;
        const mat = this.detectedMaterials[this.qpMatGroupIndex];
        this.qpTitle.textContent = mat.matchedName || mat.name;

        if (mat.bestCategory) {
            this.showQpTexturesView();
            await this.loadQpCategoryTextures(mat.bestCategory, mat);
        } else {
            this.showQpCategoriesView();
            await this.loadQpCategories(mat);
        }
        if (this.qpEl) this.qpEl.classList.add('show');
        if (this.qpClose) {
            requestAnimationFrame(() => this.qpClose.focus());
        }
    }

    closeQuickPicker() {
        if (this.qpEl) this.qpEl.classList.remove('show');
        this.qpMatGroupIndex = -1;
        this.qpTappedMesh = null;
        this.qpCurrentTextures = [];
        this.qpPaintMode = false;
        this.qpLastTextureUrl = null;
        this.qpLastTextureName = null;
        this.onClearHighlight();
    }

    showQpCategoriesView() {
        if (this.qpViewsContainer) this.qpViewsContainer.classList.remove('show-textures');
        if (this.qpCategoriesBack) this.qpCategoriesBack.classList.add('hidden');
    }

    showQpTexturesView() {
        if (this.qpViewsContainer) this.qpViewsContainer.classList.add('show-textures');
        if (this.qpCategoriesBack) this.qpCategoriesBack.classList.remove('hidden');
    }

    async loadQpCategories(mat) {
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'color:rgba(255,255,255,0.4);padding:20px;text-align:center;grid-column:1/-1;font-size:0.9em;';
        loadingDiv.textContent = 'Loading…';
        if (this.qpCategoryGrid) {
            this.qpCategoryGrid.innerHTML = '';
            this.qpCategoryGrid.appendChild(loadingDiv);
        }
        try {
            const resp = await fetch('/api/textures');
            const data = await resp.json();
            if (!data.success) throw new Error();
            if (this.qpCategoryGrid) this.qpCategoryGrid.innerHTML = '';

            const colorBtn = document.createElement('button');
            colorBtn.className = 'qp-category-btn';
            colorBtn.dataset.search = 'solid colors';
            colorBtn.textContent = 'Solid Colors';
            colorBtn.addEventListener('click', () => this.loadQpSolidColors(mat));
            if (this.qpCategoryGrid) this.qpCategoryGrid.appendChild(colorBtn);

            data.categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'qp-category-btn';
                btn.dataset.search = (cat || '').toLowerCase();
                if (mat && mat.bestCategory && cat === mat.bestCategory) {
                    btn.classList.add('current-cat');
                }
                btn.textContent = cat;
                btn.addEventListener('click', () => this.loadQpCategoryTextures(cat, mat));
                if (this.qpCategoryGrid) this.qpCategoryGrid.appendChild(btn);
            });
        } catch {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'color:#f87171;padding:20px;text-align:center;grid-column:1/-1;';
            errorDiv.textContent = 'Failed to load categories';
            if (this.qpCategoryGrid) {
                this.qpCategoryGrid.innerHTML = '';
                this.qpCategoryGrid.appendChild(errorDiv);
            }
        }
    }

    loadQpSolidColors(mat) {
        this.qpTitle.textContent = 'Solid Colors';
        this.showQpTexturesView();
        if (this.qpTextureStrip) this.qpTextureStrip.innerHTML = '';

        this.COLOR_PRESETS.forEach(preset => {
            const btn = document.createElement('button');
            btn.className = 'qp-tex-item';
            btn.dataset.search = (preset.name || '').toLowerCase();
            btn.innerHTML = `<div class="color-swatch" style="background-color:${this.escapeHtml(preset.hex)};width:60px;height:60px;border-radius:8px;"></div><span>${this.escapeHtml(preset.name)}</span>`;
            btn.addEventListener('click', () => {
                if (this.qpMatGroupIndex >= 0) {
                    this.onApplyColor(this.qpMatGroupIndex, preset.hex, this.qpTappedMesh, this.qpReplaceAll);

                    if (this.qpTextureStrip) {
                        this.qpTextureStrip.querySelectorAll('.qp-tex-item').forEach(b => b.classList.remove('active'));
                    }
                    btn.classList.add('active');
                    this.qpLastTextureUrl = null;
                    this.qpLastTextureName = hex;
                    this.qpLastColorHex = hex;
                    this.qpLastTextureUrl = null;
                    this.qpLastTextureName = preset.name;
                    this.qpLastColorHex = preset.hex;
                }
            });
            if (this.qpTextureStrip) this.qpTextureStrip.appendChild(btn);
        });

        const recent = this.getRecentColors();
        recent.forEach(hex => {
            const btn = document.createElement('button');
            btn.className = 'qp-tex-item';
            btn.dataset.search = (hex || '').toLowerCase();
            btn.innerHTML = `<div class="color-swatch" style="background-color:${this.escapeHtml(hex)};width:60px;height:60px;border-radius:8px;"></div><span>${this.escapeHtml(hex)}</span>`;
            btn.addEventListener('click', () => {
                if (this.qpMatGroupIndex >= 0) {
                    this.onApplyColor(this.qpMatGroupIndex, hex, this.qpTappedMesh, this.qpReplaceAll);
                    if (this.qpTextureStrip) {
                        this.qpTextureStrip.querySelectorAll('.qp-tex-item').forEach(b => b.classList.remove('active'));
                    }
                    btn.classList.add('active');
                }
            });
            if (this.qpTextureStrip) this.qpTextureStrip.appendChild(btn);
        });
    }

    async loadQpCategoryTextures(category, mat) {
        this.qpTitle.textContent = category;
        this.showQpTexturesView();
        const loadingDiv = document.createElement('div');
        loadingDiv.style.cssText = 'color:rgba(255,255,255,0.4);padding:20px;display:flex;align-items:center;';
        loadingDiv.textContent = 'Loading…';
        if (this.qpTextureStrip) {
            this.qpTextureStrip.innerHTML = '';
            this.qpTextureStrip.appendChild(loadingDiv);
        }
        try {
            const resp = await fetch(`/api/textures/${encodeURIComponent(category)}`);
            const data = await resp.json();
            if (!data.success) throw new Error();
            this.qpCurrentTextures = data.textures;
            if (mat && mat.similarTextures && mat.similarTextures.length > 0) {
                const existingUrls = new Set(this.qpCurrentTextures.map(ct => ct.url));
                const unique = mat.similarTextures.filter(t => !existingUrls.has(t.url));
                this.qpCurrentTextures = [...unique, ...this.qpCurrentTextures];
            }
            this.renderQpStrip(mat);
        } catch {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'color:#f87171;padding:20px;';
            errorDiv.textContent = 'Failed to load textures';
            if (this.qpTextureStrip) {
                this.qpTextureStrip.innerHTML = '';
                this.qpTextureStrip.appendChild(errorDiv);
            }
        }
    }

    renderQpStrip(mat) {
        if (!this.qpTextureStrip) return;
        this.qpTextureStrip.innerHTML = '';
        const currentName = mat ? (mat.matchedName || null) : null;
        let activeEl = null;

        this.qpCurrentTextures.forEach(tex => {
            const btn = document.createElement('button');
            btn.className = 'qp-tex-item';
            btn.dataset.search = (tex.name || '').toLowerCase();
            if (tex.name === currentName) { btn.classList.add('active'); activeEl = btn; }
            btn.innerHTML = `<img src="${this.escapeHtml(tex.url)}" alt="${this.escapeHtml(tex.name)}" loading="lazy"><span>${this.escapeHtml(tex.name)}</span>`;
            btn.addEventListener('click', () => {
                this.onApplyTexture(this.qpMatGroupIndex, tex.url, tex.urlMedium, tex.urlLow, tex.name, this.qpTappedMesh, this.qpReplaceAll, tex.width, tex.height);

                this.qpTextureStrip.querySelectorAll('.qp-tex-item').forEach(b => {
                    b.classList.toggle('active', b.querySelector('span')?.textContent === tex.name);
                });

                this.qpLastTextureUrl = tex.url;
                this.qpLastTextureName = tex.name;
                this.qpLastColorHex = null;
            });
            this.qpTextureStrip.appendChild(btn);
        });

        if (activeEl) {
            requestAnimationFrame(() => {
                const stripW = this.qpTextureStrip.offsetWidth;
                this.qpTextureStrip.scrollLeft = activeEl.offsetLeft - (stripW / 2) + (activeEl.offsetWidth / 2);
            });
        }
    }

    // Helper for paint mode called by viewer.js
    handlePaintTap(mesh) {
        if (!this.qpPaintMode) return false;
        if (!this.qpLastTextureUrl && !this.qpLastColorHex) return false;

        const idx = this.detectedMaterials.findIndex(g => g.meshes.includes(mesh));
        if (idx < 0 || !this.detectedMaterials[idx].hasTexture) return false;

        this.onClearHighlight();
        this.qpTappedMesh = mesh;
        this.onHighlightMesh(mesh);

        // For paint tap, we just do a partial apply
        if (this.qpLastColorHex) {
            this.onApplyColor(idx, this.qpLastColorHex, mesh, false);
        } else {
            // Retrieve width/height from the current Qp textures
            const texData = this.qpCurrentTextures.find(t => t.url === this.qpLastTextureUrl);
            const tWidth = texData ? texData.width : null;
            const tHeight = texData ? texData.height : null;
            this.onApplyTexture(idx, this.qpLastTextureUrl, null, null, this.qpLastTextureName, mesh, false, tWidth, tHeight);
        }
        return true;
    }

    getRecentColors() {
        try {
            return JSON.parse(localStorage.getItem('kkc_recent_colors') || '[]').slice(0, 10);
        } catch { return []; }
    }

    addRecentColor(hex) {
        let recent = this.getRecentColors().filter(c => c !== hex);
        recent.unshift(hex);
        if (recent.length > 10) recent = recent.slice(0, 10);
        localStorage.setItem('kkc_recent_colors', JSON.stringify(recent));
    }
}
