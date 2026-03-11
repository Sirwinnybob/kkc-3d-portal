# KKC Cabinet Portal

A simple web viewer for 3D cabinet designs.

## Overview

This tool lets customers view their cabinet designs directly from their web browser. It's built to run on a TrueNAS SCALE server, keeping your data hosted locally while providing an easy way to share designs.

## How it works

1. **Drop & Go:** Drop exported `.dae` folders into the `jobs` directory (e.g., via an SMB share).
2. **Auto-Conversion:** The server automatically detects new files and uses Assimp to convert them into optimized `.glb` files.
3. **View:** Customers get a link to view the 3D model, complete with nice lighting, sharp textures, and mobile-friendly controls.

If you update a `.dae` file, the portal automatically re-converts it so the customer always sees the latest version.

## Features

*   **3D Rendering:** High-quality visuals using Three.js with studio lighting and custom post-processing.
*   **Mobile Ready:** Includes touch controls and a virtual zoom joystick.
*   **Secure:** Includes basic security features like rate limiting, path sanitization, and secure HTTP headers via Helmet.js.

## Tech Stack

*   **Backend:** Node.js (Express, Chokidar)
*   **Engine:** Assimp (C++) + Three.js (WebGL)
*   **Deployment:** Designed for Docker on TrueNAS SCALE

## Running Locally

1. `npm install`
2. `npm start` (or `node server.js`)
