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
        this.initDOM();
        this.bindEvents();
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

    isColorsCategory(category) {
        return typeof category === 'string' && category.toLowerCase() === 'colors';
    }

    getCategoryDisplayName(category) {
        return this.isColorsCategory(category) ? 'Solid Colors' : category;
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
            let renderScheduled = false;
            await Promise.all(texturedMaterials.map(async (mat) => {
                try {
                    await this.matchTexture(mat);
                } catch (e) {
                    console.error("Match error:", e);
                }
                // Re-render asynchronously to avoid blocking the parallel execution
                // Debounced via requestAnimationFrame flag to ensure only one update per frame
                if (!renderScheduled) {
                    renderScheduled = true;
                    requestAnimationFrame(() => {
                        renderScheduled = false;
                        if (this.texturePanel.classList.contains('show')) this.renderMaterialList();
                    });
                }
            }));
        }

        this.isMatchingAll = false;
        this.onStatusUpdate('');
        if (this.texturePanel.classList.contains('show')) this.renderMaterialList();
    }

    renderMaterialList() {
        this.clearSearch(false);
        if (!this.materialList) return;
        this.materialList.innerHTML = '';

        const visibleMaterials = this.detectedMaterials.filter(mat => {
            if (mat.isHidden) return false;
            return !!mat.hasTexture;
        });
        const fragment = document.createDocumentFragment();

        if (visibleMaterials.length === 0) {
            const div = document.createElement('div');
            div.style.cssText = 'padding:20px; text-align:center; color:#888;';
            div.textContent = this.isMatchingAll ? 'Matching textures...' : 'No customizable textures found.';
            fragment.appendChild(div);
            this.materialList.appendChild(fragment);
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
                fragment.appendChild(header);
                kitchenVis.forEach(mat => fragment.appendChild(this.createMaterialItem(mat)));
            }
            if (islandVis.length > 0) {
                const header = document.createElement('div');
                header.className = 'material-section-header';
                header.textContent = 'Island';
                fragment.appendChild(header);
                islandVis.forEach(mat => fragment.appendChild(this.createMaterialItem(mat)));
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
                fragment.appendChild(this.createGroupedMaterialItem(group));
            });
        }

        this.materialList.appendChild(fragment);

        document.getElementById('materials-view').style.display = 'block';
        document.getElementById('catalog-view').style.display = 'none';
    }

    createGroupedMaterialItem(group) {
        const btn = document.createElement('button');
        btn.className = 'material-item';
        const mat = group.primaryMat;
        // Store indices to apply to all when clicked
        btn.dataset.indices = JSON.stringify(group.indices);
        btn.dataset.index = group.indices[0].toString();

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

        const displayName = group.displayName;
        const isModified = mat.matchedName !== mat.originalMatchedName || mat.hasPartialChange;

        const leftDiv = document.createElement('div');
        leftDiv.className = 'material-item-left';
        leftDiv.innerHTML = mat.previewCache;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'material-info';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'material-name';
        nameSpan.title = displayName;
        nameSpan.textContent = displayName;

        const statusSpan = document.createElement('span');
        statusSpan.className = 'material-status';
        statusSpan.textContent = isModified ? 'Modified' : 'Customizable';

        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(statusSpan);
        leftDiv.appendChild(infoDiv);

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'material-badge';
        badgeSpan.textContent = 'Has Texture';

        btn.appendChild(leftDiv);
        btn.appendChild(badgeSpan);

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

        const displayName = mat.matchedName || mat.name;
        const isModified = mat.matchedName !== mat.originalMatchedName || mat.hasPartialChange;

        const leftDiv = document.createElement('div');
        leftDiv.className = 'material-item-left';
        leftDiv.innerHTML = mat.previewCache;

        const infoDiv = document.createElement('div');
        infoDiv.className = 'material-info';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'material-name';
        nameSpan.title = displayName;
        nameSpan.textContent = displayName;

        const statusSpan = document.createElement('span');
        statusSpan.className = 'material-status';
        statusSpan.textContent = isModified ? 'Modified' : 'Customizable';

        infoDiv.appendChild(nameSpan);
        infoDiv.appendChild(statusSpan);
        leftDiv.appendChild(infoDiv);

        const badgeSpan = document.createElement('span');
        badgeSpan.className = 'material-badge';
        badgeSpan.textContent = 'Has Texture';

        btn.appendChild(leftDiv);
        btn.appendChild(badgeSpan);

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

        // Cache the match promise on the image object to prevent redundant encoding/fetching for shared textures
        if (!img._matchPromise) {
            img._matchPromise = (async () => {
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
                return await resp.json();
            })();
        }
        const data = await img._matchPromise;

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

                this.textureCategories.forEach(cat => {
                    const btn = document.createElement('button');
                    btn.className = 'texture-category-btn';
                    btn.innerText = this.getCategoryDisplayName(cat);
                    btn.onclick = () => this.loadCategoryTextures(cat);
                    this.textureGrid.appendChild(btn);
                });
            }
        } catch (e) {
            console.error("Failed to load categories:", e);
        }
    }

    async loadCategoryTextures(category) {
        this.clearSearch(false);
        try {
            const resp = await fetch(`/api/textures/${encodeURIComponent(category)}`);
            const data = await resp.json();
            if (data.success) {
                this.currentCategoryTextures = data.textures;
                this.catalogTitle.innerText = this.getCategoryDisplayName(category);
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
        const mat = this.selectedMaterialIndex >= 0 ? this.detectedMaterials[this.selectedMaterialIndex] : null;
        const currentUrl = mat ? (mat.urlHigh || mat.currentLODUrl) : null;

        const fragment = document.createDocumentFragment();

        this.currentCategoryTextures.forEach(tex => {
            const btn = document.createElement('button');
            btn.className = 'texture-thumb';
            if (currentUrl === tex.url) {
                btn.classList.add('active');
                btn.setAttribute('aria-current', 'true');
            }
            btn.dataset.search = (tex.name || '').toLowerCase();
            btn.setAttribute('aria-label', `Select texture ${tex.name}`);

            const img = document.createElement('img');
            // Performance: Prioritize low-resolution thumbnails (256px) for the grid view
            img.src = tex.urlLow || tex.url;
            img.alt = tex.name;
            img.loading = 'lazy';

            const span = document.createElement('span');
            span.textContent = tex.name;

            btn.appendChild(img);
            btn.appendChild(span);

            btn.onclick = () => {
                const indices = this.selectedGroupIndices || [this.selectedMaterialIndex];
                indices.forEach(idx => this.onApplyTexture(idx, tex.url, tex.urlMedium, tex.urlLow, tex.name, null, true, tex.width, tex.height, true));

                this.textureGrid.querySelectorAll('.texture-thumb').forEach(th => {
                    th.classList.remove('active');
                    th.removeAttribute('aria-current');
                });
                btn.classList.add('active');
                btn.setAttribute('aria-current', 'true');
            };
            fragment.appendChild(btn);
        });
        this.textureGrid.appendChild(fragment);
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

            data.categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'qp-category-btn';
                const displayName = this.getCategoryDisplayName(cat);
                btn.dataset.search = `${cat || ''} ${displayName}`.toLowerCase();
                if (mat && mat.bestCategory && cat === mat.bestCategory) {
                    btn.classList.add('current-cat');
                }
                btn.textContent = displayName;
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

    async loadQpCategoryTextures(category, mat) {
        this.qpTitle.textContent = this.getCategoryDisplayName(category);
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

        const fragment = document.createDocumentFragment();

        this.qpCurrentTextures.forEach(tex => {
            const btn = document.createElement('button');
            btn.className = 'qp-tex-item';
            btn.dataset.search = (tex.name || '').toLowerCase();
            if (tex.name === currentName) { btn.classList.add('active'); activeEl = btn; }

            const img = document.createElement('img');
            // Performance: Use low-resolution thumbnails for quick picker to reduce load times
            img.src = tex.urlLow || tex.url;
            img.alt = tex.name;
            img.loading = 'lazy';

            const span = document.createElement('span');
            span.textContent = tex.name;

            btn.appendChild(img);
            btn.appendChild(span);

            btn.addEventListener('click', () => {
                this.onApplyTexture(this.qpMatGroupIndex, tex.url, tex.urlMedium, tex.urlLow, tex.name, this.qpTappedMesh, this.qpReplaceAll, tex.width, tex.height, true);

                this.qpTextureStrip.querySelectorAll('.qp-tex-item').forEach(b => {
                    b.classList.toggle('active', b.querySelector('span')?.textContent === tex.name);
                });

                this.qpLastTextureUrl = tex.url;
                this.qpLastTextureName = tex.name;
            });
            fragment.appendChild(btn);
        });
        this.qpTextureStrip.appendChild(fragment);

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
        if (!this.qpLastTextureUrl) return false;

        const idx = this.detectedMaterials.findIndex(g => g.meshes.includes(mesh));
        if (idx < 0) return false;
        const mat = this.detectedMaterials[idx];
        if (!mat.hasTexture) return false;

        this.onClearHighlight();
        this.qpTappedMesh = mesh;
        this.onHighlightMesh(mesh);

        // Retrieve width/height from the current Qp textures
        const texData = this.qpCurrentTextures.find(t => t.url === this.qpLastTextureUrl);
        const tWidth = texData ? texData.width : null;
        const tHeight = texData ? texData.height : null;
        this.onApplyTexture(idx, this.qpLastTextureUrl, null, null, this.qpLastTextureName, mesh, false, tWidth, tHeight, true);
        return true;
    }
}
