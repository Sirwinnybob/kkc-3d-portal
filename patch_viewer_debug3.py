import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Instead of using playwright's page.evaluate, let's just make the application log the properties itself after the model loads
old_load_success = """                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
                    camera.lookAt(center);
                    controls.target.copy(center);
                    controls.update();
                    updateStatus("");
                });"""

new_load_success = """                    const box = new THREE.Box3().setFromObject(model);
                    const center = box.getCenter(new THREE.Vector3());
                    const size = box.getSize(new THREE.Vector3());
                    const maxDim = Math.max(size.x, size.y, size.z);
                    camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
                    camera.lookAt(center);
                    controls.target.copy(center);
                    controls.update();
                    updateStatus("");

                    // DEBUG LOGGING
                    let report = "\\n==== DEBUG MATERIAL REPORT ====\\n";
                    model.traverse(child => {
                        if (child.isMesh) {
                            report += `Mesh: ${child.name}\\n`;
                            report += `  Has UVs: ${child.geometry.attributes.uv !== undefined}\\n`;
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            mats.forEach(m => {
                                report += `  Material: ${m.name}\\n`;
                                report += `    Has Map: ${!!m.map}\\n`;
                                report += `    Color: #${m.color.getHexString()}\\n`;
                                if (m.map) {
                                    report += `    ColorSpace: ${m.map.colorSpace}\\n`;
                                    if (m.map.image) {
                                        report += `    Image Src: ${m.map.image.src}\\n`;
                                    }
                                }
                            });
                        }
                    });
                    console.log(report);
                });"""
content = content.replace(old_load_success, new_load_success)

with open(viewer_file, 'w') as f:
    f.write(content)
