#!/usr/bin/env python3
"""
GLB Parts Separator by Technical Part Type
Separates GLB file based on component naming conventions (Door, Cabinet Assembly, Molding, etc.)
"""

import json
import os
import copy
import re
from pygltflib import GLTF2

def extract_part_type(node_name):
    """Extract the technical part type from node name"""
    if not node_name:
        return "Unknown"
    
    # Common patterns in the node names:
    # Door_Door_134a
    # Upper_Cabinet_Assembly_22a
    # Base_Cabinet_Assembly_62a
    # Wall_Wall_Room_1a
    # Decorative_Window_Room_5a
    # CounterTop_CounterTop_1959a
    # Molding_Molding_XXX
    
    # Try to extract the main component type
    patterns = [
        (r'Door_Door', 'Door'),
        (r'Upper_Cabinet_Assembly', 'Upper_Cabinet_Assembly'),
        (r'Base_Cabinet_Assembly', 'Base_Cabinet_Assembly'),
        (r'Tall_Cabinet_Assembly', 'Tall_Cabinet_Assembly'),
        (r'Cabinet_Assembly', 'Cabinet_Assembly'),
        (r'CounterTop_CounterTop', 'CounterTop'),
        (r'Wall_Wall', 'Wall'),
        (r'Decorative_Window', 'Decorative_Window'),
        (r'Molding_Molding', 'Molding'),
        (r'Molding', 'Molding'),
        (r'Light', 'Light'),
        (r'Shelf', 'Shelf'),
        (r'Drawer', 'Drawer'),
        (r'Handle', 'Handle'),
        (r'Hinge', 'Hinge'),
    ]
    
    for pattern, part_type in patterns:
        if pattern in node_name:
            return part_type
    
    # If no pattern matches, try to extract from the structure
    # Format is usually: N_ShXXX_Type_Details or VN_ShXXX_Type_Details
    parts = node_name.split('_')
    if len(parts) >= 3:
        # Skip prefixes like N, Sh, VN
        for i, part in enumerate(parts):
            if part in ['N', 'Sh', 'VN']:
                continue
            if i + 1 < len(parts):
                potential_type = parts[i + 1]
                if potential_type in ['Door', 'Wall', 'Cabinet', 'CounterTop', 'Molding', 'Window']:
                    return potential_type
    
    return "Other"

def collect_nodes_by_part_type(gltf):
    """Collect all nodes organized by technical part type"""
    part_types = {}
    
    for i, node in enumerate(gltf.nodes):
        node_name = node.name if node.name else f"Node_{i}"
        part_type = extract_part_type(node_name)
        
        if part_type not in part_types:
            part_types[part_type] = []
        
        part_types[part_type].append({
            'index': i,
            'name': node_name,
            'mesh': node.mesh
        })
    
    return part_types

def create_glb_for_part_type(gltf, nodes_info, part_type_name):
    """Create a new GLB file containing only the specified nodes"""
    
    # Create a new GLTF2 object
    new_gltf = GLTF2()
    
    # Copy asset info
    if gltf.asset:
        new_gltf.asset = copy.deepcopy(gltf.asset)
    
    node_indices = [n['index'] for n in nodes_info]
    
    # Collect all meshes and materials needed
    meshes_needed = set()
    materials_needed = set()
    
    for node_info in nodes_info:
        node_idx = node_info['index']
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
        if new_mesh.primitives:
            for primitive in new_mesh.primitives:
                if primitive.material is not None and primitive.material in material_mapping:
                    primitive.material = material_mapping[primitive.material]
        new_meshes.append(new_mesh)
    new_gltf.meshes = new_meshes if new_meshes else []
    
    # Copy accessors, bufferViews, and buffers
    if gltf.accessors:
        new_gltf.accessors = copy.deepcopy(gltf.accessors)
    if gltf.bufferViews:
        new_gltf.bufferViews = copy.deepcopy(gltf.bufferViews)
    if gltf.buffers:
        new_gltf.buffers = copy.deepcopy(gltf.buffers)
    
    # Create new nodes
    new_nodes = []
    node_mapping = {}
    
    for node_info in nodes_info:
        node_idx = node_info['index']
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
    
    # Rebuild parent-child relationships (only within same part type)
    for node_info in nodes_info:
        node_idx = node_info['index']
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
    
    if not root_nodes and new_nodes:
        root_nodes = list(range(len(new_nodes)))
    
    new_scene = {
        "name": f"{part_type_name}_Scene",
        "nodes": root_nodes
    }
    new_gltf.scenes = [new_scene]
    new_gltf.scene = 0
    
    return new_gltf

def separate_glb_by_part_type(glb_path, output_dir="separated_by_type"):
    """Separate a GLB file into multiple files by technical part type"""
    
    if not os.path.exists(glb_path):
        print(f"Error: File {glb_path} not found")
        return
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Load GLB file
    gltf = GLTF2().load(glb_path)
    
    print(f"\n=== Separating GLB by Part Type ===")
    print(f"Input file: {glb_path}")
    print(f"Output directory: {output_dir}")
    
    # Collect nodes by part type
    part_types = collect_nodes_by_part_type(gltf)
    
    print(f"\nFound part types:")
    for part_type, nodes_info in sorted(part_types.items()):
        print(f"  {part_type}: {len(nodes_info)} nodes")
    
    # Create separate GLB files for each part type
    for part_type, nodes_info in sorted(part_types.items()):
        if not nodes_info:
            continue
        
        print(f"\nCreating GLB for part type: {part_type}")
        
        # Create new GLB for this part type
        new_gltf = create_glb_for_part_type(gltf, nodes_info, part_type)
        
        # Save the new GLB
        output_filename = f"{part_type.lower()}.glb"
        output_path = os.path.join(output_dir, output_filename)
        
        try:
            new_gltf.save(output_path)
            print(f"  Saved: {output_path}")
            print(f"    Nodes: {len(new_gltf.nodes)}")
            print(f"    Meshes: {len(new_gltf.meshes)}")
            print(f"    Materials: {len(new_gltf.materials)}")
        except Exception as e:
            import traceback
            print(f"  Error saving {output_path}: {e}")
            traceback.print_exc()
    
    # Create summary JSON
    summary = {
        "original_file": glb_path,
        "total_nodes": len(gltf.nodes),
        "part_types": {}
    }
    
    for part_type, nodes_info in sorted(part_types.items()):
        summary["part_types"][part_type] = {
            "count": len(nodes_info),
            "sample_names": [n['name'] for n in nodes_info[:10]],
            "output_file": f"{part_type.lower()}.glb"
        }
    
    summary_path = os.path.join(output_dir, "part_type_summary.json")
    with open(summary_path, 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n=== Separation Complete ===")
    print(f"Summary saved to: {summary_path}")
    print(f"Total files created: {len(part_types)}")

def create_part_type_report(glb_path, output_file="part_type_report.txt"):
    """Create a detailed report of all part types"""
    
    gltf = GLTF2().load(glb_path)
    part_types = collect_nodes_by_part_type(gltf)
    
    with open(output_file, 'w') as f:
        f.write("=" * 80 + "\n")
        f.write("GLB FILE - PART TYPE REPORT\n")
        f.write("=" * 80 + "\n\n")
        
        f.write(f"File: {glb_path}\n")
        f.write(f"Total Nodes: {len(gltf.nodes)}\n")
        f.write(f"Total Meshes: {len(gltf.meshes)}\n")
        f.write(f"Total Materials: {len(gltf.materials)}\n\n")
        
        f.write("PART TYPES SUMMARY:\n")
        f.write("-" * 40 + "\n")
        for part_type, nodes_info in sorted(part_types.items()):
            f.write(f"{part_type}: {len(nodes_info)} nodes\n")
        
        f.write("\n" + "=" * 80 + "\n")
        f.write("DETAILED BREAKDOWN BY PART TYPE\n")
        f.write("=" * 80 + "\n\n")
        
        for part_type, nodes_info in sorted(part_types.items()):
            f.write(f"\n{part_type} ({len(nodes_info)} nodes):\n")
            f.write("-" * 40 + "\n")
            
            # Show first 20 examples
            for node_info in nodes_info[:20]:
                f.write(f"  - {node_info['name']}\n")
            
            if len(nodes_info) > 20:
                f.write(f"  ... and {len(nodes_info) - 20} more\n")
    
    print(f"Report saved to: {output_file}")

if __name__ == "__main__":
    glb_file = "548.glb"
    
    # Create part type report
    create_part_type_report(glb_file)
    
    # Separate by part type
    separate_glb_by_part_type(glb_file)