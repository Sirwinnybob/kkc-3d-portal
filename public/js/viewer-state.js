// Shared State and Utilities
export let state = {
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    composer: null,
    zoomVelocity: 0,
    detectedMaterials: [],
    selectedMaterialIndex: -1,
    loadedModel: null,
    highlightedMesh: null,
    highlightOriginalEmissive: null,

    isShowroomMode: false,
    showroomPin: null,
    showroomCategories: {},
    showroomParts: {}, // { category: { group, style, file, tagData } }

    kitchenMaterials: [],
    islandMaterials: [],
    kitchenStyle: 'face_frame',
    overlayStyle: 'full',
    islandOverlayStyle: 'full',
    islandStyle: 'face_frame',

    MILKY_GRAY: 0xC8C8C8,
};

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

export function escapeHtml(unsafe) {
    if (!unsafe || typeof unsafe !== 'string') return unsafe;
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export const statusEl = document.getElementById('status');
export const statusText = document.getElementById('status-text');

export const updateStatus = (msg, isError = false) => {
    if (!statusEl || !statusText) return;
    statusText.textContent = msg;
    statusEl.classList.remove('hidden', 'bg-red-500', 'bg-black/50');
    statusEl.classList.add(isError ? 'bg-red-500' : 'bg-black/50');
    if (!isError) {
        setTimeout(() => {
            statusEl.classList.add('hidden');
        }, 3000);
    }
};

export const urlParams = new URLSearchParams(window.location.search);
export const loadPin = urlParams.get('pin');
export const jobCode = urlParams.get('job');
export const roomName = urlParams.get('room');
export const customUrl = urlParams.get('url');
export const stagingFile = urlParams.get('staging');
export const TILE_SIZE = 1200;

// We handle loading manager carefully
import { LoadingManager } from 'three';
export const manager = new LoadingManager();
export const textureCache = new Map();
