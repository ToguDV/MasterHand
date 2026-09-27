import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AppState, Platform, StyleSheet } from "react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fetch as expoFetch } from "expo/fetch"
import {
  ApiError,
  createClient,
  createEventHandler,
  invalidateOnReconnect,
  useEventStream,
  useSessions,
  useSessionStatuses,
  type Client,
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
  loadDevice,
  loadServerUrl,
  loadToken,
  saveDevice,
  saveServerUrl,
  saveToken,
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
    await Promise.all([clearToken(), clearDevice()])
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
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [responding, setResponding] = useState(false)
  const [connected, setConnected] = useState(false)
  const [creating, setCreating] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const sessionsQuery = useSessions(client, true)
  const statusesQuery = useSessionStatuses(client, true, connected)
  const statuses = statusesQuery.data ?? {}
  const sessions = sessionsQuery.data ?? []
  const selected = sessions.find((session) => session.id === sessionID) ?? null
  const busy = sessionID ? statuses[sessionID]?.type === "busy" : false

  const handleEvent = useMemo(
    () =>
      createEventHandler(queryClient, {
        onPermission: (permission) =>
          setPermissions((prev) => (prev.some((item) => item.id === permission.id) ? prev : [...prev, permission])),
        onPermissionReplied: (permissionID) =>
          setPermissions((prev) => prev.filter((item) => item.id !== permissionID)),
        onSessionError: () => setBanner("The agent reported an error in a session"),
      }),
    [],
  )

  const handleConnect = useCallback(() => invalidateOnReconnect(queryClient), [])

  useEventStream(client, {
    enabled: true,
    onEvent: handleEvent,
    onConnectionChange: setConnected,
    onConnect: handleConnect,
  })

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") invalidateOnReconnect(queryClient)
    })
    return () => subscription.remove()
  }, [])

  async function createSession() {
    setCreating(true)
    setBanner(null)
    try {
      const session = await client.api.createSession()
      void queryClient.invalidateQueries({ queryKey: ["sessions"] })
      setSessionID(session.id)
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

  return (
    <>
      {sessionID ? (
        <ChatScreen
          client={client}
          sessionID={sessionID}
          title={selected?.title ?? ""}
          busy={busy}
          connected={connected}
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
          onOpen={setSessionID}
          onNew={() => void createSession()}
          onSignOut={onSignOut}
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
