import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IncidentService, INCIDENT_CHANNEL } from '../../src/modules/incidents/incident.service';
import { prismaMock, redisPublisherMock } from '../setup';
import { NotFoundError, OptimisticLockError } from '../../src/middlewares/error.middleware';
import * as alertQueue from '../../src/queues/alertQueue';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';
describe('IncidentService', () => {
    let incidentService;
    beforeEach(() => {
        incidentService = new IncidentService();
        vi.spyOn(alertQueue, 'addIncidentAlertJob').mockResolvedValue(undefined);
    });
    describe('createIncident', () => {
        it('should throw NotFoundError if project does not belong to organization', async () => {
            prismaMock.project.findFirst.mockResolvedValue(null);
            await expect(incidentService.createIncident({ title: 'Test', description: 'Test', projectId: 'p_1' }, 'org_1')).rejects.toThrow(NotFoundError);
        });
        it('should create an incident and trigger background jobs', async () => {
            prismaMock.project.findFirst.mockResolvedValue({ id: 'p_1' });
            const mockIncident = {
                id: 'inc_1',
                title: 'Test',
                description: 'Desc',
                status: IncidentStatus.INVESTIGATING,
                severity: IncidentSeverity.MEDIUM,
                projectId: 'p_1',
                version: 1,
                createdAt: new Date(),
            };
            prismaMock.$transaction.mockResolvedValue(mockIncident);
            const result = await incidentService.createIncident({ title: 'Test', description: 'Desc', projectId: 'p_1' }, 'org_1');
            expect(result).toEqual(mockIncident);
            expect(alertQueue.addIncidentAlertJob).toHaveBeenCalled();
            expect(redisPublisherMock.publish).toHaveBeenCalledWith(INCIDENT_CHANNEL, expect.stringContaining('INCIDENT_CREATED'));
        });
    });
    describe('updateIncident', () => {
        it('should throw NotFoundError if incident does not exist in org', async () => {
            prismaMock.incident.findFirst.mockResolvedValue(null);
            await expect(incidentService.updateIncident('inc_1', { expectedVersion: 1 }, 'org_1')).rejects.toThrow(NotFoundError);
        });
        it('should throw OptimisticLockError on version mismatch inside transaction', async () => {
            prismaMock.incident.findFirst.mockResolvedValue({ id: 'inc_1', status: IncidentStatus.INVESTIGATING });
            // We need to mock the implementation of $transaction to simulate the rollback/throw
            prismaMock.$transaction.mockImplementation(async (callback) => {
                // Mock tx.incident.updateMany to return count: 0 (mismatch)
                const mockTx = {
                    incident: {
                        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
                        findUnique: vi.fn(),
                    },
                    timelineEvent: {
                        create: vi.fn(),
                    },
                };
                return callback(mockTx);
            });
            await expect(incidentService.updateIncident('inc_1', { expectedVersion: 1 }, 'org_1')).rejects.toThrow(OptimisticLockError);
        });
    });
});
