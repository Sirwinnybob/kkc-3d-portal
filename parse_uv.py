import json

try:
    with open("test/Exapmle parsing/548.textures.json", "r") as f:
        textures = json.load(f)
        for mat, val in textures['materials'].items():
            print(f" - {mat} -> {val.get('bestMatch', {}).get('name')}")
except Exception as e:
    print(e)
