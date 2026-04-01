import re

viewer_file = 'public/js/viewer.js'

with open(viewer_file, 'r') as f:
    content = f.read()

# Let's replace the isObj block inside init
old_obj_block = """        if (isObj) {
            const mtlUrl = urlData.url.substring(0, urlData.url.lastIndexOf('.')) + '.mtl';
            const mtlLoader = new MTLLoader();

            mtlLoader.load(mtlUrl, function(materials) {
                materials.preload();
                const objLoader = new OBJLoader();
                objLoader.setMaterials(materials);

                const fileLoader = new THREE.FileLoader();
                fileLoader.load(urlData.url, function(text) {
                    const lines = text.substring(0, 1024).split('\\n');
                    let scale = 1.0;
                    for (const line of lines) {"""

new_obj_block = """        if (isObj) {
            const mtlUrl = urlData.url.substring(0, urlData.url.lastIndexOf('.')) + '.mtl';
            const mtlDir = mtlUrl.substring(0, mtlUrl.lastIndexOf('/') + 1);

            // Set up a LoadingManager to sanitize material URLs from SketchUp
            const manager = new THREE.LoadingManager();
            manager.setURLModifier((url) => {
                // Ignore data URIs or already-resolved URLs
                if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http')) return url;

                // Fix Windows backslashes sometimes exported by SketchUp
                let cleanUrl = url.replace(/\\\\/g, '/');

                // Encode hash characters (#) so they aren't parsed as URL fragments
                cleanUrl = cleanUrl.replace(/#/g, '%23');
                cleanUrl = cleanUrl.replace(/\\?/g, '%3F');

                return cleanUrl;
            });

            const mtlLoader = new MTLLoader(manager);
            // Crucial: Set resource path so textures resolve relative to the .mtl folder
            mtlLoader.setResourcePath(mtlDir);

            mtlLoader.load(mtlUrl, function(materials) {
                materials.preload();
                const objLoader = new OBJLoader(manager);
                objLoader.setMaterials(materials);

                const fileLoader = new THREE.FileLoader(manager);
                fileLoader.load(urlData.url, function(text) {
                    const lines = text.substring(0, 1024).split('\\n');
                    let scale = 1.0;
                    for (const line of lines) {"""

content = content.replace(old_obj_block, new_obj_block)

# Replace the fallback block too (if MTL fails)
old_fallback_block = """            }, undefined, function(err) {
                console.warn('MTL load failed, loading OBJ without materials:', err);
                const objLoader = new OBJLoader();
                const fileLoader = new THREE.FileLoader();
                fileLoader.load(urlData.url, function(text) {"""

new_fallback_block = """            }, undefined, function(err) {
                console.warn('MTL load failed, loading OBJ without materials:', err);
                const objLoader = new OBJLoader(manager);
                const fileLoader = new THREE.FileLoader(manager);
                fileLoader.load(urlData.url, function(text) {"""

content = content.replace(old_fallback_block, new_fallback_block)

with open(viewer_file, 'w') as f:
    f.write(content)
