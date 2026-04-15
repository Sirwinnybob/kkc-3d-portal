/**
 * Geometry utility functions for Collada ph/h triangulation and basic 2D operations.
 */

/**
 * Parses index tuples from a whitespace-delimited string, grouped by stride.
 * @param {string} text
 * @param {number} stride
 * @returns {number[][]}
 */
function parseIndices(text, stride) {
    const len = text.length;
    let i = 0;

    // Skip leading whitespace
    while (i < len && text.charCodeAt(i) <= 32) i++;

    // Empty string or whitespace only edge case
    if (i === len) return [[0]];

    const tuples = [];
    let currentTuple = new Array(stride);
    let tupleIndex = 0;

    while (i < len) {
        const start = i;
        // Find end of current number string
        while (i < len && text.charCodeAt(i) > 32) i++;

        // Parse and add to current tuple
        currentTuple[tupleIndex++] = Number(text.substring(start, i));

        // When tuple is full, push to result and start new tuple
        if (tupleIndex === stride) {
            tuples.push(currentTuple);
            currentTuple = new Array(stride);
            tupleIndex = 0;
        }

        // Skip whitespace
        while (i < len && text.charCodeAt(i) <= 32) i++;
    }

    // Handle any remaining numbers that didn't fill a complete tuple
    if (tupleIndex > 0) {
        currentTuple.length = tupleIndex;
        tuples.push(currentTuple);
    }

    return tuples;
}

/**
 * Ear-clipping triangulation of a simple polygon.
 * Supports flat coordinate arrays [x,y,x,y...] or nested arrays [[x,y],...].
 * Returns an array of triangles [[a,b,c], ...].
 * @param {any[]} ring
 * @returns {any[][]}
 */
function earClip(ring) {
    if (!ring || ring.length === 0) return [];

    let pts = [];
    let items = [];

    // Handle flat array [x,y,x,y...]
    if (typeof ring[0] === 'number' && ring.length >= 6) {
        for (let i = 0; i < ring.length; i += 2) {
            pts.push([ring[i], ring[i + 1]]);
        }
        items = pts;
    } else {
        // Handle nested arrays or objects
        pts = ring.map(p => {
            if (Array.isArray(p)) return [p[0], p[1]];
            if (p && typeof p.x === 'number') return [p.x, p.y];
            return [0, 0];
        });
        items = ring;
    }

    const n = pts.length;
    if (n < 3) return [];
    if (n === 3) return [[items[0], items[1], items[2]]];

    let active = Array.from({ length: n }, (_, i) => i);

    // Ensure counter-clockwise winding (Shoelace formula: area < 0 is CCW)
    let area = 0;
    for (let i = 0; i < n; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % n];
        area += (p2[0] - p1[0]) * (p2[1] + p1[1]);
    }
    if (area > 0) active.reverse();

    const triangles = [];
    let guard = active.length * active.length; // O(n²) worst case
    let i = 0;
    while (active.length > 3 && guard-- > 0) {
        const len = active.length;
        const pi = (i - 1 + len) % len;
        const ci = i % len;
        const ni = (i + 1) % len;
        const prev = active[pi], curr = active[ci], next = active[ni];
        if (isEar(pts, active, prev, curr, next)) {
            triangles.push([items[prev], items[curr], items[next]]);
            active.splice(ci, 1);
            i = ci % active.length;
        } else {
            i = (i + 1) % active.length;
        }
    }
    if (active.length === 3) triangles.push([items[active[0]], items[active[1]], items[active[2]]]);
    return triangles;
}

/**
 * Calculates the 2D cross product of vectors (ob-oa) and (oc-oa).
 * @param {number[]} oa
 * @param {number[]} ob
 * @param {number[]} oc
 * @returns {number}
 */
function cross2d(oa, ob, oc) {
    return (ob[0] - oa[0]) * (oc[1] - oa[1]) - (ob[1] - oa[1]) * (oc[0] - oa[0]);
}

/**
 * Checks if point p is inside the triangle formed by a, b, and c.
 * @param {number[]} p
 * @param {number[]} a
 * @param {number[]} b
 * @param {number[]} c
 * @returns {boolean}
 */
function pointInTriangle(p, a, b, c) {
    const d1 = cross2d(p, a, b), d2 = cross2d(p, b, c), d3 = cross2d(p, c, a);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
}

/**
 * pts: array of [x,y] coordinates indexed by ring position.
 * @param {number[][]} pts
 * @param {number[]} active
 * @param {number} prev
 * @param {number} curr
 * @param {number} next
 * @returns {boolean}
 */
function isEar(pts, active, prev, curr, next) {
    const a = pts[prev], b = pts[curr], c = pts[next];
    if (cross2d(a, b, c) < 0) return false; // reflex vertex
    for (const idx of active) {
        if (idx === prev || idx === curr || idx === next) continue;
        if (pointInTriangle(pts[idx], a, b, c)) return false;
    }
    return true;
}

/**
 * Bridge a hole ring into the outer ring at their closest index positions,
 * returning a new merged ring (simple polygon).
 * @param {number[][]} outer
 * @param {number[][]} hole
 * @returns {number[][]}
 */
function bridgeHole(outer, hole) {
    // Find rightmost point of hole (max first-index value) and nearest outer vertex.
    let hBest = 0;
    for (let i = 1; i < hole.length; i++) {
        if (hole[i][0] > hole[hBest][0]) hBest = i;
    }
    let oBest = 0;
    for (let i = 1; i < outer.length; i++) {
        if (outer[i][0] > outer[oBest][0]) oBest = i;
    }
    // Stitch: outer[0..oBest] + hole[hBest..end] + hole[0..hBest] + outer[oBest..end]
    const merged = [
        ...outer.slice(0, oBest + 1),
        ...hole.slice(hBest),
        ...hole.slice(0, hBest + 1),
        ...outer.slice(oBest),
    ];
    return merged;
}

module.exports = {
    parseIndices,
    earClip,
    cross2d,
    pointInTriangle,
    isEar,
    bridgeHole
};
