import { state, updateStatus, escapeHtml } from './viewer-state.js';
import { applySolidColor, updateMaterialMap } from './viewer-materials.js';

const qpEl = document.getElementById('quick-picker');

export async function loadQpCategories(mat) {
    const grid = document.getElementById('qp-categories-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (state.catalogData) {
        state.catalogData.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-center';
            btn.innerHTML = `<span class="block font-semibold text-gray-800 text-sm">${escapeHtml(cat.name)}</span>`;
            btn.onclick = () => {
                document.getElementById('qp-categories-view')?.classList.add('hidden');
                document.getElementById('qp-textures-view')?.classList.remove('hidden');
                loadQpCategoryTextures(cat.name, mat);
            };
            grid.appendChild(btn);
        });
    }

    const colorBtn = document.createElement('button');
    colorBtn.className = 'p-3 bg-gradient-to-br from-gray-50 to-gray-200 border border-gray-300 rounded-lg shadow-sm hover:shadow-md hover:border-blue-400 transition-all text-center';
    colorBtn.innerHTML = `<span class="block font-semibold text-gray-800 text-sm">Solid Colors</span>`;
    colorBtn.onclick = () => {
        document.getElementById('qp-categories-view')?.classList.add('hidden');
        document.getElementById('qp-textures-view')?.classList.remove('hidden');
        loadQpSolidColors(mat);
    };
    grid.appendChild(colorBtn);
}

export function loadQpSolidColors(mat) {
    const strip = document.getElementById('qp-texture-strip');
    const title = document.getElementById('qp-cat-title');
    if (!strip || !title) return;
    title.textContent = 'Solid Colors';
    strip.innerHTML = '';

    const colors = [
        ...import('./viewer-state.js').then(m => m.getRecentColors()),
        ...import('./viewer-state.js').then(m => m.COLOR_PRESETS.map(p => p.hex))
    ];

    const uniqueColors = [...new Set(colors)];

    uniqueColors.forEach(hex => {
        const btn = document.createElement('button');
        btn.className = 'flex-none w-16 h-16 rounded shadow-sm border border-gray-300 cursor-pointer hover:scale-105 transition-transform flex items-center justify-center';
        btn.style.backgroundColor = hex;
        btn.onclick = () => {
            applySolidColor(mat, hex);
            import('./viewer-catalog.js').then(m => m.renderMaterialList());
            import('./viewer-ui.js').then(m => m.quickPicker.close());
        };
        strip.appendChild(btn);
    });
}

export async function loadQpCategoryTextures(category, mat) {
    const strip = document.getElementById('qp-texture-strip');
    const title = document.getElementById('qp-cat-title');
    if (!strip || !title) return;
    title.textContent = category;
    strip.innerHTML = '<div class="text-sm text-gray-500 py-4">Loading...</div>';

    const catData = state.catalogData?.find(c => c.name === category);
    if (!catData || !catData.files) {
        strip.innerHTML = '<div class="text-sm text-gray-500 py-4">No textures found</div>';
        return;
    }

    strip.innerHTML = '';
    catData.files.forEach(file => {
        const btn = document.createElement('button');
        btn.className = 'flex-none w-20 h-24 border rounded overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm hover:shadow-md transition-shadow';

        let urlLow = `/api/textures/${category}/${file.name}?size=low`;
        let urlMed = `/api/textures/${category}/${file.name}?size=medium`;
        let urlHigh = `/api/textures/${category}/${file.name}?size=high`;

        btn.innerHTML = `
            <div class="h-16 bg-gray-200 w-full">
                <img src="${urlLow}" loading="lazy" class="w-full h-full object-cover" alt="${escapeHtml(file.name)}">
            </div>
            <div class="p-1 text-[10px] leading-tight truncate text-center" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</div>
        `;

        btn.onclick = () => {
            mat.matchedName = file.name;
            mat.bestCategory = category;
            mat.isColor = false;
            mat.urlLow = urlLow;
            mat.urlMedium = urlMed;
            mat.urlHigh = urlHigh;
            updateMaterialMap(urlHigh, mat.meshes, () => {
                import('./viewer-catalog.js').then(m => m.renderMaterialList());
                import('./viewer-ui.js').then(m => m.quickPicker.close());
            });
        };
        strip.appendChild(btn);
    });
}
