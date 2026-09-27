import { useCallback, useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  ApiError,
  createEventHandler,
  invalidateOnReconnect,
  useBffStatus,
  useEventStream,
  useSessions,
  useSessionStatuses,
  type Permission,
} from "@masterhand/client-core"
import { client } from "./client"
import { ChatView } from "./components/ChatView"
import { Login } from "./components/Login"
import { PermissionDialog } from "./components/PermissionDialog"
import { SessionList } from "./components/SessionList"

export default function App() {
  const queryClient = useQueryClient()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [sessionID, setSessionID] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("session"),
  )
  const [connected, setConnected] = useState(false)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [responding, setResponding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

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
        onPermission: (permission) =>
          setPermissions((prev) => (prev.some((item) => item.id === permission.id) ? prev : [...prev, permission])),
        onPermissionReplied: (permissionID) =>
          setPermissions((prev) => prev.filter((item) => item.id !== permissionID)),
        onSessionError: () => setBanner("The agent reported an error in a session"),
      }),
    [queryClient],
  )

  const handleConnect = useCallback(() => invalidateOnReconnect(queryClient), [queryClient])

  useEventStream(client, {
    enabled: authed === true,
    onEvent: handleEvent,
    onConnectionChange: setConnected,
    onConnect: handleConnect,
  })

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

  const openSession = useCallback((id: string | null) => {
    setSessionID(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set("session", id)
    else url.searchParams.delete("session")
    window.history.replaceState(null, "", url)
  }, [])

  const sessionsQuery = useSessions(client, authed === true)
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
  const busy = sessionID ? statuses[sessionID]?.type === "busy" : false

  const handleLogout = useCallback(async () => {
    await client.auth.logout().catch(() => {})
    queryClient.clear()
    setPermissions([])
    setAuthed(false)
    openSession(null)
  }, [queryClient, openSession])

  async function createSession() {
    setCreating(true)
    setBanner(null)
    try {
      const session = await client.api.createSession()
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      openSession(session.id)
    } catch {
      setBanner("Could not create the session")
    } finally {
      setCreating(false)
    }
  }

  async function respondPermission(response: "once" | "always" | "reject") {
    const permission = permissions[0]
    if (!permission) return
    setResponding(true)
    try {
      await client.api.respondPermission(permission.sessionID, permission.id, response)
    } catch {
      setBanner("Could not answer the permission request")
    } finally {
      setResponding(false)
      setPermissions((prev) => prev.filter((item) => item.id !== permission.id))
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

      <div className="flex min-h-0 flex-1">
        <aside
          className={`${sessionID ? "hidden md:flex" : "flex"} w-full min-h-0 flex-col border-r border-zinc-800 md:w-72 md:shrink-0`}
        >
          <SessionList
            sessions={sessions}
            statuses={statuses}
            selectedID={sessionID}
            onSelect={openSession}
            onNew={() => void createSession()}
            creating={creating}
          />
        </aside>

        <main className={`${sessionID ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {sessionID ? (
            <ChatView key={sessionID} sessionID={sessionID} busy={busy} connected={connected} />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-zinc-500">
              Select a session or create a new one.
            </div>
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
    </div>
  )
}
