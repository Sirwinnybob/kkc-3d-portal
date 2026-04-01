with open('public/js/viewer.js', 'r') as f:
    lines = f.readlines()

new_lines = []
for line in lines:
    if line.strip() == "if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);":
        new_lines.append(line)
    elif line.strip() == "else init();":
        new_lines.append(line)
        new_lines.append("\n// Light Mode Toggle\n")
        new_lines.append("function setupLightMode() {\n")
        new_lines.append("    const lightModeBtn = document.getElementById('light-mode-btn');\n")
        new_lines.append("    if (lightModeBtn) {\n")
        new_lines.append("        const updateLightModeUI = () => {\n")
        new_lines.append("            const isLightMode = localStorage.getItem(\"lightMode\") === \"true\";\n")
        new_lines.append("            if (isLightMode) {\n")
        new_lines.append("                lightModeBtn.style.background = '#e0e0e0';\n")
        new_lines.append("            } else {\n")
        new_lines.append("                lightModeBtn.style.background = '#fff';\n")
        new_lines.append("            }\n")
        new_lines.append("        };\n")
        new_lines.append("\n")
        new_lines.append("        lightModeBtn.addEventListener('click', () => {\n")
        new_lines.append("            const isLightMode = localStorage.getItem(\"lightMode\") === \"true\";\n")
        new_lines.append("            const newMode = !isLightMode;\n")
        new_lines.append("            localStorage.setItem(\"lightMode\", newMode);\n")
        new_lines.append("            \n")
        new_lines.append("            if (scene) {\n")
        new_lines.append("                scene.background = new THREE.Color(newMode ? 0xf0f0f0 : 0x111111);\n")
        new_lines.append("            }\n")
        new_lines.append("            updateLightModeUI();\n")
        new_lines.append("        });\n")
        new_lines.append("\n")
        new_lines.append("        updateLightModeUI();\n")
        new_lines.append("    }\n")
        new_lines.append("}\n")
        new_lines.append("if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupLightMode);\n")
        new_lines.append("else setupLightMode();\n")
        break
    else:
        new_lines.append(line)

with open('public/js/viewer.js', 'w') as f:
    f.writelines(new_lines)
