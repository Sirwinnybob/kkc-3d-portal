#!/usr/bin/env python3
"""
GLB Parts Separator - Separates GLB file into different files by category/material type
"""

import json
import os
import copy
from pygltflib import GLTF2
import struct

def load_textures_json(textures_json_path):
    """Load the textures JSON file for material categorization"""
    with open(textures_json_path, 'r') as f:
        return json.load(f)

def categorize_node(gltf, node_idx, textures_data):
    """Categorize a node based on its name and material"""
    if node_idx >= len(gltf.nodes):
        return "Unknown"
    
    node = gltf.nodes[node_idx]
    node_name = node.name if node.name else f"Node_{node_idx}"
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
    
    return category

def collect_nodes_by_category(gltf, textures_data):
    """Collect all nodes organized by category"""
    categories = {}
    
    for i, node in enumerate(gltf.nodes):
        category = categorize_node(gltf, i, textures_data)
        
        if category not in categories:
            categories[category] = []
        
        categories[category].append(i)
    
    return categories

def get_all_child_nodes(gltf, node_idx):
    """Recursively get all child nodes of a given node"""
    children = set()
    
    if node_idx >= len(gltf.nodes):
        return children
    
    node = gltf.nodes[node_idx]
    if node.children:
        for child_idx in node.children:
            children.add(child_idx)
            children.update(get_all_child_nodes(gltf, child_idx))
    
    return children

def create_glb_for_category(gltf, node_indices, category_name):
    """Create a new GLB file containing only the specified nodes"""
    
    # Create a new GLTF2 object
    new_gltf = GLTF2()
    
    # Copy asset info
    if gltf.asset:
        new_gltf.asset = copy.deepcopy(gltf.asset)
    
    # Collect all meshes, materials, accessors, bufferViews needed
    meshes_needed = set()
    materials_needed = set()
    
    for node_idx in node_indices:
        if node_idx < len(gltf.nodes):
            node = gltf.nodes[node_idx]
            if node.mesh is not None and node.mesh < len(gltf.meshes):
                meshes_needed.add(node.mesh)
    
    # Get materials from meshes
    for mesh_idx in meshes_needed:
        if mesh_idx < len(gltf.meshes):
            mesh = gltf.meshes[mesh_idx]
            if mesh.primitives:
                for primitive in mesh.primitives:
                    if primitive.material is not None and primitive.material < len(gltf.materials):
                        materials_needed.add(primitive.material)
    
    # Create index mappings
    mesh_mapping = {}
    material_mapping = {}
    
    # Copy materials
    new_materials = []
    for old_idx in sorted(materials_needed):
        material_mapping[old_idx] = len(new_materials)
        new_materials.append(copy.deepcopy(gltf.materials[old_idx]))
    new_gltf.materials = new_materials if new_materials else []
    
    # Copy meshes and update material references
    new_meshes = []
    for old_idx in sorted(meshes_needed):
        mesh_mapping[old_idx] = len(new_meshes)
        new_mesh = copy.deepcopy(gltf.meshes[old_idx])
        # Update material references in primitives
        if new_mesh.primitives:
            for primitive in new_mesh.primitives:
                if primitive.material is not None and primitive.material in material_mapping:
                    primitive.material = material_mapping[primitive.material]
        new_meshes.append(new_mesh)
    new_gltf.meshes = new_meshes if new_meshes else []
    
    # Copy accessors, bufferViews, and buffers (copy all for simplicity)
    if gltf.accessors:
        new_gltf.accessors = copy.deepcopy(gltf.accessors)
    if gltf.bufferViews:
        new_gltf.bufferViews = copy.deepcopy(gltf.bufferViews)
    if gltf.buffers:
        new_gltf.buffers = copy.deepcopy(gltf.buffers)
    
    # Create new nodes
    new_nodes = []
    node_mapping = {}
    
    for node_idx in node_indices:
        if node_idx < len(gltf.nodes):
            node_mapping[node_idx] = len(new_nodes)
            new_node = copy.deepcopy(gltf.nodes[node_idx])
            
            # Update mesh reference
            if new_node.mesh is not None:
                if new_node.mesh in mesh_mapping:
                    new_node.mesh = mesh_mapping[new_node.mesh]
                else:
                    new_node.mesh = None
            
            # Clear children initially
            new_node.children = []
            new_nodes.append(new_node)
    
    # Rebuild parent-child relationships
    for node_idx in node_indices:
        if node_idx < len(gltf.nodes):
            node = gltf.nodes[node_idx]
            if node.children and node_idx in node_mapping:
                for child_idx in node.children:
                    if child_idx in node_mapping:
                        new_nodes[node_mapping[node_idx]].children.append(node_mapping[child_idx])
    
    new_gltf.nodes = new_nodes if new_nodes else []
    
    # Create a single scene with root nodes
    all_children = set()
    for node in new_nodes:
        if node.children:
            all_children.update(node.children)
    
    root_nodes = [i for i in range(len(new_nodes)) if i not in all_children]
    
    # If no root nodes found, use all nodes
    if not root_nodes and new_nodes:
        root_nodes = list(range(len(new_nodes)))
    
    new_scene = {
        "name": f"{category_name}_Scene",
        "nodes": root_nodes
    }
    new_gltf.scenes = [new_scene]
    new_gltf.scene = 0
    
    return new_gltf

def separate_glb_by_category(glb_path, textures_json_path, output_dir="separated_parts"):
    """Separate a GLB file into multiple files by category"""
    
    if not os.path.exists(glb_path):
        print(f"Error: File {glb_path} not found")
        return
    
    if not os.path.exists(textures_json_path):
        print(f"Error: File {textures_json_path} not found")
        return
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Load files
    gltf = GLTF2().load(glb_path)
    textures_data = load_textures_json(textures_json_path)
    
    print(f"\n=== Separating GLB by Category ===")
    print(f"Input file: {glb_path}")
    print(f"Output directory: {output_dir}")
    
    # Collect nodes by category
    categories = collect_nodes_by_category(gltf, textures_data)
    
    print(f"\nFound categories:")
    for category, node_indices in sorted(categories.items()):
        print(f"  {category}: {len(node_indices)} nodes")
    
    # Create separate GLB files for each category
    for category, node_indices in categories.items():
        if not node_indices:
            continue
        
        print(f"\nCreating GLB for category: {category}")
        
        # Create new GLB for this category
        new_gltf = create_glb_for_category(gltf, node_indices, category)
        
        # Save the new GLB
        output_filename = f"{category.lower()}_parts.glb"
        output_path = os.path.join(output_dir, output_filename)
        
        try:
            # Debug info
            print(f"  Debug - Nodes: {len(new_gltf.nodes) if new_gltf.nodes else 0}")
            print(f"  Debug - Meshes: {len(new_gltf.meshes) if new_gltf.meshes else 0}")
            print(f"  Debug - Materials: {len(new_gltf.materials) if new_gltf.materials else 0}")
            print(f"  Debug - Scenes: {len(new_gltf.scenes) if new_gltf.scenes else 0}")
            
            new_gltf.save(output_path)
            print(f"  Saved: {output_path}")
        except Exception as e:
            import traceback
            print(f"  Error saving {output_path}: {e}")
            traceback.print_exc()
    
    # Also create a summary JSON file
    summary = {
        "original_file": glb_path,
        "total_nodes": len(gltf.nodes),
        "categories": {}
    }
    
    for category, node_indices in categories.items():
        summary["categories"][category] = {
            "count": len(node_indices),
            "node_indices": node_indices[:100],  # First 100 indices for reference
            "output_file": f"{category.lower()}_parts.glb"
        }
    
    summary_path = os.path.join(output_dir, "separation_summary.json")
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n=== Separation Complete ===")
    print(f"Summary saved to: {summary_path}")
    print(f"Total files created: {len(categories)}")

def create_detailed_report(glb_path, textures_json_path, output_file="glb_categories_report.txt"):
    """Create a detailed report of all categories and their contents"""
    
    gltf = GLTF2().load(glb_path)
    textures_data = load_textures_json(textures_json_path)
    
    categories = collect_nodes_by_category(gltf, textures_data)
    
    with open(output_file, 'w') as f:
        f.write("=" * 80 + "\n")
        f.write("GLB FILE CATEGORIZATION REPORT\n")
        f.write("=" * 80 + "\n\n")
        
        f.write(f"File: {glb_path}\n")
        f.write(f"Total Nodes: {len(gltf.nodes)}\n")
        f.write(f"Total Meshes: {len(gltf.meshes)}\n")
        f.write(f"Total Materials: {len(gltf.materials)}\n\n")
        
        f.write("CATEGORIES SUMMARY:\n")
        f.write("-" * 40 + "\n")
        for category, node_indices in sorted(categories.items()):
            f.write(f"{category}: {len(node_indices)} nodes\n")
        
        f.write("\n" + "=" * 80 + "\n")
        f.write("DETAILED BREAKDOWN BY CATEGORY\n")
        f.write("=" * 80 + "\n\n")
        
        for category, node_indices in sorted(categories.items()):
            f.write(f"\n{category.upper()} ({len(node_indices)} nodes):\n")
            f.write("-" * 40 + "\n")
            
            # Group by node type patterns
            node_types = {}
            for node_idx in node_indices:
                if node_idx < len(gltf.nodes):
                    node = gltf.nodes[node_idx]
                    node_name = node.name if node.name else f"Node_{node_idx}"
                    
                    # Extract type from name
                    if "Upper_Cabinet" in node_name:
                        type_key = "Upper Cabinet"
                    elif "Base_Cabinet" in node_name:
                        type_key = "Base Cabinet"
                    elif "CounterTop" in node_name:
                        type_key = "CounterTop"
                    elif "Door" in node_name:
                        type_key = "Door"
                    elif "Wall" in node_name:
                        type_key = "Wall"
                    elif "Decorative_Window" in node_name:
                        type_key = "Decorative Window"
                    elif "Light" in node_name:
                        type_key = "Light"
                    else:
                        type_key = "Other"
                    
                    if type_key not in node_types:
                        node_types[type_key] = []
                    node_types[type_key].append(node_name)
            
            for type_key, names in sorted(node_types.items()):
                f.write(f"\n  {type_key}: {len(names)} items\n")
                # Show first 5 examples
                for name in names[:5]:
                    f.write(f"    - {name}\n")
                if len(names) > 5:
                    f.write(f"    ... and {len(names) - 5} more\n")
    
    print(f"Detailed report saved to: {output_file}")

if __name__ == "__main__":
    glb_file = "548.glb"
    textures_file = "548.textures.json"
    
    # Create detailed report
    create_detailed_report(glb_file, textures_file)
    
    # Separate the GLB file by category
    separate_glb_by_category(glb_file, textures_file)