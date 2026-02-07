# Build dashboard
FROM node:20-alpine AS dashboard
WORKDIR /app
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Build backend and serve dashboard
FROM node:20-alpine AS backend
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/tsconfig.json ./
COPY backend/src/ ./src/
RUN npm run build

# Final image: backend + dashboard static files
FROM node:20-alpine
WORKDIR /app
COPY --from=backend /app/package.json ./
COPY --from=backend /app/node_modules ./node_modules/
COPY --from=backend /app/dist ./dist/
COPY --from=dashboard /app/dist ./dashboard-dist/

USER node
EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
