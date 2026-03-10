# KKC Cabinet Portal - Professional 3D Customer Viewer

## Purpose
The KKC Cabinet Portal is a high-performance web application designed to give customers a professional, interactive 3D viewing experience of their cabinet designs. It bridges the gap between complex CAD software (**Cabinet Vision**) and a simple, user-friendly browser link that works on any device.

By hosting this on your **TrueNAS SCALE** server, you maintain full control over your data while providing a premium, branded service to your clients.

---

## Core Features

### 1. Automated Design Pipeline
*   **Drop & Go:** Simply drag your exported `.dae` folders into the `jobs` directory via an SMB share.
*   **Instant Normalization:** The portal uses a **Native C++ Assimp Engine** (the same high-end engine used in professional desktop software) to automatically fix non-standard geometry, triangulate complex polygons, and bake wood grain textures into a single, optimized `.glb` file.
*   **Revision Support:** The system monitors your files in real-time. If you modify a design and overwrite the `.dae`, the portal instantly re-converts it, ensuring the customer always sees the latest version.
*   **Crash Recovery:** On every startup, the server performs an "Initial Sync." It scans all job folders and automatically converts any new or updated designs it missed while offline.

### 2. High-Fidelity 3D Rendering
*   **Punchy Visuals:** We use a custom **KKC Post-Processing Shader** to replicate the vibrant look of high-end mobile apps. This includes professionally tuned **Saturation (0.85)** and **Contrast (1.6)**.
*   **Studio Lighting:** A 3-point view-space lighting system (Key, Fill, and Back lights) ensures the cabinets have depth and definition as you rotate them.
*   **Crystal Clear Textures:** Built-in **Anisotropic Filtering** removes the "frosted glass" blur common in web viewers, keeping your wood grains sharp and detailed at every angle.

### 3. Professional Navigation & Controls
*   **Mobile Optimized:** Includes a virtual **Zoom Joystick** for smooth, continuous zooming on touchscreens.
*   **Intelligent Pivot:** Users can **Double-Click (or Double-Tap)** any point on a cabinet to set it as the new center of rotation, making it easy to inspect corners or handles.
*   **Custom Sensitivity:** A built-in slider allows users to dial in their preferred movement speed.
*   **Multi-Room Support:** If a job contains multiple rooms (e.g., "Kitchen" and "Master Bath"), the portal provides a clean selection menu and an instant room-switcher inside the viewer.

---

## Security & System Integrity
The portal is built with a multi-layered security architecture to ensure your TrueNAS server and your business data remain 100% secure.

### Layer 1: The App Sandbox (Containerization)
When deployed on TrueNAS SCALE, the portal runs inside an isolated **Docker container**. It has zero access to your system files, backups, or other datasets. It only "knows" about the specific jobs folder you permit it to see.

### Layer 2: Network Isolation
The portal and your **SMB Share** are completely separate. While you use SMB to upload files with your private credentials, the web portal uses its own protocol. There is no "bridge" for a customer to move from their browser into your internal Windows network.

### Layer 3: Backend Hardening
*   **Anti-Brute Force:** An integrated **Rate Limiter** blocks any IP address that attempts to "guess" job codes too rapidly (Max 50 tries per 15 mins).
*   **Path Sanitization:** The server strictly rejects any "directory traversal" characters (like `../`). This prevents attackers from trying to look outside the jobs folder.
*   **Secure Headers (Helmet.js):** The server hides its identity and enforces a strict **Content Security Policy (CSP)**, preventing malicious code injection.
*   **File Type Enforcement:** The server will *only* serve 3D models and images. It ignores and blocks all other file types (scripts, executables, etc.).

---

## Deployment Summary
*   **Operating System:** TrueNAS SCALE (Electric Eel)
*   **Engine:** Native Assimp (C++) + Three.js (WebGL)
*   **Backend:** Node.js (Express & Chokidar)
*   **Workflow:** SMB Drop -> Auto-Conversion -> Customer Web Access
