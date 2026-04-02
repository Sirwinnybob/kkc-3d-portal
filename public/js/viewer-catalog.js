import { state, updateStatus, TILE_SIZE, escapeHtml, jobCode, roomName } from './viewer-state.js';
import { updateMaterialMap, updateMaterialColor, applySolidColor, matchTexture } from './viewer-materials.js';

export async function setupTexturePanel() {
    try {
        const response = await fetch('/api/textures');
        if (response.ok) {
            state.catalogData = await response.json();

            // Collect all textures for searching
            state.allTextures = [];
            for (const category of state.catalogData) {
                if (category.files) {
                    category.files.forEach(file => {
                        state.allTextures.push({
                            ...file,
                            category: category.name
                        });
                    });
                }
            }

            renderMaterialList();

            const searchInput = document.getElementById('texture-search');
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase();
                    if (query.length > 0) {
                        const results = state.allTextures.filter(t =>
                            t.name.toLowerCase().includes(query) ||
                            t.category.toLowerCase().includes(query)
                        );
                        renderSearchResults(results);
                    } else {
                        if (state.currentCategory) {
                            loadCategoryTextures(state.currentCategory);
                        } else {
                            showAllCategories();
                        }
                    }
                });
            }

            const clearSearchBtn = document.getElementById('clear-search');
            if (clearSearchBtn) {
                clearSearchBtn.addEventListener('click', () => clearSearch(true));
            }

            const backBtn = document.getElementById('back-to-categories');
            if (backBtn) {
                backBtn.addEventListener('click', showAllCategories);
            }

        }
    } catch (e) {
        console.error("Failed to load catalog data", e);
    }
}

export function renderMaterialList() {
    const list = document.getElementById('material-list');
    if (!list) return;
    list.innerHTML = '';

    state.detectedMaterials.forEach((mat, index) => {
        const item = createMaterialItem(mat, index);
        list.appendChild(item);

        // Auto-match texture on load
        if (mat.hasTexture && !mat.matchedName) {
            matchTexture(mat, jobCode, roomName).then(match => {
                if (match) {
                    mat.matchedName = match.name;
                    mat.bestCategory = match.category;
                    const el = document.getElementById(`mat-name-${index}`);
                    if (el) el.textContent = match.name;
                }
            });
        }
    });
}

function createMaterialItem(mat, index) {
    const div = document.createElement('div');
    div.className = `p-3 rounded-lg border cursor-pointer transition-colors ${state.selectedMaterialIndex === index ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`;
    div.onclick = () => selectMaterial(index);

    const isColor = mat.isColor || (!mat.hasTexture && mat.originalColor);
    const colorHex = mat.colorHex || (mat.originalColor ? '#' + mat.originalColor.getHexString() : '#cccccc');

    let previewHtml = '';
    if (isColor) {
        previewHtml = `<div class="w-10 h-10 rounded shadow-sm border border-gray-300" style="background-color: ${colorHex};"></div>`;
    } else {
        previewHtml = `<div class="w-10 h-10 rounded shadow-sm border border-gray-300 bg-gray-200 flex items-center justify-center text-xs text-gray-500">Tex</div>`;
    }

    const displayName = mat.matchedName || mat.name;

    div.innerHTML = `
        <div class="flex items-center gap-3">
            ${previewHtml}
            <div class="flex-1 min-w-0">
                <p class="font-medium text-gray-900 truncate" id="mat-name-${index}">${escapeHtml(displayName)}</p>
                <p class="text-xs text-gray-500 truncate">${escapeHtml(mat.category)}</p>
            </div>
            <button class="text-gray-400 hover:text-blue-600" aria-label="Find Match" onclick="event.stopPropagation(); matchAndShowCatalog(${index})">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </button>
        </div>
    `;
    return div;
}

window.matchAndShowCatalog = async function(index) {
    selectMaterial(index);
    const mat = state.detectedMaterials[index];
    updateStatus('Finding match...');
    const match = await matchTexture(mat, jobCode, roomName);
    if (match) {
        mat.matchedName = match.name;
        mat.bestCategory = match.category;
        renderMaterialList();
        updateStatus('Match found!');
        loadCategoryTextures(match.category);
    } else {
        updateStatus('No exact match found', true);
        showAllCategories();
    }
};

export function selectMaterial(index) {
    state.selectedMaterialIndex = index;
    renderMaterialList();
    if (index >= 0) {
        const mat = state.detectedMaterials[index];
        if (mat.bestCategory) {
            loadCategoryTextures(mat.bestCategory);
        } else {
            showAllCategories();
        }
    }
}

export function showAllCategories() {
    state.currentCategory = null;
    document.getElementById('category-view')?.classList.remove('hidden');
    document.getElementById('texture-view')?.classList.add('hidden');
    document.getElementById('solid-color-view')?.classList.add('hidden');

    const grid = document.getElementById('category-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (state.catalogData) {
        state.catalogData.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'p-4 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-center';
            btn.innerHTML = `<span class="block font-semibold text-gray-800">${escapeHtml(cat.name)}</span><span class="block text-xs text-gray-500 mt-1">${cat.files ? cat.files.length : 0} items</span>`;
            btn.onclick = () => loadCategoryTextures(cat.name);
            grid.appendChild(btn);
        });
    }

    const colorBtn = document.createElement('button');
    colorBtn.className = 'p-4 bg-gradient-to-br from-gray-50 to-gray-200 border border-gray-300 rounded-lg shadow-sm hover:shadow-md hover:border-blue-400 transition-all text-center';
    colorBtn.innerHTML = `<span class="block font-semibold text-gray-800">Solid Colors</span><span class="block text-xs text-gray-500 mt-1">Paints & Stains</span>`;
    colorBtn.onclick = () => showSolidColorsView();
    grid.appendChild(colorBtn);
}

export function showSolidColorsView() {
    state.currentCategory = "Solid Colors";
    document.getElementById('category-view')?.classList.add('hidden');
    document.getElementById('texture-view')?.classList.add('hidden');
    document.getElementById('solid-color-view')?.classList.remove('hidden');
    document.getElementById('current-category-name').textContent = 'Solid Colors';

    const recentGrid = document.getElementById('recent-colors-grid');
    const presetGrid = document.getElementById('preset-colors-grid');
    const picker = document.getElementById('custom-color-picker');

    if (recentGrid) {
        recentGrid.innerHTML = '';
        getRecentColors().forEach(hex => {
            const btn = document.createElement('button');
            btn.className = 'w-10 h-10 rounded shadow-sm border border-gray-300 cursor-pointer hover:scale-110 transition-transform';
            btn.style.backgroundColor = hex;
            btn.title = hex;
            btn.onclick = () => applyColorToSelected(hex);
            recentGrid.appendChild(btn);
        });
    }

    if (presetGrid) {
        presetGrid.innerHTML = '';
        import('./viewer-state.js').then(module => {
            module.COLOR_PRESETS.forEach(preset => {
                const btn = document.createElement('button');
                btn.className = 'w-10 h-10 rounded shadow-sm border border-gray-300 cursor-pointer hover:scale-110 transition-transform';
                btn.style.backgroundColor = preset.hex;
                btn.title = preset.name;
                btn.onclick = () => applyColorToSelected(preset.hex);
                presetGrid.appendChild(btn);
            });
        });
    }

    if (picker) {
        picker.onchange = (e) => applyColorToSelected(e.target.value);
    }
}

function applyColorToSelected(hex) {
    if (state.selectedMaterialIndex >= 0) {
        const mat = state.detectedMaterials[state.selectedMaterialIndex];
        applySolidColor(mat, hex);
        renderMaterialList();
        showSolidColorsView();
    } else {
        updateStatus("Select a material first", true);
    }
}

export async function loadCategoryTextures(category) {
    state.currentCategory = category;
    document.getElementById('category-view')?.classList.add('hidden');
    document.getElementById('solid-color-view')?.classList.add('hidden');
    document.getElementById('texture-view')?.classList.remove('hidden');
    document.getElementById('current-category-name').textContent = category;

    const catData = state.catalogData.find(c => c.name === category);
    renderTextureGrid(catData ? catData.files : []);
}

function renderTextureGrid(files) {
    const grid = document.getElementById('texture-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!files || files.length === 0) {
        grid.innerHTML = '<p class="col-span-full text-center text-gray-500 py-8">No textures found</p>';
        return;
    }

    files.forEach(file => {
        const btn = document.createElement('button');
        btn.className = 'texture-item border rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500';

        let urlLow = `/api/textures/${file.category || state.currentCategory}/${file.name}?size=low`;
        let urlMed = `/api/textures/${file.category || state.currentCategory}/${file.name}?size=medium`;
        let urlHigh = `/api/textures/${file.category || state.currentCategory}/${file.name}?size=high`;

        btn.innerHTML = `
            <div class="aspect-square bg-gray-200">
                <img src="${urlLow}" loading="lazy" class="w-full h-full object-cover" alt="${escapeHtml(file.name)}">
            </div>
            <div class="p-2 text-xs truncate bg-white" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        `;

        btn.onclick = () => {
            if (state.selectedMaterialIndex >= 0) {
                const mat = state.detectedMaterials[state.selectedMaterialIndex];
                mat.matchedName = file.name;
                mat.bestCategory = file.category || state.currentCategory;
                mat.isColor = false;
                mat.urlLow = urlLow;
                mat.urlMedium = urlMed;
                mat.urlHigh = urlHigh;

                updateMaterialMap(urlHigh, mat.meshes, () => renderMaterialList());
            } else {
                updateStatus("Select a material first", true);
            }
        };
        grid.appendChild(btn);
    });
}

function renderSearchResults(results) {
    document.getElementById('category-view')?.classList.add('hidden');
    document.getElementById('solid-color-view')?.classList.add('hidden');
    document.getElementById('texture-view')?.classList.remove('hidden');
    document.getElementById('current-category-name').textContent = 'Search Results';
    renderTextureGrid(results);
}

export function clearSearch(shouldFocus = false) {
    const searchInput = document.getElementById('texture-search');
    if (searchInput) {
        searchInput.value = '';
        if (shouldFocus) searchInput.focus();
    }
    if (state.currentCategory) {
        loadCategoryTextures(state.currentCategory);
    } else {
        showAllCategories();
    }
}
