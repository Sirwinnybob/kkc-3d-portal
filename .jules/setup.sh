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
        # Use cp -a with . to copy all contents including hidden files
        cp -a "Test Library/textures/." textures/ 2>/dev/null || true
    fi

    # Copy Showroom if it exists
    if [ -d "Test Library/Showroom" ]; then
        # Use cp -a with . to copy all contents including hidden files
        cp -a "Test Library/Showroom/." Showroom/ 2>/dev/null || true
    fi

    # Loop through other items in Test Library and copy to jobs
    for item in "Test Library"/*; do
        basename_item=$(basename "$item")
        if [ "$basename_item" != "textures" ] && [ "$basename_item" != "Showroom" ] && [ -d "$item" ]; then
            cp -a "$item" jobs/
        fi
    done
fi

# Run tests using the native Node test runner as mandated by memory
node --test test/*.js test/*.test.js

# Clean up test data directories to keep the git working tree clean
rm -rf jobs textures Showroom

echo "Environment setup complete!"
