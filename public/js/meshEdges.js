import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

function updateLineResolution(renderer) {
    // Use logical pixels so thickness stays consistent on high-DPI displays and exports.
    renderer.getSize(this.material.resolution);
}

export class MeshEdges {
    constructor(scene) {
        this.scene = scene;
        this.enabled = true;
        this.lines = new Map();
        this.material = new LineMaterial({
            color: 0x333333,
            linewidth: 1.5,
            transparent: true,
            opacity: 0.45,
            depthTest: true,
            depthWrite: false
        });
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (enabled) this.add(this.scene);
        this.lines.forEach(line => { line.visible = enabled; });
    }

    add(root) {
        if (!this.enabled || !root) return;
        // Collect first: attaching helpers during traversal changes the graph.
        const meshes = [];
        root.traverse(obj => {
            if (obj.isMesh && !obj.isLineSegments2 && obj.geometry?.attributes.position && !this.lines.has(obj)) meshes.push(obj);
        });
        meshes.forEach(mesh => {
            // Ignore coplanar triangle seams and small changes along curved surfaces.
            const edges = new THREE.EdgesGeometry(mesh.geometry, 30);
            const geometry = new LineSegmentsGeometry().fromEdgesGeometry(edges);
            edges.dispose();
            const line = new LineSegments2(geometry, this.material);
            line.name = 'mesh-edges';
            line.onBeforeRender = updateLineResolution;
            // Surface taps and double-tap pivoting must still hit the mesh.
            line.raycast = () => {};
            mesh.add(line);
            this.lines.set(mesh, line);
        });
    }

    remove(root) {
        const meshes = [];
        root.traverse(obj => { if (obj.isMesh && !obj.isLineSegments2) meshes.push(obj); });
        this.removeMeshes(meshes);
    }

    removeMeshes(meshes) {
        for (const mesh of meshes) {
            const line = this.lines.get(mesh);
            if (!line) continue;
            mesh.remove(line);
            line.geometry.dispose();
            this.lines.delete(mesh);
        }
    }

    dispose() {
        this.removeMeshes(this.lines.keys());
        this.material.dispose();
    }
}
