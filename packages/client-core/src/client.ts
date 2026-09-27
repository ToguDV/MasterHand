import type {
  AgentInfo,
  BffStatus,
  Config,
  DeviceLoginResponse,
  DeviceRecord,
  MessageWithPartsResponse,
  PermissionResponse,
  Project,
  PromptBody,
  ProvidersResponse,
  Session,
  SessionStatuses,
} from "./types"
import { createEventStream, type EventStream, type EventStreamOptions } from "./events"

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export interface ClientOptions {
  /** Base server URL (e.g. "https://masterhand.example.com"). Empty means same-origin. */
  baseUrl?: string
  /** Returns a device Bearer token. Omit it on web/desktop to use the session cookie. */
  getToken?: () => string | null | Promise<string | null>
  /** Called when a request fails with 401. */
  onUnauthorized?: () => void
  fetchImpl?: typeof fetch
}

export interface Client {
  readonly baseUrl: string
  auth: {
    login(password: string): Promise<void>
    logout(): Promise<void>
    loginDevice(password: string, name: string): Promise<DeviceLoginResponse>
    status(): Promise<BffStatus>
    devices(): Promise<DeviceRecord[]>
    revokeDevice(id: string): Promise<void>
  }
  api: {
    listSessions(): Promise<Session[]>
    createSession(): Promise<Session>
    deleteSession(id: string): Promise<boolean>
    abortSession(id: string): Promise<boolean>
    messages(id: string): Promise<MessageWithPartsResponse[]>
    promptAsync(id: string, body: PromptBody): Promise<void>
    respondPermission(sessionID: string, permissionID: string, response: PermissionResponse): Promise<boolean>
    agents(): Promise<AgentInfo[]>
    providers(): Promise<ProvidersResponse>
    config(): Promise<Config>
    statuses(): Promise<SessionStatuses>
    projects(): Promise<Project[]>
  }
  eventStream(options: Omit<EventStreamOptions, "baseUrl" | "getToken" | "fetchImpl">): EventStream
}

export function createClient(options: ClientOptions = {}): Client {
  const baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "")
  const fetchImpl = options.fetchImpl ?? fetch

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json")
    }
    const token = await options.getToken?.()
    if (token) headers.set("authorization", `Bearer ${token}`)

    const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers, credentials: "same-origin" })
    if (!response.ok) {
      if (response.status === 401) options.onUnauthorized?.()
      const text = await response.text().catch(() => "")
      throw new ApiError(response.status, text || `HTTP ${response.status}`)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  const opencode = <T>(path: string, init?: RequestInit) => request<T>(`/api/oc${path}`, init)

  return {
    baseUrl,
    auth: {
      login: (password) =>
        request<void>("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
      logout: () => request<void>("/api/logout", { method: "POST" }),
      loginDevice: (password, name) =>
        request<DeviceLoginResponse>("/api/devices", {
          method: "POST",
          body: JSON.stringify({ password, name }),
        }),
      status: () => request<BffStatus>("/api/status"),
      devices: () =>
        request<{ devices: DeviceRecord[] }>("/api/devices").then((response) => response.devices),
      revokeDevice: (id) => request<void>(`/api/devices/${encodeURIComponent(id)}`, { method: "DELETE" }),
    },
    api: {
      listSessions: () => opencode<Session[]>("/session"),
      createSession: () => opencode<Session>("/session", { method: "POST", body: "{}" }),
      deleteSession: (id) => opencode<boolean>(`/session/${id}`, { method: "DELETE" }),
      abortSession: (id) => opencode<boolean>(`/session/${id}/abort`, { method: "POST" }),
      messages: (id) => opencode<MessageWithPartsResponse[]>(`/session/${id}/message`),
      promptAsync: (id, body) =>
        opencode<void>(`/session/${id}/prompt_async`, { method: "POST", body: JSON.stringify(body) }),
      respondPermission: (sessionID, permissionID, response) =>
        opencode<boolean>(`/session/${sessionID}/permissions/${permissionID}`, {
          method: "POST",
          body: JSON.stringify({ response }),
        }),
      agents: () => opencode<AgentInfo[]>("/agent"),
      providers: () => opencode<ProvidersResponse>("/config/providers"),
      config: () => opencode<Config>("/config"),
      statuses: () => opencode<SessionStatuses>("/session/status"),
      projects: () => opencode<Project[]>("/project"),
    },
    eventStream: (streamOptions) =>
      createEventStream({
        ...streamOptions,
        baseUrl,
        getToken: options.getToken,
        fetchImpl,
      }),
  }
}
