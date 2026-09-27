import Database from "better-sqlite3"

export interface DeviceRecord {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number
}

export interface DeviceStore {
  create(record: DeviceRecord): void
  get(id: string): DeviceRecord | null
  list(): DeviceRecord[]
  remove(id: string): void
  touch(id: string, now?: number): void
  close(): void
}

export function createSqliteStore(file: string): DeviceStore {
  const db = new Database(file)
  db.pragma("journal_mode = WAL")
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_used_at INTEGER NOT NULL
    )
  `)
  // Push subscriptions belonged to the pre-re-architecture PWA plan.
  db.exec("DROP TABLE IF EXISTS push_subscriptions")

  const createStatement = db.prepare(`
    INSERT INTO devices (id, name, created_at, last_used_at)
    VALUES (@id, @name, @createdAt, @lastUsedAt)
  `)
  const getStatement = db.prepare(`
    SELECT id, name, created_at AS createdAt, last_used_at AS lastUsedAt
    FROM devices
    WHERE id = ?
  `)
  const listStatement = db.prepare(`
    SELECT id, name, created_at AS createdAt, last_used_at AS lastUsedAt
    FROM devices
    ORDER BY created_at DESC
  `)
  const removeStatement = db.prepare("DELETE FROM devices WHERE id = ?")
  const touchStatement = db.prepare("UPDATE devices SET last_used_at = ? WHERE id = ?")

  return {
    create(record) {
      createStatement.run(record)
    },
    get(id) {
      return (getStatement.get(id) as DeviceRecord | undefined) ?? null
    },
    list() {
      return listStatement.all() as DeviceRecord[]
    },
    remove(id) {
      removeStatement.run(id)
    },
    touch(id, now = Date.now()) {
      touchStatement.run(now, id)
    },
    close() {
      db.close()
    },
  }
}

export function createMemoryStore(): DeviceStore {
  const records = new Map<string, DeviceRecord>()
  return {
    create(record) {
      records.set(record.id, record)
    },
    get(id) {
      return records.get(id) ?? null
    },
    list() {
      return [...records.values()]
    },
    remove(id) {
      records.delete(id)
    },
    touch(id, now = Date.now()) {
      const record = records.get(id)
      if (record) records.set(id, { ...record, lastUsedAt: now })
    },
    close() {},
  }
}
