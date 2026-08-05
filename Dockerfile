# Use Node.js 22-slim for a much smaller base image
# (slim omits the full C/C++ build toolchain, git, etc. — we don't need them at runtime)
FROM node:22-slim

# Install Assimp and its dependencies
RUN apt-get update && apt-get install -y \
    assimp-utils \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy app source (respects .dockerignore)
COPY . .

# Create persistent storage directories
RUN mkdir -p jobs public

# Expose the web port
EXPOSE 5021

# Start the server
CMD ["node", "server.js"]
