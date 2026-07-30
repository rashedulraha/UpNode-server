import { vi, beforeEach } from 'vitest';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { Worker } from 'bullmq';

// 1. Mock Prisma Client
export const prismaMock = mockDeep<PrismaClient>();

vi.mock('../src/lib/prisma', () => ({
  prisma: prismaMock,
}));

// 2. Mock Redis Clients
export const redisMock = mockDeep<Redis>();
export const redisPublisherMock = mockDeep<Redis>();
export const redisSubscriberMock = mockDeep<Redis>();

vi.mock('../src/lib/redis', () => ({
  redis: redisMock,
  redisPublisher: redisPublisherMock,
  createRedisSubscriber: vi.fn(() => redisSubscriberMock),
  redisConnectionOptions: {},
}));

// 3. Mock BullMQ Worker
export const bullmqWorkerMock = mockDeep<Worker>();

vi.mock('bullmq', () => ({
  Worker: vi.fn(() => bullmqWorkerMock),
  Queue: vi.fn(),
}));

// 4. Reset all mocks before each test
beforeEach(() => {
  mockReset(prismaMock);
  mockReset(redisMock);
  mockReset(redisPublisherMock);
  mockReset(redisSubscriberMock);
  mockReset(bullmqWorkerMock);
});

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://fake:password@localhost:5432/test';
process.env.BETTER_AUTH_SECRET = 'test-secret';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
