# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to 3D Viewer" [ref=e2] [cursor=pointer]:
    - /url: "#main-canvas"
  - generic:
    - generic [ref=e3]:
      - button "Menu" [ref=e4] [cursor=pointer]: ☰
      - generic [ref=e5]: "Job: ..."
    - generic:
      - button "Toggle Light Mode" [ref=e6] [cursor=pointer]:
        - img [ref=e7]
      - button "Share Link" [ref=e13] [cursor=pointer]:
        - img [ref=e14]
      - button "Help" [ref=e20] [cursor=pointer]: "?"
  - status:
    - generic: Initializing 3D...
  - generic [ref=e24]: Zoom
  - button "Take Photo" [ref=e25] [cursor=pointer]:
    - img [ref=e27]
  - button "Texture Catalog" [active] [ref=e30] [cursor=pointer]:
    - img [ref=e32]
  - dialog "Texture Catalog" [ref=e37]:
    - generic [ref=e38]:
      - heading "Materials" [level=3] [ref=e39]
      - button "Close" [ref=e40] [cursor=pointer]: ×
    - paragraph [ref=e43]: Select a material to replace its texture
  - dialog "Quick texture picker" [ref=e44]:
    - generic [ref=e45]:
      - button "Back to categories" [ref=e46] [cursor=pointer]: ← Categories
      - generic [ref=e47]: Select Texture
      - generic [ref=e48]:
        - textbox "Search quick textures" [ref=e50]:
          - /placeholder: Search...
        - button "Close Quick Picker" [ref=e51] [cursor=pointer]: ×
```