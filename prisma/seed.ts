import { PrismaClient, IncidentStatus, IncidentSeverity, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Prisma seed database script...");

  // 1. Clean existing records (Optional - for idempotent seed runs)
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

  // 2. Create Default Organization
  const organization = await prisma.organization.create({
    data: {
      id: "org-default-001",
      name: "Acme Engineering Corp",
      slug: "acme-corp",
    },
  });
  console.log(`🏢 Created Organization: ${organization.name} (${organization.slug})`);

  // 3. Create Test User with ADMIN Role
  const adminUser = await prisma.user.create({
    data: {
      id: "usr-admin-001",
      name: "Admin Engineer",
      email: "admin@acme.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const adminMember = await prisma.member.create({
    data: {
      id: "mem-admin-001",
      organizationId: organization.id,
      userId: adminUser.id,
      role: Role.ADMIN,
    },
  });
  console.log(`👤 Created Test Admin User: ${adminUser.email} (Role: ${adminMember.role})`);

  // 4. Create Three Sample Projects with Dummy URLs
  const project1 = await prisma.project.create({
    data: {
      id: "proj-api-gateway",
      name: "API Gateway Service",
      slug: "api-gateway",
      url: "https://httpbin.org/status/200",
      apiKey: "upnode_pk_api_gateway_demo_123",
      organizationId: organization.id,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      id: "proj-auth-service",
      name: "Auth Microservice",
      slug: "auth-service",
      url: "https://httpbin.org/status/500",
      apiKey: "upnode_pk_auth_service_demo_456",
      organizationId: organization.id,
    },
  });

  const project3 = await prisma.project.create({
    data: {
      id: "proj-payment-service",
      name: "Payment Processing Service",
      slug: "payment-service",
      url: "https://httpbin.org/status/504",
      apiKey: "upnode_pk_payment_service_demo_789",
      organizationId: organization.id,
    },
  });
  console.log(`🚀 Created 3 Sample Projects: ${project1.name}, ${project2.name}, ${project3.name}`);

  // 5. Create Past & Active Incidents with TimelineEvents
  const incident1 = await prisma.incident.create({
    data: {
      id: "inc-001",
      title: "Auth Service DB Connection Pool Exhaustion",
      description: "Sudden spike in authorization traffic caused PostgreSQL connection pool saturation on the primary cluster node.",
      status: IncidentStatus.RESOLVED,
      severity: IncidentSeverity.HIGH,
      version: 3,
      projectId: project2.id,
      aiRootCause: "PostgreSQL max connection limit (100) reached due to unclosed connection handles in auth middleware under load.",
      aiFixSuggestion: "Implement PgBouncer connection pooling layer and ensure explicit database connection release in Express middleware.",
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      timelineEvents: {
        create: [
          {
            message: "Automated monitor detected elevated 500 error rate on /v1/auth/token endpoint.",
            status: IncidentStatus.INVESTIGATING,
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
          },
          {
            message: "Root cause identified: PostgreSQL max pool connection threshold exceeded.",
            status: IncidentStatus.IDENTIFIED,
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000),
          },
          {
            message: "PgBouncer deployed and pool size adjusted. Error rates normalized.",
            status: IncidentStatus.RESOLVED,
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 + 45 * 60 * 1000),
          },
        ],
      },
    },
  });

  const incident2 = await prisma.incident.create({
    data: {
      id: "inc-002",
      title: "Payment Gateway 504 Timeout Outage",
      description: "HTTP Uptime ping received HTTP status 504 Gateway Timeout. External payment webhooks failing.",
      status: IncidentStatus.INVESTIGATING,
      severity: IncidentSeverity.CRITICAL,
      version: 1,
      projectId: project3.id,
      aiRootCause: "Third-party payment gateway partner experiencing extended API response latencies > 10,000ms.",
      aiFixSuggestion: "Enable circuit breaker to fail-fast and queue payment notifications for retry via BullMQ background worker.",
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      timelineEvents: {
        create: [
          {
            message: "Automated HTTP Uptime Monitor ping failed. Status: 504 Gateway Timeout.",
            status: IncidentStatus.INVESTIGATING,
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          },
          {
            message: "Engineering team notified via Slack alert queue.",
            status: IncidentStatus.INVESTIGATING,
            createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000 + 5 * 60 * 1000),
          },
        ],
      },
    },
  });

  const incident3 = await prisma.incident.create({
    data: {
      id: "inc-003",
      title: "API Gateway Redis Session Eviction Warning",
      description: "High memory utilization on Redis cache cluster causing transient token verification latency.",
      status: IncidentStatus.MONITORING,
      severity: IncidentSeverity.MEDIUM,
      version: 2,
      projectId: project1.id,
      aiRootCause: "Redis memory capacity limit reached causing active session key evictions under volatile-lru policy.",
      aiFixSuggestion: "Increase Redis instance memory allocation to 2GB and update TTL expiration for rate-limit keys.",
      createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
      timelineEvents: {
        create: [
          {
            message: "High latency detected on API Gateway routing middleware.",
            status: IncidentStatus.INVESTIGATING,
            createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
          },
          {
            message: "Redis RAM expanded and cache key TTL strategy updated. Monitoring latency.",
            status: IncidentStatus.MONITORING,
            createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000 + 30 * 60 * 1000),
          },
        ],
      },
    },
  });

  console.log(`🔥 Created Sample Incidents: #${incident1.id} (RESOLVED), #${incident2.id} (INVESTIGATING), #${incident3.id} (MONITORING)`);
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
