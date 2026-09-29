import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState, Platform, StyleSheet } from "react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fetch as expoFetch } from "expo/fetch"
import {
  ApiError,
  createClient,
  createEventHandler,
  invalidateOnReconnect,
  sessionDirectory,
  useEventStream,
  useSessionDirectories,
  useSessions,
  useSessionStatuses,
  useWorkspaces,
  type Client,
  type CreateWorkspaceInput,
  type Permission,
} from "@masterhand/client-core"
import { LoginScreen } from "./src/screens/LoginScreen"
import { SessionsScreen } from "./src/screens/SessionsScreen"
import { ChatScreen } from "./src/screens/ChatScreen"
import { PermissionModal } from "./src/components/PermissionModal"
import { Screen } from "./src/components/Screen"
import { ActivityIndicator, Text } from "react-native"
import { colors } from "./src/theme"
import {
  clearDevice,
  clearToken,
  clearWorkspaceID,
  loadAutoAcceptSessions,
  loadDevice,
  loadServerUrl,
  loadToken,
  loadWorkspaceID,
  saveAutoAcceptSessions,
  saveDevice,
  saveServerUrl,
  saveToken,
  saveWorkspaceID,
} from "./src/storage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
    },
  },
})

const fetchImpl = expoFetch as unknown as typeof fetch

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Root />
    </QueryClientProvider>
  )
}

function Root() {
  const [ready, setReady] = useState(false)
  const [serverUrl, setServerUrl] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [storedUrl, storedToken] = await Promise.all([loadServerUrl(), loadToken()])
      tokenRef.current = storedToken
      setServerUrl(storedUrl)
      setToken(storedToken)
      setReady(true)
    })()
  }, [])

  const client = useMemo(() => {
    if (!serverUrl) return null
    return createClient({
      baseUrl: serverUrl,
      getToken: () => tokenRef.current,
      fetchImpl,
      onUnauthorized: () => {
        tokenRef.current = null
        void clearToken()
        setToken(null)
      },
    })
  }, [serverUrl])

  async function handleLogin(url: string, password: string) {
    setLoginBusy(true)
    setLoginError(null)
    try {
      const normalized = url.replace(/\/+$/, "")
      const candidate = createClient({ baseUrl: normalized, fetchImpl })
      const deviceName = Platform.OS === "ios" ? "iOS device" : "Android device"
      const result = await candidate.auth.loginDevice(password, deviceName)
      await Promise.all([saveServerUrl(normalized), saveToken(result.token), saveDevice(result.device)])
      tokenRef.current = result.token
      setServerUrl(normalized)
      setToken(result.token)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setLoginError("Wrong password")
        else if (err.status === 429) setLoginError("Too many attempts; wait 15 minutes")
        else if (err.status === 400) setLoginError("Check the server URL and password")
        else setLoginError(`Error ${err.status}`)
      } else {
        setLoginError("Could not reach the server")
      }
    } finally {
      setLoginBusy(false)
    }
  }

  async function handleSignOut() {
    if (client) {
      const device = await loadDevice().catch(() => null)
      if (device) await client.auth.revokeDevice(device.id).catch(() => {})
    }
    await Promise.all([clearToken(), clearDevice(), clearWorkspaceID()])
    tokenRef.current = null
    queryClient.clear()
    setToken(null)
  }

  if (!ready) {
    return (
      <Screen style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    )
  }

  if (!client || !token) {
    return (
      <LoginScreen
        initialServerUrl={serverUrl}
        busy={loginBusy}
        error={loginError}
        onSubmit={(url, password) => void handleLogin(url, password)}
      />
    )
  }

  return <AuthenticatedApp client={client} onSignOut={() => void handleSignOut()} />
}

function AuthenticatedApp({ client, onSignOut }: { client: Client; onSignOut: () => void }) {
  const [sessionID, setSessionID] = useState<string | null>(null)
  const [workspaceID, setWorkspaceID] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [responding, setResponding] = useState(false)
  const [connected, setConnected] = useState(false)
  const [creating, setCreating] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [autoAcceptSessions, setAutoAcceptSessions] = useState<string[]>([])
  const autoAcceptLoaded = useRef(false)

  useEffect(() => {
    void loadAutoAcceptSessions().then((ids) => {
      setAutoAcceptSessions(ids)
      autoAcceptLoaded.current = true
    })
  }, [])

  useEffect(() => {
    if (!autoAcceptLoaded.current) return
    void saveAutoAcceptSessions(autoAcceptSessions)
  }, [autoAcceptSessions])

  // Mirrors for the memoized event handler: it must see the latest values
  // without being recreated (which would resubscribe the stream).
  const autoAcceptSessionsRef = useRef(autoAcceptSessions)
  autoAcceptSessionsRef.current = autoAcceptSessions
  const answeringRef = useRef(new Set<string>())

  /** Answers a permission request automatically ("once", reversible). */
  const answerAuto = useCallback(
    async (permission: Permission) => {
      if (answeringRef.current.has(permission.id)) return
      answeringRef.current.add(permission.id)
      try {
        await client.api.respondPermission(permission.sessionID, permission.id, "once")
      } catch {
        setBanner("Could not answer the permission request")
      } finally {
        answeringRef.current.delete(permission.id)
        setPermissions((prev) => prev.filter((item) => item.id !== permission.id))
      }
    },
    [client],
  )
  const answerAutoRef = useRef(answerAuto)
  answerAutoRef.current = answerAuto

  useEffect(() => {
    void loadWorkspaceID().then(setWorkspaceID)
  }, [])

  const workspacesQuery = useWorkspaces(client, true)
  const workspaces = workspacesQuery.data ?? []
  const workspace = workspaces.find((item) => item.id === workspaceID) ?? null
  const workspacePath = workspace?.path ?? null
  const directoriesQuery = useSessionDirectories(client, true, workspaceID)

  useEffect(() => {
    if (!workspacesQuery.data) return
    if (workspaceID && workspacesQuery.data.some((item) => item.id === workspaceID)) return
    const next = workspacesQuery.data[0]?.id ?? null
    setWorkspaceID(next)
    if (next) void saveWorkspaceID(next)
    else void clearWorkspaceID()
  }, [workspacesQuery.data, workspaceID])

  const sessionsQuery = useSessions(client, true, 10_000, workspaceID)
  const statusesQuery = useSessionStatuses(client, true, connected)
  const statuses = statusesQuery.data ?? {}
  const sessions = sessionsQuery.data ?? []
  const selected = sessions.find((session) => session.id === sessionID) ?? null
  const parentSessionID = selected?.parentID ?? null
  const busy = sessionID ? statuses[sessionID]?.type === "busy" : false
  // Isolated sessions run in their worktree; everything else in the workspace.
  const directory = sessionDirectory(selected, workspacePath)

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
      }),
    [],
  )

  // `permission.asked` events are lost while the app is backgrounded and never
  // replayed. Reconcile against opencode on connect and when workspaces load.
  const syncPermissions = useCallback(async () => {
    const directories = directoriesQuery.data ?? (workspacePath ? [workspacePath] : [])
    try {
      const lists = await Promise.all(
        directories.map((dir) => client.api.permissions(dir).catch(() => [] as Permission[])),
      )
      const pending = lists.flat()
      if (pending.length === 0) return
      setPermissions((prev) => {
        const byId = new Map(prev.map((item) => [item.id, item]))
        for (const item of pending) byId.set(item.id, item)
        return [...byId.values()]
      })
    } catch {
      // best effort: a missed stream event is not worth surfacing an error
    }
  }, [directoriesQuery.data, workspacePath])

  const handleConnect = useCallback(() => {
    invalidateOnReconnect(queryClient)
    void syncPermissions()
  }, [syncPermissions])

  useEventStream(client, {
    enabled: true,
    onEvent: handleEvent,
    onConnectionChange: setConnected,
    onConnect: handleConnect,
  })

  useEffect(() => {
    if (!workspacesQuery.data) return
    void syncPermissions()
  }, [workspacesQuery.data, syncPermissions])

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncPermissions()
    })
    return () => subscription.remove()
  }, [syncPermissions])

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
      setSessionID(session.id)
    } catch {
      setBanner("Could not create the session")
    } finally {
      setCreating(false)
    }
  }

  async function deleteSession(id: string) {
    if (!workspaceID) return
    const target = sessions.find((session) => session.id === id) ?? null
    try {
      await client.api.sessions.remove(workspaceID, id, sessionDirectory(target, workspacePath))
      if (sessionID === id) setSessionID(null)
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      void queryClient.invalidateQueries({ queryKey: ["directories"] })
    } catch {
      setBanner("Could not delete the session")
    }
  }

  async function addWorkspace(input: CreateWorkspaceInput) {
    const created = await client.workspaces.create(input)
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    setWorkspaceID(created.id)
    void saveWorkspaceID(created.id)
  }

  async function removeWorkspace(id: string, options: { deleteFiles: boolean }) {
    try {
      await client.workspaces.remove(id, options)
      if (workspaceID === id) {
        setWorkspaceID(null)
        void clearWorkspaceID()
      }
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] })
    } catch {
      setBanner("Could not remove the workspace")
    }
  }

  function selectWorkspace(id: string) {
    setWorkspaceID(id)
    void saveWorkspaceID(id)
  }

  async function respondPermission(response: "once" | "always" | "reject") {
    const permission = permissions[0]
    if (!permission) return
    setResponding(true)
    try {
      const answered = await client.api.respondPermission(permission.sessionID, permission.id, response)
      if (answered === false) setBanner("This permission was already answered")
      setPermissions((prev) => prev.filter((item) => item.id !== permission.id))
    } catch {
      setBanner("Could not answer the permission request")
    } finally {
      setResponding(false)
    }
  }

  return (
    <>
      {sessionID ? (
        <ChatScreen
          client={client}
          sessionID={sessionID}
          title={selected?.title ?? ""}
          busy={busy}
          connected={connected}
          directory={directory}
          isolation={selected?.isolation}
          autoAccept={autoAcceptSessions.includes(sessionID)}
          onToggleAutoAccept={(on) => toggleAutoAccept(sessionID, on)}
          onOpenSession={setSessionID}
          parentSessionID={parentSessionID}
          onBack={() => setSessionID(null)}
        />
      ) : (
        <SessionsScreen
          sessions={sessions}
          loading={sessionsQuery.isLoading}
          statuses={statuses}
          connected={connected}
          creating={creating}
          banner={banner}
          workspaces={workspaces}
          workspaceID={workspaceID}
          canCreate={Boolean(workspaceID)}
          onOpen={setSessionID}
          onNew={(isolated) => void createSession(isolated)}
          onSignOut={onSignOut}
          onSelectWorkspace={selectWorkspace}
          onAddWorkspace={addWorkspace}
          onRemoveWorkspace={(id, options) => void removeWorkspace(id, options)}
          onDeleteSession={(id) => void deleteSession(id)}
        />
      )}

      {permissions[0] && (
        <PermissionModal
          permission={permissions[0]}
          busy={responding}
          onRespond={(response) => void respondPermission(response)}
        />
      )}
    </>
  )
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
})
