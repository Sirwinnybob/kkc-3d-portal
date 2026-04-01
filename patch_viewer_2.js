const fs = require('fs');

let code = fs.readFileSync('public/js/viewer.js', 'utf8');

// 1. Remove obj.rotation.x = -Math.PI / 2;
// 2. Set MTLLoader path

// The MTL loader section:
const oldMtl = `        if (isObj) {
            const mtlUrl = urlData.url.substring(0, urlData.url.lastIndexOf('.')) + '.mtl';
            const mtlLoader = new MTLLoader();

            mtlLoader.load(mtlUrl, function(materials) {`;

const newMtl = `        if (isObj) {
            const mtlUrl = urlData.url.substring(0, urlData.url.lastIndexOf('.')) + '.mtl';
            const basePath = urlData.url.substring(0, urlData.url.lastIndexOf('/') + 1);
            const mtlLoader = new MTLLoader();
            mtlLoader.setPath(basePath);

            mtlLoader.load(mtlUrl, function(materials) {`;

code = code.replace(oldMtl, newMtl);

// The rotation section:
const oldRot1 = `                objLoader.load(urlData.url, function(obj) {
                    // Apply SketchUp rotation fix
                    obj.rotation.x = -Math.PI / 2;
                    obj.updateMatrixWorld(true);`;

const newRot1 = `                const fileLoader = new THREE.FileLoader();
                fileLoader.load(urlData.url, function(text) {
                    const lines = text.substring(0, 1024).split('\\n');
                    let scale = 1.0;
                    for (const line of lines) {
                        if (line.startsWith('# File units = ')) {
                            const unit = line.split('=')[1].trim().toLowerCase();
                            if (unit === 'inches') scale = 0.0254;
                            else if (unit === 'millimeters' || unit === 'millimeter' || unit === 'mm') scale = 0.001;
                            else if (unit === 'centimeters' || unit === 'centimeter' || unit === 'cm') scale = 0.01;
                            else if (unit === 'meters' || unit === 'meter' || unit === 'm') scale = 1.0;
                            else if (unit === 'feet' || unit === 'foot' || unit === 'ft') scale = 0.3048;
                            break;
                        }
                    }

                    const obj = objLoader.parse(text);
                    // Do not rotate, assuming Y is up
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);`;

code = code.replace(oldRot1, newRot1);

// The fallback rotation section:
const oldRot2 = `                    const obj = objLoader.parse(text);
                    obj.rotation.x = -Math.PI / 2;
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);`;

const newRot2 = `                    const obj = objLoader.parse(text);
                    obj.scale.set(scale, scale, scale);
                    obj.updateMatrixWorld(true);`;

code = code.replace(oldRot2, newRot2);

// The material processing section:
const oldMat = `                            // Map material the same way we do for GLTF
                            const prevMat = Array.isArray(child.material) ? child.material[0] : child.material;
                            child.material = new THREE.MeshLambertMaterial({
                                map: prevMat.map,
                                color: prevMat.map ? 0xffffff : (prevMat.color || 0xcccccc),
                                transparent: prevMat.transparent || false,
                                opacity: prevMat.opacity !== undefined ? prevMat.opacity : 1.0,
                                side: THREE.DoubleSide,
                                polygonOffset: true,
                                polygonOffsetFactor: 1,
                                polygonOffsetUnits: 1
                            });`;

const newMat = `                            // Keep the material created by MTLLoader, but adjust properties
                            const mat = Array.isArray(child.material) ? child.material[0] : child.material;
                            mat.side = THREE.DoubleSide;
                            mat.polygonOffset = true;
                            mat.polygonOffsetFactor = 1;
                            mat.polygonOffsetUnits = 1;

                            // Only set color to white if there's a map to avoid multiplying texture color
                            if (mat.map) {
                                mat.color.set(0xffffff);
                            }

                            child.material = mat;
                            const prevMat = mat; // For the rest of the code to reference`;

code = code.replace(oldMat, newMat);

fs.writeFileSync('public/js/viewer.js', code);
console.log('Patched viewer.js for OBJ loading');
