const fs = require('fs');

let code = fs.readFileSync('public/js/viewer.js', 'utf8');

// The replacement in step 1 didn't find the exact match because the file was changed in the previous step.
// Let's replace the rotation correctly now.

code = code.replace("obj.rotation.x = -Math.PI / 2;", "// obj.rotation.x = -Math.PI / 2; // Assuming Y is up");
code = code.replace("obj.rotation.x = -Math.PI / 2;", "// obj.rotation.x = -Math.PI / 2; // Assuming Y is up");

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
console.log('Patched viewer.js for OBJ loading correctly');
