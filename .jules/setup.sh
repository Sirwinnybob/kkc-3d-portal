#!/bin/bash
set -ex

echo "Starting environment setup..."

# Install dependencies using pnpm as mandated by memory
pnpm install

# Install Playwright dependencies
npx playwright install --with-deps chromium

# Run tests using the native Node test runner as mandated by memory
node --test test/*.js test/*.test.js

echo "Environment setup complete!"
