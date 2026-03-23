#!/usr/bin/env python3
"""
GLB File Parser - Analyzes GLB files and extracts mesh/node information
"""

import json
from pygltflib import GLTF2
import os

def parse_glb_file(glb_path):
    """Parse a GLB file and extract all mesh and node information"""
    
    if not os.path.exists(glb_path):
        print(f"Error: File {glb_path} not found")
        return None
    
    # Load the GLB file
    gltf = GLTF2().load(glb_path)
    
    print(f"\n=== GLB File Analysis: {glb_path} ===\n")
    
    # Basic file info
    print(f"Scenes: {len(gltf.scenes)}")
    print(f"Nodes: {len(gltf.nodes)}")
    print(f"Meshes: {len(gltf.meshes)}")
    print(f"Materials: {len(gltf.materials)}")
    print(f"Accessors: {len(gltf.accessors)}")
    print(f"Buffer Views: {len(gltf.bufferViews)}")
    print(f"Buffers: {len(gltf.buffers)}")
    
    print("\n" + "="*60)
    print("MATERIALS")
    print("="*60)
    
    materials_info = []
    for i, material in enumerate(gltf.materials):
        mat_name = material.name if material.name else f"Material_{i}"
        materials_info.append({
            'index': i,
            'name': mat_name
        })
        print(f"  [{i}] {mat_name}")
    
    print("\n" + "="*60)
    print("NODES (Scene Hierarchy)")
    print("="*60)
    
    nodes_info = []
    for i, node in enumerate(gltf.nodes):
        node_name = node.name if node.name else f"Node_{i}"
        mesh_index = node.mesh if node.mesh is not None else -1
        children = node.children if node.children else []
        
        node_info = {
            'index': i,
            'name': node_name,
            'mesh_index': mesh_index,
            'children': children
        }
        nodes_info.append(node_info)
        
        mesh_info = f" -> Mesh[{mesh_index}]" if mesh_index >= 0 else ""
        children_info = f" (children: {children})" if children else ""
        print(f"  [{i}] {node_name}{mesh_info}{children_info}")
    
    print("\n" + "="*60)
    print("MESHES")
    print("="*60)
    
    meshes_info = []
    for i, mesh in enumerate(gltf.meshes):
        mesh_name = mesh.name if mesh.name else f"Mesh_{i}"
        primitives = []
        
        for j, primitive in enumerate(mesh.primitives):
            material_index = primitive.material if primitive.material is not None else -1
            material_name = gltf.materials[material_index].name if material_index >= 0 and material_index < len(gltf.materials) else "No Material"
            
            primitives.append({
                'index': j,
                'material_index': material_index,
                'material_name': material_name,
                'mode': primitive.mode
            })
        
        mesh_info = {
            'index': i,
            'name': mesh_name,
            'primitives': primitives
        }
        meshes_info.append(mesh_info)
        
        print(f"  [{i}] {mesh_name}")
        for prim in primitives:
            print(f"      Primitive {prim['index']}: Material = {prim['material_name']} (index {prim['material_index']})")
    
    print("\n" + "="*60)
    print("SCENE ROOT NODES")
    print("="*60)
    
    for scene_idx, scene in enumerate(gltf.scenes):
        scene_name = scene.name if scene.name else f"Scene_{scene_idx}"
        print(f"\nScene: {scene_name}")
        if scene.nodes:
            for root_node_idx in scene.nodes:
                print_root_hierarchy(gltf, root_node_idx, indent=2)
    
    return {
        'materials': materials_info,
        'nodes': nodes_info,
        'meshes': meshes_info
    }

def print_root_hierarchy(gltf, node_idx, indent=0):
    """Recursively print node hierarchy"""
    if node_idx >= len(gltf.nodes):
        return
    
    node = gltf.nodes[node_idx]
    node_name = node.name if node.name else f"Node_{node_idx}"
    mesh_index = node.mesh if node.mesh is not None else -1
    
    prefix = " " * indent
    mesh_info = f" [Mesh {mesh_index}]" if mesh_index >= 0 else ""
    print(f"{prefix}- {node_name}{mesh_info}")
    
    if node.children:
        for child_idx in node.children:
            print_root_hierarchy(gltf, child_idx, indent + 2)

def categorize_nodes(glb_path, textures_json_path):
    """Categorize nodes based on materials and names"""
    
    # Load textures JSON
    with open(textures_json_path, 'r') as f:
        textures_data = json.load(f)
    
    # Parse GLB
    gltf = GLTF2().load(glb_path)
    
    print("\n" + "="*60)
    print("CATEGORIZATION BY TYPE")
    print("="*60)
    
    categories = {}
    
    for i, node in enumerate(gltf.nodes):
        node_name = node.name if node.name else f"Node_{i}"
        mesh_index = node.mesh if node.mesh is not None else -1
        
        # Get material info from mesh
        material_category = "Unknown"
        material_name = "Unknown"
        
        if mesh_index >= 0 and mesh_index < len(gltf.meshes):
            mesh = gltf.meshes[mesh_index]
            if mesh.primitives:
                material_index = mesh.primitives[0].material
                if material_index is not None and material_index < len(gltf.materials):
                    material = gltf.materials[material_index]
                    material_name = material.name if material.name else f"Material_{material_index}"
                    
                    # Check textures JSON for category
                    if material_name in textures_data.get('materials', {}):
                        material_category = textures_data['materials'][material_name].get('bestCategory', 'Unknown')
        
        # Determine category based on name and material
        category = material_category
        
        # Override based on node name patterns
        name_lower = node_name.lower()
        if 'hidden' in name_lower or 'ply' in name_lower or 'edge' in name_lower:
            category = 'Hidden'
        elif 'cherry' in name_lower:
            category = 'Hardwood'
        elif 'maple' in name_lower:
            category = 'Hardwood'
        elif 'mdf' in name_lower:
            category = 'Hidden'
        elif 'particle' in name_lower:
            category = 'Hidden'
        
        if category not in categories:
            categories[category] = []
        
        categories[category].append({
            'node_index': i,
            'node_name': node_name,
            'mesh_index': mesh_index,
            'material_name': material_name
        })
    
    # Print categories
    for category, items in sorted(categories.items()):
        print(f"\n{category}:")
        print(f"  Count: {len(items)}")
        for item in items:
            print(f"    - [{item['node_index']}] {item['node_name']} (Material: {item['material_name']})")
    
    return categories

if __name__ == "__main__":
    glb_file = "548.glb"
    textures_file = "548.textures.json"
    
    # Parse the GLB file
    info = parse_glb_file(glb_file)
    
    # Categorize nodes
    if os.path.exists(textures_file):
        categories = categorize_nodes(glb_file, textures_file)
    else:
        print(f"\nWarning: {textures_file} not found, skipping categorization")