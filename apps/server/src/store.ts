import Database from "better-sqlite3"

export interface DeviceRecord {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number
}

export interface WorkspaceRecord {
  id: string
  name: string
  path: string
  createdAt: number
}

export interface Store {
  create(record: DeviceRecord): void
  get(id: string): DeviceRecord | null
  list(): DeviceRecord[]
  remove(id: string): void
  touch(id: string, now?: number): void
  listWorkspaces(): WorkspaceRecord[]
  getWorkspace(id: string): WorkspaceRecord | null
  getWorkspaceByPath(path: string): WorkspaceRecord | null
  createWorkspace(record: WorkspaceRecord): void
  removeWorkspace(id: string): void
  close(): void
}

export function createSqliteStore(file: string): Store {
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
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

  const listWorkspacesStatement = db.prepare(`
    SELECT id, name, path, created_at AS createdAt
    FROM workspaces
    ORDER BY created_at ASC
  `)
  const getWorkspaceStatement = db.prepare(`
    SELECT id, name, path, created_at AS createdAt
    FROM workspaces
    WHERE id = ?
  `)
  const getWorkspaceByPathStatement = db.prepare(`
    SELECT id, name, path, created_at AS createdAt
    FROM workspaces
    WHERE path = ?
  `)
  const createWorkspaceStatement = db.prepare(`
    INSERT INTO workspaces (id, name, path, created_at)
    VALUES (@id, @name, @path, @createdAt)
  `)
  const removeWorkspaceStatement = db.prepare("DELETE FROM workspaces WHERE id = ?")

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
    listWorkspaces() {
      return listWorkspacesStatement.all() as WorkspaceRecord[]
    },
    getWorkspace(id) {
      return (getWorkspaceStatement.get(id) as WorkspaceRecord | undefined) ?? null
    },
    getWorkspaceByPath(path) {
      return (getWorkspaceByPathStatement.get(path) as WorkspaceRecord | undefined) ?? null
    },
    createWorkspace(record) {
      createWorkspaceStatement.run(record)
    },
    removeWorkspace(id) {
      removeWorkspaceStatement.run(id)
    },
    close() {
      db.close()
    },
  }
}

export function createMemoryStore(): Store {
  const records = new Map<string, DeviceRecord>()
  const workspaces = new Map<string, WorkspaceRecord>()
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
    listWorkspaces() {
      return [...workspaces.values()].sort((a, b) => a.createdAt - b.createdAt)
    },
    getWorkspace(id) {
      return workspaces.get(id) ?? null
    },
    getWorkspaceByPath(path) {
      return [...workspaces.values()].find((workspace) => workspace.path === path) ?? null
    },
    createWorkspace(record) {
      workspaces.set(record.id, record)
    },
    removeWorkspace(id) {
      workspaces.delete(id)
    },
    close() {},
  }
}
