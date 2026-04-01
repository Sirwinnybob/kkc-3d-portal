# Page snapshot

```yaml
- generic [ref=e1]:
  - generic:
    - generic [ref=e2]:
      - button "Menu" [active] [ref=e3] [cursor=pointer]: ☰
      - generic [ref=e4]: "Job: ..."
    - generic:
      - button "Toggle Light Mode" [ref=e5] [cursor=pointer]:
        - img [ref=e6]
      - button "Share Link" [ref=e12] [cursor=pointer]:
        - img [ref=e13]
      - button "Help" [ref=e19] [cursor=pointer]: "?"
  - status:
    - generic: Initializing 3D...
  - generic [ref=e23]: Zoom
  - button "Take Photo" [ref=e24] [cursor=pointer]:
    - img [ref=e26]
  - button "Texture Catalog" [ref=e29] [cursor=pointer]:
    - img [ref=e31]
  - dialog "Texture Catalog" [ref=e36]:
    - generic [ref=e37]:
      - heading "Materials" [level=3] [ref=e38]
      - button "Close" [ref=e39] [cursor=pointer]: ×
    - paragraph [ref=e42]: Select a material to replace its texture
  - dialog "Quick texture picker" [ref=e43]:
    - generic [ref=e44]:
      - button "Back to categories" [ref=e45] [cursor=pointer]: ← Categories
      - generic [ref=e46]: Select Texture
      - generic [ref=e47]:
        - textbox "Search quick textures" [ref=e49]:
          - /placeholder: Search...
        - button "Close Quick Picker" [ref=e50] [cursor=pointer]: ×
```