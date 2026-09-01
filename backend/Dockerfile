FROM node:22-alpine AS builder

WORKDIR /app

# Copy root manifests
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/

# Install dependencies across workspaces
RUN npm ci

# Copy source files
COPY shared/ ./shared/
COPY backend/ ./backend/

# Build shared and backend
RUN npm run build --workspace=shared
RUN npm run build --workspace=backend

# Production image
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/

RUN npm ci --omit=dev

COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY backend/migrations ./backend/migrations

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=backend"]
