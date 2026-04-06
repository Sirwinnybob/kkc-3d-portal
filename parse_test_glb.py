import json
import os

with open('test/Exapmle\ parsing/548.textures.json', 'r') as f:
    textures = json.load(f)
    print("Example GLB textures metadata:")
    print(json.dumps(textures, indent=2)[:500] + "\n...")

print("\nRunning a quick three.js script to inspect UV ranges...")
