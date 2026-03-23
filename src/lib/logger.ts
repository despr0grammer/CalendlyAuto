import { EventEmitter } from 'events'

const MAX_LOGS = 100

class BotLogger extends EventEmitter {
  private logs: string[] = []

  log(msg: string) {
    const ts = new Date().toLocaleTimeString('es-AR', { hour12: false })
    const line = `[${ts}] ${msg}`
    this.logs.push(line)
    if (this.logs.length > MAX_LOGS) this.logs.shift()
    this.emit('log', line)
  }

  getLogs(): string[] {
    return [...this.logs]
  }

  clear() {
    this.logs = []
    this.emit('log', '[log limpiado]')
  }
}

const globalForLogger = globalThis as unknown as { botLogger: BotLogger | undefined }

export const logger = globalForLogger.botLogger ?? new BotLogger()
if (process.env.NODE_ENV !== 'production') globalForLogger.botLogger = logger
