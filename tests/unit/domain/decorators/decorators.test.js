// tests/unit/domain/decorators/decorators.test.js
//
// Pure unit tests — io, mailer, and smsService are lightweight jest.fn() fakes.
// No real Socket.IO, Nodemailer, or SMS SDK is imported or instantiated.
// Tests focus on the decorator chain logic: guard conditions, delegation order,
// and NotificationService stack composition.

const BaseNotification = require('../../../../src/domain/decorators/BaseNotification')
const RealTimeDecorator = require('../../../../src/domain/decorators/RealTimeDecorator')
const EmailDecorator = require('../../../../src/domain/decorators/EmailDecorator')
const SMSDecorator = require('../../../../src/domain/decorators/SMSDecorator')
const NotificationService = require('../../../../src/domain/decorators/NotificationService')

// ── Fake infrastructure builders ─────────────────────────────────────────────

function makeIo() {
    const emitFn = jest.fn()
    const toFn = jest.fn().mockReturnValue({ emit: emitFn })
    return { to: toFn, _emit: emitFn }
}

function makeMailer() {
    return { sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-test-1' }) }
}

function makeSmsService() {
    return { send: jest.fn().mockResolvedValue({ sid: 'sms-test-1' }) }
}

function makeWrapped() {
    // Minimal stub of the inner notifier so we can assert delegation
    return { send: jest.fn().mockResolvedValue(undefined) }
}

// ── User and payload fixture builders ────────────────────────────────────────

function makeUser(overrides = {}) {
    return {
        id: 'user-42',
        email: 'student@campus.edu',
        phone: '+919876543210',
        prefRealtime: true,
        prefEmail: true,
        prefSms: false,
        ...overrides,
    }
}

function makePayload(overrides = {}) {
    return {
        priority: 'HIGH',
        incident: {
            id: 'incident-1',
            incidentNumber: 'INC-2025-000001',
        },
        ...overrides,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BaseNotification
// ─────────────────────────────────────────────────────────────────────────────

describe('BaseNotification', () => {
    test('send() resolves without throwing', async () => {
        const base = new BaseNotification()
        await expect(
            base.send(makeUser(), 'INCIDENT_CREATED', makePayload())
        ).resolves.toBeUndefined()
    })

    test('send() is callable multiple times and stays a no-op', async () => {
        const base = new BaseNotification()
        const user = makeUser()

        await base.send(user, 'INCIDENT_CREATED', makePayload())
        await base.send(user, 'INCIDENT_RESOLVED', makePayload())

        // No assertion needed beyond "did not throw" — resolves proves no-op
        expect(true).toBe(true)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// RealTimeDecorator
// ─────────────────────────────────────────────────────────────────────────────

describe('RealTimeDecorator', () => {
    test('emits event to user:{user.id} room when send() is called', async () => {
        const io = makeIo()
        const wrapped = makeWrapped()
        const dec = new RealTimeDecorator(wrapped, io)
        const user = makeUser()
        const payload = makePayload()

        await dec.send(user, 'INCIDENT_ASSIGNED', payload)

        expect(io.to).toHaveBeenCalledWith(`user:${user.id}`)
        expect(io._emit).toHaveBeenCalledWith('INCIDENT_ASSIGNED', payload)
    })

    test('calls wrapped.send() after emitting — chain continues', async () => {
        const io = makeIo()
        const wrapped = makeWrapped()
        const dec = new RealTimeDecorator(wrapped, io)
        const user = makeUser()
        const payload = makePayload()

        await dec.send(user, 'INCIDENT_ASSIGNED', payload)

        expect(wrapped.send).toHaveBeenCalledTimes(1)
        expect(wrapped.send).toHaveBeenCalledWith(user, 'INCIDENT_ASSIGNED', payload)
    })

    test('emit is called before wrapped.send() (correct delegation order)', async () => {
        const callOrder = []
        const io = {
            to: jest.fn().mockReturnValue({
                emit: jest.fn(() => callOrder.push('emit'))
            })
        }
        const wrapped = { send: jest.fn(() => { callOrder.push('wrapped'); return Promise.resolve() }) }
        const dec = new RealTimeDecorator(wrapped, io)

        await dec.send(makeUser(), 'INCIDENT_ASSIGNED', makePayload())

        expect(callOrder).toEqual(['emit', 'wrapped'])
    })

    test('emits to the correct room for each user', async () => {
        const io = makeIo()
        const dec = new RealTimeDecorator(makeWrapped(), io)

        await dec.send(makeUser({ id: 'user-1' }), 'INCIDENT_RESOLVED', makePayload())
        await dec.send(makeUser({ id: 'user-2' }), 'INCIDENT_RESOLVED', makePayload())

        const rooms = io.to.mock.calls.map(c => c[0])
        expect(rooms).toContain('user:user-1')
        expect(rooms).toContain('user:user-2')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// EmailDecorator
// ─────────────────────────────────────────────────────────────────────────────

describe('EmailDecorator', () => {
    // Email-worthy events (must all trigger email when prefs allow)
    const emailWorthyEvents = [
        'INCIDENT_ASSIGNED',
        'INCIDENT_RESOLVED',
        'INCIDENT_ESCALATED',
        'INCIDENT_REOPENED_BY_FEEDBACK',
        'STAFF_UNDER_REVIEW',
    ]

    test.each(emailWorthyEvents)(
        'sends email when user.prefEmail is true and event is "%s"',
        async (event) => {
            const mailer = makeMailer()
            const wrapped = makeWrapped()
            const dec = new EmailDecorator(wrapped, mailer)

            await dec.send(makeUser({ prefEmail: true }), event, makePayload())

            expect(mailer.sendMail).toHaveBeenCalledTimes(1)
            expect(mailer.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({ to: 'student@campus.edu' })
            )
        }
    )

    test('does NOT send email when user.prefEmail is false', async () => {
        const mailer = makeMailer()
        const wrapped = makeWrapped()
        const dec = new EmailDecorator(wrapped, mailer)

        await dec.send(makeUser({ prefEmail: false }), 'INCIDENT_ASSIGNED', makePayload())

        expect(mailer.sendMail).not.toHaveBeenCalled()
    })

    test('does NOT send email for events not in the email-worthy list (INCIDENT_CREATED)', async () => {
        const mailer = makeMailer()
        const wrapped = makeWrapped()
        const dec = new EmailDecorator(wrapped, mailer)

        await dec.send(makeUser({ prefEmail: true }), 'INCIDENT_CREATED', makePayload())

        expect(mailer.sendMail).not.toHaveBeenCalled()
    })

    test('does NOT send email for events not in the email-worthy list (INCIDENT_REASSIGNED)', async () => {
        const mailer = makeMailer()
        const dec = new EmailDecorator(makeWrapped(), mailer)

        await dec.send(makeUser({ prefEmail: true }), 'INCIDENT_REASSIGNED', makePayload())

        expect(mailer.sendMail).not.toHaveBeenCalled()
    })

    test('still calls wrapped.send() when email was sent', async () => {
        const wrapped = makeWrapped()
        const dec = new EmailDecorator(wrapped, makeMailer())
        const user = makeUser({ prefEmail: true })
        const payload = makePayload()

        await dec.send(user, 'INCIDENT_ASSIGNED', payload)

        expect(wrapped.send).toHaveBeenCalledWith(user, 'INCIDENT_ASSIGNED', payload)
    })

    test('still calls wrapped.send() when email was NOT sent (opted out)', async () => {
        const wrapped = makeWrapped()
        const dec = new EmailDecorator(wrapped, makeMailer())
        const user = makeUser({ prefEmail: false })
        const payload = makePayload()

        await dec.send(user, 'INCIDENT_ASSIGNED', payload)

        expect(wrapped.send).toHaveBeenCalledWith(user, 'INCIDENT_ASSIGNED', payload)
    })

    test('still calls wrapped.send() when email was NOT sent (non-worthy event)', async () => {
        const wrapped = makeWrapped()
        const dec = new EmailDecorator(wrapped, makeMailer())
        const user = makeUser({ prefEmail: true })
        const payload = makePayload()

        await dec.send(user, 'INCIDENT_CREATED', payload)

        expect(wrapped.send).toHaveBeenCalledWith(user, 'INCIDENT_CREATED', payload)
    })

    test('treats undefined prefEmail (not explicitly false) as opted-in', async () => {
        const mailer = makeMailer()
        const dec = new EmailDecorator(makeWrapped(), mailer)
        const user = makeUser({ prefEmail: undefined })

        await dec.send(user, 'INCIDENT_ASSIGNED', makePayload())

        // undefined !== false, so email should be sent
        expect(mailer.sendMail).toHaveBeenCalledTimes(1)
    })

    test('email subject and recipient are correct for INCIDENT_ASSIGNED', async () => {
        const mailer = makeMailer()
        const dec = new EmailDecorator(makeWrapped(), mailer)

        await dec.send(makeUser({ prefEmail: true }), 'INCIDENT_ASSIGNED', makePayload())

        const { to, subject } = mailer.sendMail.mock.calls[0][0]
        expect(to).toBe('student@campus.edu')
        expect(subject).toMatch(/INC-2025-000001/)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// SMSDecorator
// ─────────────────────────────────────────────────────────────────────────────

describe('SMSDecorator', () => {
    test('sends SMS when payload.priority === "CRITICAL" regardless of user.prefSms', async () => {
        const sms = makeSmsService()
        const dec = new SMSDecorator(makeWrapped(), sms)
        const user = makeUser({ prefSms: false, phone: '+919876543210' })
        const payload = makePayload({ priority: 'CRITICAL' })

        await dec.send(user, 'INCIDENT_ESCALATED', payload)

        expect(sms.send).toHaveBeenCalledTimes(1)
        expect(sms.send).toHaveBeenCalledWith(user.phone, expect.any(String))
    })

    test('sends SMS when event === "PANIC_ALERT" regardless of user.prefSms', async () => {
        const sms = makeSmsService()
        const dec = new SMSDecorator(makeWrapped(), sms)
        const user = makeUser({ prefSms: false, phone: '+919876543210' })
        const payload = makePayload({ priority: 'LOW' })

        await dec.send(user, 'PANIC_ALERT', payload)

        expect(sms.send).toHaveBeenCalledTimes(1)
        expect(sms.send).toHaveBeenCalledWith(user.phone, expect.any(String))
    })

    test('does NOT send SMS for HIGH priority non-panic events', async () => {
        const sms = makeSmsService()
        const dec = new SMSDecorator(makeWrapped(), sms)

        await dec.send(
            makeUser({ prefSms: true }),
            'INCIDENT_ASSIGNED',
            makePayload({ priority: 'HIGH' })
        )

        expect(sms.send).not.toHaveBeenCalled()
    })

    test('does NOT send SMS for MEDIUM priority non-panic events', async () => {
        const sms = makeSmsService()
        const dec = new SMSDecorator(makeWrapped(), sms)

        await dec.send(
            makeUser({ prefSms: true }),
            'INCIDENT_RESOLVED',
            makePayload({ priority: 'MEDIUM' })
        )

        expect(sms.send).not.toHaveBeenCalled()
    })

    test('does NOT send SMS for LOW priority non-panic events', async () => {
        const sms = makeSmsService()
        const dec = new SMSDecorator(makeWrapped(), sms)

        await dec.send(
            makeUser({ prefSms: true }),
            'INCIDENT_CREATED',
            makePayload({ priority: 'LOW' })
        )

        expect(sms.send).not.toHaveBeenCalled()
    })

    test('still calls wrapped.send() when SMS was sent', async () => {
        const wrapped = makeWrapped()
        const dec = new SMSDecorator(wrapped, makeSmsService())
        const user = makeUser()
        const payload = makePayload({ priority: 'CRITICAL' })

        await dec.send(user, 'INCIDENT_ESCALATED', payload)

        expect(wrapped.send).toHaveBeenCalledWith(user, 'INCIDENT_ESCALATED', payload)
    })

    test('still calls wrapped.send() when SMS was NOT sent', async () => {
        const wrapped = makeWrapped()
        const dec = new SMSDecorator(wrapped, makeSmsService())
        const user = makeUser()
        const payload = makePayload({ priority: 'LOW' })

        await dec.send(user, 'INCIDENT_CREATED', payload)

        expect(wrapped.send).toHaveBeenCalledWith(user, 'INCIDENT_CREATED', payload)
    })

    test('SMS message contains PANIC ALERT text for PANIC_ALERT event', async () => {
        const sms = makeSmsService()
        const dec = new SMSDecorator(makeWrapped(), sms)

        await dec.send(makeUser(), 'PANIC_ALERT', makePayload())

        const message = sms.send.mock.calls[0][1]
        expect(message).toMatch(/PANIC/i)
    })

    test('SMS message contains incident number for CRITICAL incidents', async () => {
        const sms = makeSmsService()
        const dec = new SMSDecorator(makeWrapped(), sms)

        await dec.send(
            makeUser(),
            'INCIDENT_ESCALATED',
            makePayload({ priority: 'CRITICAL', incident: { incidentNumber: 'INC-2025-000099' } })
        )

        const message = sms.send.mock.calls[0][1]
        expect(message).toMatch(/INC-2025-000099/)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// NotificationService
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificationService — buildNotifier', () => {
    test('returns a BaseNotification leaf when user has no preferences', async () => {
        const svc = new NotificationService(makeIo(), makeMailer(), makeSmsService())
        const notifier = svc.buildNotifier(makeUser({ prefRealtime: false, prefEmail: false, prefSms: false }))

        // Only the base — it should resolve silently
        await expect(
            notifier.send(makeUser(), 'INCIDENT_CREATED', makePayload())
        ).resolves.toBeUndefined()
    })

    test('includes RealTimeDecorator when user.prefRealtime is true', async () => {
        const io = makeIo()
        const svc = new NotificationService(io, makeMailer(), makeSmsService())
        const user = makeUser({ prefRealtime: true, prefEmail: false, prefSms: false })

        await svc.buildNotifier(user).send(user, 'INCIDENT_ASSIGNED', makePayload())

        expect(io.to).toHaveBeenCalledWith(`user:${user.id}`)
    })

    test('does NOT include RealTimeDecorator when user.prefRealtime is false', async () => {
        const io = makeIo()
        const svc = new NotificationService(io, makeMailer(), makeSmsService())
        const user = makeUser({ prefRealtime: false, prefEmail: false, prefSms: false })

        await svc.buildNotifier(user).send(user, 'INCIDENT_ASSIGNED', makePayload())

        expect(io.to).not.toHaveBeenCalled()
    })

    test('includes EmailDecorator when user.prefEmail is true', async () => {
        const mailer = makeMailer()
        const svc = new NotificationService(makeIo(), mailer, makeSmsService())
        const user = makeUser({ prefRealtime: false, prefEmail: true, prefSms: false })

        await svc.buildNotifier(user).send(user, 'INCIDENT_ASSIGNED', makePayload())

        expect(mailer.sendMail).toHaveBeenCalledTimes(1)
    })

    test('does NOT include EmailDecorator when user.prefEmail is false', async () => {
        const mailer = makeMailer()
        const svc = new NotificationService(makeIo(), mailer, makeSmsService())
        const user = makeUser({ prefRealtime: false, prefEmail: false, prefSms: false })

        await svc.buildNotifier(user).send(user, 'INCIDENT_ASSIGNED', makePayload())

        expect(mailer.sendMail).not.toHaveBeenCalled()
    })

    test('includes SMSDecorator when isCritical = true regardless of user.prefSms', async () => {
        const sms = makeSmsService()
        const svc = new NotificationService(makeIo(), makeMailer(), sms)
        const user = makeUser({ prefRealtime: false, prefEmail: false, prefSms: false })

        // isCritical override = true, payload is also CRITICAL so SMS fires
        await svc.buildNotifier(user, true).send(user, 'INCIDENT_ESCALATED', makePayload({ priority: 'CRITICAL' }))

        expect(sms.send).toHaveBeenCalledTimes(1)
    })

    test('includes SMSDecorator when user.prefSms is true', async () => {
        const sms = makeSmsService()
        const svc = new NotificationService(makeIo(), makeMailer(), sms)
        const user = makeUser({ prefRealtime: false, prefEmail: false, prefSms: true })

        // prefSms adds the decorator; guard inside SMSDecorator.send() requires CRITICAL/PANIC_ALERT
        await svc.buildNotifier(user).send(user, 'INCIDENT_ESCALATED', makePayload({ priority: 'CRITICAL' }))

        expect(sms.send).toHaveBeenCalledTimes(1)
    })

    test('does NOT include SMSDecorator when prefSms false and isCritical false', async () => {
        const sms = makeSmsService()
        const svc = new NotificationService(makeIo(), makeMailer(), sms)
        const user = makeUser({ prefRealtime: false, prefEmail: false, prefSms: false })

        await svc.buildNotifier(user, false).send(user, 'INCIDENT_ASSIGNED', makePayload({ priority: 'CRITICAL' }))

        // Decorator was never added, so send() was never reachable
        expect(sms.send).not.toHaveBeenCalled()
    })

    test('stacks all three decorators when user has all preferences on', async () => {
        const io = makeIo()
        const mailer = makeMailer()
        const sms = makeSmsService()
        const svc = new NotificationService(io, mailer, sms)
        const user = makeUser({ prefRealtime: true, prefEmail: true, prefSms: true })
        const payload = makePayload({ priority: 'CRITICAL' })

        await svc.buildNotifier(user).send(user, 'INCIDENT_ASSIGNED', payload)

        // RealTimeDecorator fired
        expect(io.to).toHaveBeenCalledWith(`user:${user.id}`)
        // EmailDecorator fired (INCIDENT_ASSIGNED is email-worthy)
        expect(mailer.sendMail).toHaveBeenCalledTimes(1)
        // SMSDecorator fired (CRITICAL priority)
        expect(sms.send).toHaveBeenCalledTimes(1)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// NotificationService — notify()
// ─────────────────────────────────────────────────────────────────────────────

describe('NotificationService — notify()', () => {
    test('calls send() on the built stack with correct user, event, payload', async () => {
        const io = makeIo()
        const mailer = makeMailer()
        const sms = makeSmsService()
        const svc = new NotificationService(io, mailer, sms)
        const user = makeUser({ prefRealtime: true, prefEmail: false, prefSms: false })
        const payload = makePayload()

        await svc.notify(user, 'INCIDENT_ASSIGNED', payload)

        // RealTimeDecorator should have fired for this user
        expect(io.to).toHaveBeenCalledWith(`user:${user.id}`)
        expect(io._emit).toHaveBeenCalledWith('INCIDENT_ASSIGNED', payload)
    })

    test('auto-enables SMSDecorator for CRITICAL priority payload', async () => {
        const sms = makeSmsService()
        const svc = new NotificationService(makeIo(), makeMailer(), sms)
        const user = makeUser({ prefRealtime: false, prefEmail: false, prefSms: false })
        const payload = makePayload({ priority: 'CRITICAL' })

        await svc.notify(user, 'INCIDENT_ESCALATED', payload)

        // notify() detects isCritical → adds SMSDecorator → guard passes → SMS sent
        expect(sms.send).toHaveBeenCalledTimes(1)
    })

    test('auto-enables SMSDecorator for PANIC_ALERT event', async () => {
        const sms = makeSmsService()
        const svc = new NotificationService(makeIo(), makeMailer(), sms)
        const user = makeUser({ prefRealtime: false, prefEmail: false, prefSms: false })

        await svc.notify(user, 'PANIC_ALERT', makePayload({ priority: 'LOW' }))

        expect(sms.send).toHaveBeenCalledTimes(1)
    })

    test('does NOT auto-enable SMSDecorator for HIGH priority non-panic event', async () => {
        const sms = makeSmsService()
        const svc = new NotificationService(makeIo(), makeMailer(), sms)
        const user = makeUser({ prefRealtime: false, prefEmail: false, prefSms: false })

        await svc.notify(user, 'INCIDENT_ASSIGNED', makePayload({ priority: 'HIGH' }))

        expect(sms.send).not.toHaveBeenCalled()
    })

    test('resolves without throwing when all prefs are off and event is non-critical', async () => {
        const svc = new NotificationService(makeIo(), makeMailer(), makeSmsService())
        const user = makeUser({ prefRealtime: false, prefEmail: false, prefSms: false })

        await expect(
            svc.notify(user, 'INCIDENT_CREATED', makePayload({ priority: 'LOW' }))
        ).resolves.toBeUndefined()
    })
})
