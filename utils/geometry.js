function cross2d(oa, ob, oc) {
    return (ob[0] - oa[0]) * (oc[1] - oa[1]) - (ob[1] - oa[1]) * (oc[0] - oa[0]);
}

function pointInTriangle(p, a, b, c) {
    const d1 = cross2d(p, a, b), d2 = cross2d(p, b, c), d3 = cross2d(p, c, a);
    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(hasNeg && hasPos);
}

module.exports = {
    cross2d,
    pointInTriangle
};
