# Use Node.js 22 as base for npm 11 compatibility (requires >=22.9.0 || ^20.17.0)
FROM node:22

# Install Assimp and its dependencies
RUN apt-get update && apt-get install -y \
    assimp-utils \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install --omit=dev

# Copy app source
COPY . .

# Create persistent storage directories
RUN mkdir -p jobs public

# Expose the web port
EXPOSE 5021

# Start the server
CMD ["node", "server.js"]
