import { PrismaClient, IncidentStatus, IncidentSeverity, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting Prisma seed database script...");

  // 1. Clean existing records for clean, idempotent seed execution
  await prisma.timelineEvent.deleteMany({});
  await prisma.incident.deleteMany({});
  await prisma.pingMetric.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.member.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});

  console.log("🧹 Cleaned existing database records.");

  // 2. Create 1 Organization
  const organization = await prisma.organization.create({
    data: {
      id: "org-upnode-main",
      name: "UpNode SRE Enterprise",
      slug: "upnode-enterprise",
    },
  });
  console.log(`🏢 Created Organization: ${organization.name} (${organization.slug})`);

  // Create Test User & Admin Member
  const adminUser = await prisma.user.create({
    data: {
      id: "usr-sre-admin",
      name: "Alex Rivers",
      email: "alex@upnode.io",
      emailVerified: true,
      role: Role.SUPER_ADMIN,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  await prisma.member.create({
    data: {
      id: "mem-sre-admin",
      organizationId: organization.id,
      userId: adminUser.id,
      role: Role.ADMIN,
    },
  });
  console.log(`👤 Created Test Admin User: ${adminUser.email}`);

  // 3. Create 2 Test Projects with Unique API Keys
  const project1 = await prisma.project.create({
    data: {
      id: "proj-api-gateway",
      name: "API Gateway Microservice",
      slug: "api-gateway",
      url: "https://httpbin.org/status/200",
      apiKey: "upnode_pk_gateway_9988776655",
      organizationId: organization.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      id: "proj-payment-engine",
      name: "Payment Processing Engine",
      slug: "payment-engine",
      url: "https://httpbin.org/status/504",
      apiKey: "upnode_pk_payment_1122334455",
      organizationId: organization.id,
    },
  });
  console.log(`🚀 Created 2 Test Projects:\n 1. ${project1.name} (${project1.apiKey})\n 2. ${project2.name} (${project2.apiKey})`);

  // 4. Populate a Mix of 10 Incidents with Timeline Events
  const incidentsData = [
    {
      id: "inc-101",
      title: "PostgreSQL Connection Pool Saturation",
      description: "Database connection pool reached maximum threshold (100) under sudden traffic burst.",
      status: IncidentStatus.RESOLVED,
      severity: IncidentSeverity.HIGH,
      version: 3,
      projectId: project1.id,
      aiRootCause: "Unreleased pg pool connections in auth token verification middleware under load.",
      aiFixSuggestion: "Deploy PgBouncer connection proxy and enforce strict connection releases in express middleware.",
      daysAgo: 5,
      timeline: [
        { message: "High latency (> 1,200ms) detected on API gateway router.", status: IncidentStatus.INVESTIGATING },
        { message: "Postgres connection pool saturation confirmed as root cause.", status: IncidentStatus.IDENTIFIED },
        { message: "PgBouncer deployed; pool capacity restored to 100%.", status: IncidentStatus.RESOLVED },
      ],
    },
    {
      id: "inc-102",
      title: "Payment Gateway HTTP 504 Timeout Outage",
      description: "External payment provider endpoint failing with 504 Gateway Timeout errors.",
      status: IncidentStatus.INVESTIGATING,
      severity: IncidentSeverity.CRITICAL,
      version: 1,
      projectId: project2.id,
      aiRootCause: "Third-party payment service API response latency exceeds 10,000ms SLA threshold.",
      aiFixSuggestion: "Enable circuit breaker pattern to fail-fast and queue webhook notifications in Redis BullMQ.",
      daysAgo: 0,
      timeline: [
        { message: "Automated ping check failed: 504 Gateway Timeout.", status: IncidentStatus.INVESTIGATING },
        { message: "BullMQ alert worker dispatched critical notifications to SRE team.", status: IncidentStatus.INVESTIGATING },
      ],
    },
    {
      id: "inc-103",
      title: "Redis Session Token Cache Miss Spike",
      description: "Elevated eviction rates on Redis cluster causing transient JWT token validation delays.",
      status: IncidentStatus.INVESTIGATING,
      severity: IncidentSeverity.MEDIUM,
      version: 1,
      projectId: project1.id,
      aiRootCause: "Memory limit reached on Redis master node triggering volatile-lru eviction.",
      aiFixSuggestion: "Scale Redis memory tier to 4GB and adjust session key TTL expiration parameters.",
      daysAgo: 1,
      timeline: [
        { message: "Redis memory warning: 94% cache utilization limit reached.", status: IncidentStatus.INVESTIGATING },
      ],
    },
    {
      id: "inc-104",
      title: "High CPU Utilization on Ingestion Gateway",
      description: "CPU load on primary API ingestion node spiked to 98% due to unoptimized JSON parsing.",
      status: IncidentStatus.RESOLVED,
      severity: IncidentSeverity.HIGH,
      version: 2,
      projectId: project1.id,
      aiRootCause: "Synchronous JSON schema validation blocked Node.js event loop during batch payload ingestion.",
      aiFixSuggestion: "Migrate schema validation to non-blocking worker thread pool.",
      daysAgo: 4,
      timeline: [
        { message: "CPU utilization alert triggered (>95%).", status: IncidentStatus.INVESTIGATING },
        { message: "Worker thread offloading patch deployed.", status: IncidentStatus.RESOLVED },
      ],
    },
    {
      id: "inc-105",
      title: "SSL Certificate Expiry Warning",
      description: "TLS/SSL certificate for payment API host will expire in less than 7 days.",
      status: IncidentStatus.IDENTIFIED,
      severity: IncidentSeverity.MEDIUM,
      version: 2,
      projectId: project2.id,
      aiRootCause: "Automated Let's Encrypt Let's Encrypt renewal script failed ACME DNS challenge verification.",
      aiFixSuggestion: "Re-run certbot DNS-01 challenge script and update Cloudflare API credentials.",
      daysAgo: 2,
      timeline: [
        { message: "Certificate expiration monitor detected 6 days remaining.", status: IncidentStatus.INVESTIGATING },
        { message: "Root cause identified: ACME DNS challenge failure.", status: IncidentStatus.IDENTIFIED },
      ],
    },
    {
      id: "inc-106",
      title: "Rate Limiting Middleware Queue Overflow",
      description: "Rate limiter memory buffer overflow during automated DDOS vulnerability scan.",
      status: IncidentStatus.INVESTIGATING,
      severity: IncidentSeverity.CRITICAL,
      version: 1,
      projectId: project1.id,
      aiRootCause: "Sliding window rate limit algorithm held un-garbage-collected IP keys in memory.",
      aiFixSuggestion: "Switch to Redis-backed token bucket rate limiting algorithm.",
      daysAgo: 0,
      timeline: [
        { message: "Rate limit buffer overflow detected.", status: IncidentStatus.INVESTIGATING },
      ],
    },
    {
      id: "inc-107",
      title: "Third-Party Webhook Delivery Timeout",
      description: "Merchant notification webhooks timing out after 30 seconds.",
      status: IncidentStatus.RESOLVED,
      severity: IncidentSeverity.LOW,
      version: 2,
      projectId: project2.id,
      aiRootCause: "Stale TCP connection reuse on external HTTP client socket pool.",
      aiFixSuggestion: "Configure HTTP keep-alive timeout to 15 seconds.",
      daysAgo: 6,
      timeline: [
        { message: "Webhook delivery failure rate elevated.", status: IncidentStatus.INVESTIGATING },
        { message: "HTTP client socket keep-alive config updated.", status: IncidentStatus.RESOLVED },
      ],
    },
    {
      id: "inc-108",
      title: "Memory Leak in Background Telemetry Worker",
      description: "Heap allocation growing steadily on telemetry ping worker process.",
      status: IncidentStatus.MONITORING,
      severity: IncidentSeverity.MEDIUM,
      version: 2,
      projectId: project1.id,
      aiRootCause: "Unbound event listener references accumulating in memory during polling loop.",
      aiFixSuggestion: "Explicitly detach event listeners on job completion cycle.",
      daysAgo: 1,
      timeline: [
        { message: "Heap usage warning: 1.2GB memory allocated.", status: IncidentStatus.INVESTIGATING },
        { message: "Memory leak patch applied; monitoring heap metrics.", status: IncidentStatus.MONITORING },
      ],
    },
    {
      id: "inc-109",
      title: "DNS Lookup Delay on Primary Edge Router",
      description: "Intermittent DNS resolution latency (>500ms) on edge proxy routes.",
      status: IncidentStatus.RESOLVED,
      severity: IncidentSeverity.LOW,
      version: 2,
      projectId: project1.id,
      aiRootCause: "Upstream DNS provider packet drop during BGP routing table update.",
      aiFixSuggestion: "Add secondary DNS resolver fallback (1.1.1.1) in resolv.conf.",
      daysAgo: 7,
      timeline: [
        { message: "DNS resolution latency spike detected.", status: IncidentStatus.INVESTIGATING },
        { message: "Fallback DNS resolver added.", status: IncidentStatus.RESOLVED },
      ],
    },
    {
      id: "inc-110",
      title: "Kafka Consumer Group Rebalance Lag",
      description: "Event consumer group experiencing 120s rebalance delay on topic partition allocation.",
      status: IncidentStatus.INVESTIGATING,
      severity: IncidentSeverity.HIGH,
      version: 1,
      projectId: project2.id,
      aiRootCause: "Max poll interval ms exceeded by slow long-running payment validation tasks.",
      aiFixSuggestion: "Increase max.poll.interval.ms to 600,000ms and scale consumer instances.",
      daysAgo: 0,
      timeline: [
        { message: "Kafka consumer group rebalance alert triggered.", status: IncidentStatus.INVESTIGATING },
      ],
    },
  ];

  for (const item of incidentsData) {
    const createdAt = new Date(Date.now() - item.daysAgo * 24 * 60 * 60 * 1000);
    const incident = await prisma.incident.create({
      data: {
        id: item.id,
        title: item.title,
        description: item.description,
        status: item.status,
        severity: item.severity,
        version: item.version,
        projectId: item.projectId,
        aiRootCause: item.aiRootCause,
        aiFixSuggestion: item.aiFixSuggestion,
        createdAt,
        updatedAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
        timelineEvents: {
          create: item.timeline.map((evt, idx) => ({
            message: evt.message,
            status: evt.status,
            createdAt: new Date(createdAt.getTime() + idx * 10 * 60 * 1000),
          })),
        },
      },
    });
    console.log(`  └─ Incident #${incident.id}: "${incident.title}" [${incident.status} - ${incident.severity}]`);
  }

  console.log("🔥 Successfully seeded 10 Incidents with Timeline Events.");
  console.log("✅ Prisma database seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error during Prisma database seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
