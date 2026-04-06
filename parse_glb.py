import json

with open("test/Exapmle parsing/548.textures.json", "r") as f:
    textures = json.load(f)
    print("Materials in 548:")
    for mat, val in textures['materials'].items():
        if val['bestMatch']:
            print(f" - {mat} -> {val['bestMatch']['name']} (w:{val['bestMatch']['width']} h:{val['bestMatch']['height']})")
