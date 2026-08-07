# --- STAGE 1: Builder ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for TypeScript build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client & compile TypeScript code to dist/
RUN npx prisma generate
RUN npx tsc

# --- STAGE 2: Production Runner ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Copy package files and Prisma schema
COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev

# Generate Prisma client binaries for Alpine Linux
RUN npx prisma generate

# Copy compiled JavaScript files from builder stage
COPY --from=builder /app/dist ./dist

# Expose server port
EXPOSE 4000

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

# Start production server
CMD ["node", "dist/index.js"]
