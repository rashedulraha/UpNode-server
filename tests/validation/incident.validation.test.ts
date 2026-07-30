import { describe, it, expect } from 'vitest';
import {
  createIncidentSchema,
  updateIncidentSchema,
  incidentParamsSchema,
  incidentQuerySchema,
} from '../../src/modules/incidents/incident.validation';
import { IncidentStatus, IncidentSeverity } from '@prisma/client';

describe('Incident Validation Schemas', () => {
  describe('createIncidentSchema', () => {
    it('should validate a correct payload', () => {
      const payload = {
        title: 'API Outage',
        description: 'Users unable to login',
        projectId: 'proj_123',
      };
      const result = createIncidentSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(IncidentStatus.INVESTIGATING);
        expect(result.data.severity).toBe(IncidentSeverity.MEDIUM);
      }
    });

    it('should reject missing required fields', () => {
      const result = createIncidentSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('updateIncidentSchema', () => {
    it('should validate correct partial payload with expectedVersion', () => {
      const payload = {
        status: IncidentStatus.IDENTIFIED,
        expectedVersion: 2,
      };
      const result = updateIncidentSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('should reject if expectedVersion is missing', () => {
      const payload = { status: IncidentStatus.IDENTIFIED };
      const result = updateIncidentSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('should reject invalid enum values', () => {
      const payload = { status: 'UNKNOWN_STATUS', expectedVersion: 1 };
      const result = updateIncidentSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe('incidentParamsSchema', () => {
    it('should validate correct id', () => {
      const result = incidentParamsSchema.safeParse({ id: 'inc_123' });
      expect(result.success).toBe(true);
    });

    it('should reject empty id', () => {
      const result = incidentParamsSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('incidentQuerySchema', () => {
    it('should parse and coerce query params with defaults', () => {
      const result = incidentQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
        expect(result.data.offset).toBe(0);
      }
    });

    it('should parse valid filters', () => {
      const result = incidentQuerySchema.safeParse({
        status: IncidentStatus.RESOLVED,
        limit: '10',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe(IncidentStatus.RESOLVED);
        expect(result.data.limit).toBe(10);
      }
    });
  });
});
