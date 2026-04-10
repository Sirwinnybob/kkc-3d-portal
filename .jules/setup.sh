#!/bin/bash
set -ex

echo "Starting environment setup..."

# Install Assimp and its dependencies
sudo apt-get update
sudo apt-get install -y assimp-utils zlib1g

# Install dependencies using pnpm as mandated by memory
pnpm install

# Install Playwright dependencies
npx playwright install --with-deps chromium

# Prepare test data directories
mkdir -p jobs textures Showroom

# Copy files from Test Library if it exists
if [ -d "Test Library" ]; then
    echo "Found Test Library, copying files..."

    # Copy textures if they exist
    if [ -d "Test Library/textures" ]; then
        cp -r "Test Library/textures/"* textures/ 2>/dev/null || true
    fi

    # Loop through other items in Test Library and copy to jobs
    for item in "Test Library"/*; do
        basename_item=$(basename "$item")
        if [ "$basename_item" != "textures" ] && [ -d "$item" ]; then
            cp -r "$item" jobs/
        fi
    done
fi

# Run tests using the native Node test runner as mandated by memory
node --test test/*.js test/*.test.js

echo "Environment setup complete!"
