import * as THREE from 'three';

export class MeshEdges {
    constructor(scene) {
        this.scene = scene;
        this.enabled = true;
        this.lines = new Map();
        this.material = new THREE.LineBasicMaterial({
            color: 0x333333,
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
            if (obj.isMesh && obj.geometry?.attributes.position && !this.lines.has(obj)) meshes.push(obj);
        });
        meshes.forEach(mesh => {
            // Ignore coplanar triangle seams and small changes along curved surfaces.
            const geometry = new THREE.EdgesGeometry(mesh.geometry, 30);
            const line = new THREE.LineSegments(geometry, this.material);
            line.name = 'mesh-edges';
            // Surface taps and double-tap pivoting must still hit the mesh.
            line.raycast = () => {};
            mesh.add(line);
            this.lines.set(mesh, line);
        });
    }

    remove(root) {
        const meshes = [];
        root.traverse(obj => { if (obj.isMesh) meshes.push(obj); });
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
