FROM node:20-bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip curl \
    && python3 -m pip install --no-cache-dir --upgrade yt-dlp \
    && which yt-dlp \
    && yt-dlp --version \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .
RUN mkdir -p tmp downloads

EXPOSE 3000
CMD ["node", "server.js"]
