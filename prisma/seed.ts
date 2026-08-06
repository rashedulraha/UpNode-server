import { PrismaClient, UserRole } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import dotenv from "dotenv";
import { auth } from "../src/lib/auth.js";

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is missing.");
}

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Starting UpNode database cleanup and seeding...");

  // 1. Delete all existing data from database
  await prisma.timelineEvent.deleteMany({});
  await prisma.incident.deleteMany({});
  await prisma.pingMetric.deleteMany({});
  await prisma.statusSubscriber.deleteMany({});
  await prisma.webhook.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.member.deleteMany({});
  await prisma.userNotificationPreference.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.account.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.organization.deleteMany({});
  await prisma.verification.deleteMany({});

  console.log("🧹 Successfully deleted all existing data and users from the database.");

  // 2. Create primary Admin user
  const adminEmail = "rashedulraha.bd@gmail.com";
  const adminPassword = "9B3BcOzRHBE8iTc";

  try {
    await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: adminPassword,
        name: "Admin User",
      },
    });
  } catch (err: any) {
    console.log("Sign up response:", err?.message || err);
  }

  const adminUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (adminUser) {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: {
        role: UserRole.ADMIN,
        emailVerified: true,
      },
    });

    console.log("✨ Primary ADMIN user created successfully:");
    console.log(`- Email: ${adminEmail}`);
    console.log(`- Password: ${adminPassword}`);
    console.log(`- Role: ${UserRole.ADMIN}`);
  }

  console.log("✅ Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
