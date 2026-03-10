# Use Node.js as base
FROM node:20

# Install Assimp and its dependencies
RUN apt-get update && apt-get install -y \
    assimp-utils \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files and install
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Create persistent storage directories
RUN mkdir -p jobs public

# Expose the web port
EXPOSE 5021

# Start the server
CMD ["node", "server.js"]
