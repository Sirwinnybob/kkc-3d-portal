// Shared State and Constants
export let state = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    composer: null,
    fxaaPass: null,
    kkcShader: null,

    zoomVelocity: 0,
    detectedMaterials: [],
    selectedMaterialIndex: -1,
    loadedModel: null,

    // Highlights
    highlightedMesh: null,
    highlightOriginalEmissive: null,

    // Showroom
    isShowroomMode: false,
    showroomPin: null,
    showroomCategories: {},
    showroomParts: {},
    kitchenMaterials: [],
    islandMaterials: [],
    kitchenStyle: 'face_frame',
    overlayStyle: 'full',
    islandOverlayStyle: 'full',
    islandStyle: 'face_frame',

    // Catalog State
    catalogData: null,
    currentCategory: null,
    allTextures: [],

    MILKY_GRAY: 0xC8C8C8
};

// Expose scene for debugging
Object.defineProperty(window, 'scene', {
    get: () => state.scene,
    set: (v) => { state.scene = v; }
});

export const SETTINGS = {
    ambientIntensity: 2.0,
    directionalIntensity: 1.5,
    cameraFov: 50,
    cameraNear: 0.1,
    cameraFar: 100,
    shadowMapSize: 2048,
    shadowBias: -0.0001,
    defaultPin: '79213',
    maxZoom: 15,
    minZoom: 1
};

export const COLOR_PRESETS = [
    { name: 'White', hex: '#FFFFFF' },
    { name: 'Cream', hex: '#F5F0E1' },
    { name: 'Navy', hex: '#1B2A4A' },
    { name: 'Sage Green', hex: '#9CAF88' },
    { name: 'Charcoal', hex: '#36454F' },
    { name: 'Black', hex: '#1C1C1C' },
    { name: 'Dove Gray', hex: '#B0B0B0' },
    { name: 'Warm Taupe', hex: '#B39B86' }
];

export function getRecentColors() {
    try {
        return JSON.parse(localStorage.getItem('kkc_recent_colors') || '[]').slice(0, 10);
    } catch { return []; }
}

export function addRecentColor(hex) {
    let recent = getRecentColors().filter(c => c !== hex);
    recent.unshift(hex);
    if (recent.length > 10) recent = recent.slice(0, 10);
    localStorage.setItem('kkc_recent_colors', JSON.stringify(recent));
}

export const textureCache = new Map();
export const _lodVec = new (await import('three')).Vector3();
export let lastLodCheckTime = 0;

export function setLastLodCheckTime(t) {
    lastLodCheckTime = t;
}

export const manager = new (await import('three')).LoadingManager();

export const urlParams = new URLSearchParams(window.location.search);
export const loadPin = urlParams.get('pin');
export const jobCode = urlParams.get('job');
export const initialRoom = urlParams.get('room');
export const customUrl = urlParams.get('url');

// Global DOM references used broadly
export const statusEl = document.getElementById('status');
export const statusText = document.getElementById('status-text');

export function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export const updateStatus = (msg, isError = false) => {
    if (!statusEl || !statusText) return;
    statusText.textContent = msg;
    statusEl.classList.remove('hidden', 'bg-red-500', 'bg-black/50');
    statusEl.classList.add(isError ? 'bg-red-500' : 'bg-black/50');
    if (!isError && msg) {
        setTimeout(() => {
            if (statusText.textContent === msg) {
                statusEl.classList.add('hidden');
            }
        }, 3000);
    }
};

// Global exports for testing
export const quickPicker = { open: null, close: null, paintTap: null };
