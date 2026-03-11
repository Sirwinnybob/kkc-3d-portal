# Agent Instructions

## Versioning System

When instructed to make a release or update the application, you must follow this versioning system:

1.  **Determine the new version number:** Use Semantic Versioning (SemVer) format: `MAJOR.MINOR.PATCH`.
2.  **Update `package.json`:** Update the `"version"` field to the new version number.
3.  **Update `server.js`:** Update the `APP_VERSION` constant to the new version number.
4.  **Create a Git Tag:** Once your code changes are committed, you must create an annotated Git tag with the prefix `v` (e.g., `v1.0.1`).
    *   Command: `git tag -a v1.0.1 -m "Release v1.0.1"`
5.  **Push the Tag:** Push the tag to the remote repository.
    *   Command: `git push origin v1.0.1`

By pushing the tag, a GitHub Action will automatically:
*   Build and push the Docker image with the appropriate version tags (e.g., `1.0.1`, `1.0`, `1`, `latest`).
*   Create a GitHub Release associated with the tag.

Always ensure the `package.json` version, `APP_VERSION` in `server.js`, and the Git tag are perfectly in sync.
