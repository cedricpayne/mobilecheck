FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/
COPY config/ ./config/
COPY services/ ./services/
COPY utils/ ./utils/

RUN npm run build

RUN npm prune --production

RUN mkdir -p /app/storage/images /app/storage/audio /app/storage/video /app/storage/cache

ENV NODE_ENV=production
ENV STORAGE_DIR=/app/storage

EXPOSE 3000

CMD ["node", "dist/src/server.js"]
