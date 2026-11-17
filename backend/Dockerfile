# Construir desde la raíz del monorepo: docker build -f backend/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w backend
COPY backend backend
RUN npm run build -w backend

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci -w backend --omit=dev && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
EXPOSE 4000
USER node
CMD ["node", "dist/main.js"]
