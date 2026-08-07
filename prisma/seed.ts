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

  // 2. Create Master SUPER_ADMIN user
  const superAdminEmail = "rashedulraha.bd@gmail.com";
  const superAdminPassword = "9B3BcOzRHBE8iTc";

  try {
    await auth.api.signUpEmail({
      body: {
        email: superAdminEmail,
        password: superAdminPassword,
        name: "Master Super Admin",
      },
    });
  } catch (err: any) {
    console.log("Sign up response:", err?.message || err);
  }

  const superAdminUser = await prisma.user.findUnique({
    where: { email: superAdminEmail },
  });

  if (superAdminUser) {
    await prisma.user.update({
      where: { id: superAdminUser.id },
      data: {
        role: UserRole.SUPER_ADMIN,
        emailVerified: true,
      },
    });

    console.log("✨ Master SUPER_ADMIN user created successfully:");
    console.log(`- Email: ${superAdminEmail}`);
    console.log(`- Password: ${superAdminPassword}`);
    console.log(`- Role: ${UserRole.SUPER_ADMIN}`);
  }

  // Ensure no other existing users in the database have SUPER_ADMIN role
  await prisma.user.updateMany({
    where: {
      email: { not: superAdminEmail },
      role: UserRole.SUPER_ADMIN,
    },
    data: {
      role: UserRole.ADMIN,
    },
  });

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
