import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  ApiError,
  createEventHandler,
  invalidateOnReconnect,
  reconcilePermissions,
  useBffStatus,
  useEventStream,
  useSessionDirectories,
  useSessions,
  useSessionStatuses,
  useWorkspaces,
  type CreateWorkspaceInput,
  type Permission,
} from "@masterhand/client-core"
import { client } from "./client"
import { AddWorkspaceDialog } from "./components/AddWorkspaceDialog"
import { ChatView } from "./components/ChatView"
import { Login } from "./components/Login"
import { PermissionDialog } from "./components/PermissionDialog"
import { RemoveWorkspaceDialog } from "./components/RemoveWorkspaceDialog"
import { SessionList } from "./components/SessionList"
import { WorkspacePicker } from "./components/WorkspacePicker"

const WORKSPACE_STORAGE_KEY = "masterhand.workspace"
const AUTO_ACCEPT_STORAGE_KEY = "masterhand.autoAcceptSessions"

function initialWorkspaceID(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get("workspace")
  if (fromUrl) return fromUrl
  try {
    return window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
  } catch {
    return null
  }
}

function loadAutoAcceptSessions(): string[] {
  try {
    const raw = window.localStorage.getItem(AUTO_ACCEPT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []
  } catch {
    return []
  }
}

export default function App() {
  const queryClient = useQueryClient()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [sessionID, setSessionID] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("session"),
  )
  const [workspaceID, setWorkspaceID] = useState<string | null>(initialWorkspaceID)
  const [addingWorkspace, setAddingWorkspace] = useState(false)
  const [removeWorkspaceID, setRemoveWorkspaceID] = useState<string | null>(null)
  const [removingWorkspace, setRemovingWorkspace] = useState(false)
  const [connected, setConnected] = useState(false)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [responding, setResponding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [autoAcceptSessions, setAutoAcceptSessions] = useState<string[]>(loadAutoAcceptSessions)

  // Mirrors for the memoized event handler: it must see the latest values
  // without being recreated (which would resubscribe the stream).
  const autoAcceptSessionsRef = useRef(autoAcceptSessions)
  autoAcceptSessionsRef.current = autoAcceptSessions
  const answeringRef = useRef(new Set<string>())

  /** Answers a permission request automatically ("once", reversible). */
  const answerAuto = useCallback(async (permission: Permission) => {
    if (answeringRef.current.has(permission.id)) return
    answeringRef.current.add(permission.id)
    try {
      await client.api.respondPermission(permission.sessionID, permission.id, "once")
      setPermissions((prev) => prev.filter((item) => item.id !== permission.id))
    } catch {
      setBanner("Could not answer the permission request")
    } finally {
      answeringRef.current.delete(permission.id)
    }
  }, [])
  const answerAutoRef = useRef(answerAuto)
  answerAutoRef.current = answerAuto

  const statusQuery = useBffStatus(client, authed ? 15_000 : false)

  useEffect(() => {
    if (statusQuery.isSuccess) setAuthed(true)
    else if (statusQuery.error) {
      if (statusQuery.error instanceof ApiError && statusQuery.error.status === 401) setAuthed(false)
      else if (!(statusQuery.error instanceof ApiError)) {
        setBanner("Could not reach the MasterHand server")
        setAuthed(false)
      }
    }
  }, [statusQuery.isSuccess, statusQuery.error])

  const handleEvent = useMemo(
    () =>
      createEventHandler(queryClient, {
        onPermission: (permission) => {
          if (autoAcceptSessionsRef.current.includes(permission.sessionID)) {
            void answerAutoRef.current(permission)
            return
          }
          setPermissions((prev) => (prev.some((item) => item.id === permission.id) ? prev : [...prev, permission]))
        },
        onPermissionReplied: (permissionID) =>
          setPermissions((prev) => prev.filter((item) => item.id !== permissionID)),
        onSessionError: (message) => setBanner(message),
        onServerConnected: () => void syncPermissionsRef.current(),
      }),
    [queryClient],
  )

  const openSession = useCallback((id: string | null) => {
    setSessionID(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("session", id)
    else url.searchParams.delete("session")
    window.history.replaceState(null, "", url)
  }, [])

  const selectWorkspace = useCallback((id: string | null) => {
    setWorkspaceID(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("workspace", id)
    else url.searchParams.delete("workspace")
    window.history.replaceState(null, "", url)
    try {
      if (id) window.localStorage.setItem(WORKSPACE_STORAGE_KEY, id)
      else window.localStorage.removeItem(WORKSPACE_STORAGE_KEY)
    } catch {
      // storage may be unavailable (private mode)
    }
  }, [])

  const workspacesQuery = useWorkspaces(client, authed === true)
  const workspaces = workspacesQuery.data ?? []

  useEffect(() => {
    if (!workspacesQuery.data) return
    if (workspaceID && workspacesQuery.data.some((workspace) => workspace.id === workspaceID)) return
    selectWorkspace(workspacesQuery.data[0]?.id ?? null)
  }, [workspacesQuery.data, workspaceID, selectWorkspace])

  const workspace = workspaces.find((item) => item.id === workspaceID) ?? null
  const workspacePath = workspace?.path ?? null
  const directoriesQuery = useSessionDirectories(client, authed === true, workspaceID)
  const sessionsQuery = useSessions(client, authed === true, 10_000, workspaceID)

  // `permission.asked` events are lost while disconnected and never replayed.
  // On connect (and once workspaces load) reconcile against opencode, which
  // exposes pending requests per directory (workspace folder + worktrees).
  const syncPermissions = useCallback(async () => {
    const directories = directoriesQuery.data ?? (workspacePath ? [workspacePath] : [])
    if (directories.length === 0) return

    // A directory that fails to answer must not look like "no pending
    // requests": it stays out of the covered set, so its live permissions are
    // kept instead of pruned.
    const results = await Promise.all(
      directories.map(async (directory): Promise<{ directory: string; pending: Permission[] | null }> => {
        try {
          return { directory, pending: await client.api.permissions(directory) }
        } catch {
          return { directory, pending: null }
        }
      }),
    )
    const answered = results.filter(
      (result): result is { directory: string; pending: Permission[] } => result.pending !== null,
    )
    if (answered.length === 0) return

    const snapshot = answered.flatMap((result) => result.pending)
    const covered = new Set(
      (sessionsQuery.data ?? [])
        .filter((session) => answered.some((result) => result.directory === session.location.directory))
        .map((session) => session.id),
    )
    setPermissions((prev) => reconcilePermissions(prev, snapshot, covered))
  }, [client, directoriesQuery.data, workspacePath, sessionsQuery.data])
  const syncPermissionsRef = useRef(syncPermissions)
  syncPermissionsRef.current = syncPermissions

  const handleConnect = useCallback(() => {
    invalidateOnReconnect(queryClient)
    void syncPermissions()
  }, [queryClient, syncPermissions])

  useEventStream(client, {
    enabled: authed === true,
    onEvent: handleEvent,
    onConnectionChange: setConnected,
    onConnect: handleConnect,
  })

  useEffect(() => {
    if (authed !== true || !workspacesQuery.data) return
    void syncPermissions()
  }, [authed, workspacesQuery.data, syncPermissions])

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTO_ACCEPT_STORAGE_KEY, JSON.stringify(autoAcceptSessions))
    } catch {
      // storage may be unavailable (private mode)
    }
  }, [autoAcceptSessions])

  // Drain the queue for sessions with auto-accept on. This also covers pending
  // requests recovered on reconnect/reload (they never arrive as events).
  useEffect(() => {
    if (autoAcceptSessions.length === 0 || permissions.length === 0) return
    for (const permission of permissions) {
      if (autoAcceptSessions.includes(permission.sessionID)) void answerAuto(permission)
    }
  }, [autoAcceptSessions, permissions, answerAuto])

  const toggleAutoAccept = useCallback((id: string, on: boolean) => {
    setAutoAcceptSessions((prev) =>
      on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((item) => item !== id),
    )
  }, [])

  useEffect(() => {
    if (authed !== true) return
    function refresh(): void {
      if (document.visibilityState !== "visible") return
      void queryClient.invalidateQueries({ queryKey: ["messages"] })
      void queryClient.invalidateQueries({ queryKey: ["statuses"] })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
    }
    document.addEventListener("visibilitychange", refresh)
    window.addEventListener("online", refresh)
    return () => {
      document.removeEventListener("visibilitychange", refresh)
      window.removeEventListener("online", refresh)
    }
  }, [authed, queryClient])

  const statusesQuery = useSessionStatuses(client, authed === true, connected)

  useEffect(() => {
    if (sessionsQuery.error instanceof ApiError && sessionsQuery.error.status === 401) setAuthed(false)
  }, [sessionsQuery.error])

  const sessions = useMemo(
    () => [...(sessionsQuery.data ?? [])].sort((a, b) => b.time.updated - a.time.updated),
    [sessionsQuery.data],
  )
  const statuses = statusesQuery.data ?? {}
  const selected = sessions.find((session) => session.id === sessionID) ?? null
  const parentSessionID = selected?.parentID ?? null
  const busy = sessionID ? statuses[sessionID]?.type === "busy" : false

  const handleLogout = useCallback(async () => {
    await client.auth.logout().catch(() => {})
    queryClient.clear()
    setPermissions([])
    setAuthed(false)
    openSession(null)
  }, [queryClient, openSession])

  async function createSession(isolated: boolean) {
    if (!workspaceID) {
      setBanner("Add a workspace first")
      return
    }
    setCreating(true)
    setBanner(null)
    try {
      const session = await client.api.sessions.create(workspaceID, { isolated })
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["directories"] })
      openSession(session.id)
    } catch {
      setBanner("Could not create the session")
    } finally {
      setCreating(false)
    }
  }

  async function deleteSession(id: string) {
    if (!workspaceID) return
    if (!window.confirm("Delete this session and all its data?")) return
    try {
      await client.api.sessions.remove(workspaceID, id)
      if (sessionID === id) openSession(null)
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["directories"] })
    } catch {
      setBanner("Could not delete the session")
    }
  }

  async function addWorkspace(input: CreateWorkspaceInput) {
    const created = await client.workspaces.create(input)
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    selectWorkspace(created.id)
    setAddingWorkspace(false)
  }

  async function confirmRemoveWorkspace(deleteFiles: boolean) {
    const id = removeWorkspaceID
    if (!id) return
    setRemovingWorkspace(true)
    try {
      await client.workspaces.remove(id, { deleteFiles })
      if (workspaceID === id) selectWorkspace(null)
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] })
      setRemoveWorkspaceID(null)
    } catch {
      setBanner("Could not remove the workspace")
    } finally {
      setRemovingWorkspace(false)
    }
  }

  async function respondPermission(response: "once" | "always" | "reject") {
    const permission = permissions[0]
    if (!permission) return
    setResponding(true)
    try {
      // The session id resolves the request regardless of the active workspace.
      await client.api.respondPermission(permission.sessionID, permission.id, response)
      setPermissions((prev) => prev.filter((item) => item.id !== permission.id))
    } catch {
      // Keep the dialog open so the user can retry.
      setBanner("Could not answer the permission request")
    } finally {
      setResponding(false)
    }
  }

  if (authed === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="animate-pulse text-sm text-zinc-500">Loading…</p>
      </main>
    )
  }

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
        {sessionID && (
          <button
            type="button"
            onClick={() => openSession(null)}
            className="rounded-lg px-2 py-1 text-lg leading-none text-zinc-400 hover:bg-zinc-900 md:hidden"
            aria-label="Back"
          >
            ‹
          </button>
        )}
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{selected?.title || "MasterHand"}</h1>
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${connected ? "bg-emerald-400" : "animate-pulse bg-amber-400"}`}
          title={connected ? "Connected to opencode" : "Reconnecting…"}
        />
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-900"
        >
          Sign out
        </button>
      </header>

      {banner && (
        <button
          type="button"
          onClick={() => setBanner(null)}
          className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-left text-xs text-amber-300"
        >
          {banner} · tap to dismiss
        </button>
      )}

      {statusQuery.data?.opencode?.error === "unauthorized" && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          opencode rejected MasterHand&apos;s credentials. MasterHand and opencode must share
          OPENCODE_SERVER_PASSWORD: set it in apps/server/.env.local (or unset it in opencode), then
          restart both.
        </div>
      )}

      {statusQuery.data?.opencode?.error === "unreachable" && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
          opencode is not reachable. Is its server running?
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${sessionID ? "hidden md:flex" : "flex"} w-full min-h-0 flex-col border-r border-zinc-800 md:w-72 md:shrink-0`}
        >
          <WorkspacePicker
            workspaces={workspaces}
            selectedID={workspaceID}
            onSelect={selectWorkspace}
            onAdd={() => setAddingWorkspace(true)}
            onDelete={setRemoveWorkspaceID}
          />
          <SessionList
            sessions={sessions}
            statuses={statuses}
            selectedID={sessionID}
            onSelect={openSession}
            onNew={(isolated) => void createSession(isolated)}
            onDelete={(id) => void deleteSession(id)}
            creating={creating}
            canCreate={Boolean(workspaceID)}
          />
        </aside>

        <main className={`${sessionID ? "flex" : "hidden md:flex"} relative min-w-0 flex-1 flex-col`}>
          {sessionID ? (
            <ChatView
              key={sessionID}
              sessionID={sessionID}
              busy={busy}
              connected={connected}
              workspaceID={workspaceID}
              isolation={selected?.isolation}
              autoAccept={autoAcceptSessions.includes(sessionID)}
              onToggleAutoAccept={(on) => toggleAutoAccept(sessionID, on)}
              onOpenSession={openSession}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-zinc-500">
              Select a session or create a new one.
            </div>
          )}

          {sessionID && parentSessionID && (
            <button
              type="button"
              onClick={() => openSession(parentSessionID)}
              className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-indigo-500/40 bg-zinc-900/95 px-3 py-1.5 text-xs font-medium text-indigo-200 shadow-lg backdrop-blur hover:bg-zinc-800"
            >
              <span aria-hidden="true">←</span> Back to main agent
            </button>
          )}
        </main>
      </div>

      {permissions[0] && (
        <PermissionDialog
          permission={permissions[0]}
          busy={responding}
          onRespond={(response) => void respondPermission(response)}
        />
      )}

      {addingWorkspace && (
        <AddWorkspaceDialog onSubmit={addWorkspace} onClose={() => setAddingWorkspace(false)} />
      )}

      {removeWorkspaceID && (
        <RemoveWorkspaceDialog
          name={workspaces.find((item) => item.id === removeWorkspaceID)?.name ?? ""}
          busy={removingWorkspace}
          onConfirm={confirmRemoveWorkspace}
          onClose={() => setRemoveWorkspaceID(null)}
        />
      )}
    </div>
  )
}
