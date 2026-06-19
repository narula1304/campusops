// src/domain/decorators/RealTimeDecorator.js
//
// Decorator — wraps another notifier and adds Socket.IO real-time delivery.
// Emits to the per-user room `user:{user.id}` so only that client receives it.
// No framework imports — `io` is injected via constructor (Dependency Inversion).

const BaseNotification = require('./BaseNotification')

class RealTimeDecorator extends BaseNotification {
  /**
   * @param {BaseNotification} wrapped  - The next notifier in the chain
   * @param {object}           io       - Socket.IO Server instance (injected)
   */
  constructor(wrapped, io) {
    super()
    this.wrapped = wrapped
    this.io = io
  }

  /**
   * Emits the event to the user's private Socket.IO room, then delegates
   * to the wrapped notifier so the rest of the decorator chain runs.
   *
   * @param {object} user
   * @param {string} event
   * @param {object} payload
   * @returns {Promise<void>}
   */
  async send(user, event, payload) {
    this.io.to(`user:${user.id}`).emit(event, payload)
    return this.wrapped.send(user, event, payload)
  }
}

module.exports = RealTimeDecorator
