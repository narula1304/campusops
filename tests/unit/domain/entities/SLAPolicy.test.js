// tests/unit/domain/entities/SLAPolicy.test.js
//
// Pure domain unit tests — no database, no framework.

const {
    SLAPolicy,
    CriticalSLA,
    HighSLA,
    MediumSLA,
    LowSLA,
    SLAFactory
  } = require('../../../../src/domain/entities/SLAPolicy')
  const { InvalidPriorityError } = require('../../../../src/domain/errors')
  
  describe('SLAPolicy abstract base', () => {
    test('cannot be instantiated directly', () => {
      expect(() => new SLAPolicy({ priority: 'HIGH', windowHours: 4 }))
        .toThrow(TypeError)
    })
  })
  
  describe('getDeadline / attachTo', () => {
    test('CriticalSLA deadline is createdAt + 2 hours', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = new CriticalSLA()
      expect(sla.getDeadline(createdAt).toISOString()).toBe('2025-06-07T12:00:00.000Z')
    })
  
    test('HighSLA deadline is createdAt + 4 hours', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = new HighSLA()
      expect(sla.getDeadline(createdAt).toISOString()).toBe('2025-06-07T14:00:00.000Z')
    })
  
    test('MediumSLA deadline is createdAt + 8 hours', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = new MediumSLA()
      expect(sla.getDeadline(createdAt).toISOString()).toBe('2025-06-07T18:00:00.000Z')
    })
  
    test('LowSLA deadline is createdAt + 24 hours', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = new LowSLA()
      expect(sla.getDeadline(createdAt).toISOString()).toBe('2025-06-08T10:00:00.000Z')
    })
  
    test('attachTo() stores the computed deadline on this.deadlineAt', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = new CriticalSLA()
      expect(sla.deadlineAt).toBeNull()
  
      sla.attachTo(createdAt)
  
      expect(sla.deadlineAt.toISOString()).toBe('2025-06-07T12:00:00.000Z')
    })
  
    test('attachTo() returns `this` for chaining', () => {
      const sla = new CriticalSLA()
      const result = sla.attachTo(new Date())
      expect(result).toBe(sla)
    })
  })
  
  describe('isBreached', () => {
    test('returns false when deadlineAt was never attached', () => {
      const sla = new HighSLA()
      expect(sla.isBreached(new Date())).toBe(false)
    })
  
    test('returns false when now is before the attached deadline', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = new HighSLA().attachTo(createdAt)
      const beforeDeadline = new Date('2025-06-07T13:00:00.000Z')
      expect(sla.isBreached(beforeDeadline)).toBe(false)
    })
  
    test('returns true when now is past the attached deadline', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = new HighSLA().attachTo(createdAt)
      const afterDeadline = new Date('2025-06-07T15:00:00.000Z')
      expect(sla.isBreached(afterDeadline)).toBe(true)
    })
  })
  
  describe('getRemainingMs', () => {
    test('returns positive remaining time before an attached deadline', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = new HighSLA().attachTo(createdAt)
      const oneHourIn = new Date('2025-06-07T11:00:00.000Z')
  
      // deadline is 14:00, now is 11:00 -> 3 hours remaining
      expect(sla.getRemainingMs(oneHourIn)).toBe(3 * 60 * 60 * 1000)
    })
  
    test('returns 0 once the deadline has passed (never negative)', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = new HighSLA().attachTo(createdAt)
      const wayAfter = new Date('2025-06-07T20:00:00.000Z')
  
      expect(sla.getRemainingMs(wayAfter)).toBe(0)
    })
  })
  
  describe('getEscalationTarget', () => {
    test('CriticalSLA escalates to DEAN', () => {
      expect(new CriticalSLA().getEscalationTarget()).toBe('DEAN')
    })
  
    test('HighSLA, MediumSLA, LowSLA all escalate to HOD', () => {
      expect(new HighSLA().getEscalationTarget()).toBe('HOD')
      expect(new MediumSLA().getEscalationTarget()).toBe('HOD')
      expect(new LowSLA().getEscalationTarget()).toBe('HOD')
    })
  })
  
  describe('SLAFactory.create', () => {
    test('creates the correct subclass for each priority', () => {
      expect(SLAFactory.create('CRITICAL')).toBeInstanceOf(CriticalSLA)
      expect(SLAFactory.create('HIGH')).toBeInstanceOf(HighSLA)
      expect(SLAFactory.create('MEDIUM')).toBeInstanceOf(MediumSLA)
      expect(SLAFactory.create('LOW')).toBeInstanceOf(LowSLA)
    })
  
    test('with createdAt provided, deadlineAt is already attached', () => {
      const createdAt = new Date('2025-06-07T10:00:00.000Z')
      const sla = SLAFactory.create('CRITICAL', createdAt)
  
      expect(sla.deadlineAt).not.toBeNull()
      expect(sla.deadlineAt.toISOString()).toBe('2025-06-07T12:00:00.000Z')
    })
  
    test('without createdAt, deadlineAt remains null', () => {
      const sla = SLAFactory.create('HIGH')
      expect(sla.deadlineAt).toBeNull()
    })
  
    test('throws InvalidPriorityError for an unknown priority', () => {
      expect(() => SLAFactory.create('INVALID')).toThrow(InvalidPriorityError)
    })
  })
  
  describe('SLAFactory.fromRow', () => {
    test('reconstructs an SLA instance with exact fields from a Prisma row', () => {
      const slaDeadlineAt = new Date('2025-06-07T14:00:00.000Z')
      const slaEscalatedAt = new Date('2025-06-07T14:05:00.000Z')
  
      const row = {
        priority: 'HIGH',
        slaDeadlineAt,
        slaIsEscalated: true,
        slaEscalatedAt
      }
  
      const sla = SLAFactory.fromRow(row)
  
      expect(sla).toBeInstanceOf(HighSLA)
      expect(sla.deadlineAt).toBe(slaDeadlineAt)
      expect(sla.isEscalated).toBe(true)
      expect(sla.escalatedAt).toBe(slaEscalatedAt)
    })
  
    test('defaults isEscalated to false and escalatedAt to null when absent', () => {
      const row = {
        priority: 'LOW',
        slaDeadlineAt: new Date('2025-06-08T10:00:00.000Z')
      }
  
      const sla = SLAFactory.fromRow(row)
  
      expect(sla).toBeInstanceOf(LowSLA)
      expect(sla.isEscalated).toBe(false)
      expect(sla.escalatedAt).toBeNull()
    })
  
    test('throws InvalidPriorityError for an unknown priority in the row', () => {
      expect(() => SLAFactory.fromRow({ priority: 'NOT_REAL', slaDeadlineAt: new Date() }))
        .toThrow(InvalidPriorityError)
    })
  })