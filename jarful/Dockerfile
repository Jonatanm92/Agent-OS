FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=8787 JARFUL_DB=/data/db.json
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "server.mjs"]
