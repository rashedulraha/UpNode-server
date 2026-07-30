# UpNode Express Backend - Production Deployment & Architecture Guide

Production-ready modular Express backend for **UpNode**, featuring multi-tenant isolation, real-time Server-Sent Events (SSE), Redis rate limiting, BullMQ alert background queues, and graceful shutdown handling.

---

## 🚀 Environment Variables Configuration

Create a `.env` file in the `server` directory:

```env
# Node Environment
NODE_ENV=production
PORT=4000

# PostgreSQL Database Connection (Prisma)
DATABASE_URL="postgresql://user:password@localhost:5432/upnode?schema=public&connection_limit=20&pool_timeout=10"

# Redis Connection (Pub/Sub & BullMQ & Rate Limiter)
REDIS_URL="redis://localhost:6379"
# Or standalone parameters:
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# Better Auth Configuration
BETTER_AUTH_SECRET="your_strong_random_secret_here"
BETTER_AUTH_URL="http://localhost:4000"

# Client CORS Allowed Origin
CLIENT_URL="http://localhost:3000"

# Redis Rate Limiting Options
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

---

## 🔒 Production Security Hardening

1. **Helmet HTTP Headers**: Enforces Security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`).
2. **Strict CORS**: Only allows credentials from `CLIENT_URL`.
3. **Payload Limits**: Limits JSON body size to `1mb` (`express.json({ limit: '1mb' })`) to prevent buffer overflow and memory exhaustion attacks.
4. **Trust Proxy**: Configured for reverse proxy environments (Nginx, Cloudflare, AWS Application Load Balancer).

---

## ⚡ Redis Sliding-Window Rate Limiting

Ingestion and real-time stream routes (`/api/stream`) are protected by a **Sliding Window Rate Limiter** powered by Redis (`rate-limit-redis`).

* **Counter Storage**: Stored in Redis keys (`upnode:ratelimit:*`) to prevent hitting PostgreSQL database.
* **HTTP 429 Error Response**: Returns standardized JSON error output when limit is exceeded:
  ```json
  {
    "success": false,
    "message": "Telemetry ingestion rate limit exceeded. Please throttle your client requests.",
    "error": { "code": "TOO_MANY_REQUESTS" }
  }
  ```

---

## 🗄️ Prisma Connection Pooling & pgBouncer Guide

### 1. Connection Pool Parameters
Configure PostgreSQL connection limits directly in `DATABASE_URL`:
```text
DATABASE_URL="postgresql://postgres:password@db-host:5432/upnode?schema=public&connection_limit=20&pool_timeout=10"
```
* `connection_limit`: Max connections in Prisma instance pool.
* `pool_timeout`: Seconds to wait before timing out if all connections are busy.

### 2. Deployment Behind pgBouncer
When deploying behind a **pgBouncer** transaction pooler:
- Append `?pgbouncer=true&connection_limit=10` to `DATABASE_URL`.
- Use a separate direct connection URL (`DIRECT_URL`) for Prisma migrations.

Example:
```env
DATABASE_URL="postgresql://postgres:password@pgbouncer-host:6432/upnode?schema=public&pgbouncer=true&connection_limit=10"
DIRECT_URL="postgresql://postgres:password@db-host:5432/upnode?schema=public"
```

---

## 🛡️ Centralized Error Handling

All synchronous and asynchronous errors are handled by `src/middlewares/error.middleware.ts`.

Standardized JSON Error Format:
```json
{
  "success": false,
  "message": "Human readable error message",
  "error": {
    "code": "ERROR_CODE",
    "details": []
  }
}
```

Error Codes:
* `VALIDATION_ERROR` (400 - Zod validation failures)
* `BAD_REQUEST` (400)
* `UNAUTHORIZED` (401)
* `FORBIDDEN` (403)
* `NOT_FOUND` (404)
* `OPTIMISTIC_LOCK_CONFLICT` (409 - Concurrent modification conflict)
* `TOO_MANY_REQUESTS` (429)
* `INTERNAL_SERVER_ERROR` (500 - Stack traces hidden in production)

---

## 🛑 Graceful Shutdown (`SIGTERM` / `SIGINT`)

When the server receives a termination signal (`SIGTERM` from Docker/K8s or `SIGINT` via Ctrl+C):

1. **HTTP Server**: Stops accepting new connections (`server.close()`).
2. **Active SSE Streams**: Notifies active client streams and closes responses cleanly.
3. **BullMQ Alert Worker**: Stops receiving new jobs and finishes active jobs (`worker.close()`).
4. **Redis Connections**: Closes primary, publisher, and subscriber Redis clients (`redis.quit()`).
5. **Prisma Client**: Disconnects database pool (`prisma.$disconnect()`).
6. **Safety Timeout**: Enforces 10s fallback timer to prevent hanging processes.

---

## 🏃 Running the Server

### Development
```bash
npm run dev
```

### Production Build & Start
```bash
npm run build
npm start
```
