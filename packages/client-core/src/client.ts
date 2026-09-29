import type {
  AgentInfo,
  BffStatus,
  Config,
  CreateWorkspaceInput,
  DeviceLoginResponse,
  DeviceRecord,
  MessageWithPartsResponse,
  PermissionResponse,
  Project,
  PromptBody,
  ProvidersResponse,
  Session,
  SessionStatuses,
  WorkspaceRecord,
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
    listSessions(directory?: string | null): Promise<Session[]>
    createSession(directory?: string | null): Promise<Session>
    deleteSession(id: string, directory?: string | null): Promise<boolean>
    abortSession(id: string, directory?: string | null): Promise<boolean>
    messages(id: string, directory?: string | null): Promise<MessageWithPartsResponse[]>
    promptAsync(id: string, body: PromptBody, directory?: string | null): Promise<void>
    respondPermission(
      sessionID: string,
      permissionID: string,
      response: PermissionResponse,
      directory?: string | null,
    ): Promise<boolean>
    agents(): Promise<AgentInfo[]>
    providers(): Promise<ProvidersResponse>
    config(): Promise<Config>
    statuses(): Promise<SessionStatuses>
    projects(): Promise<Project[]>
  }
  workspaces: {
    list(): Promise<WorkspaceRecord[]>
    create(input: CreateWorkspaceInput): Promise<WorkspaceRecord>
    remove(id: string, options?: { deleteFiles?: boolean }): Promise<void>
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

  /**
   * Mirrors the opencode SDK: the `directory` override travels as a query
   * parameter on GET/HEAD and as the `x-opencode-directory` header on mutations.
   */
  function withDirectory(path: string, init: RequestInit | undefined, directory?: string | null) {
    if (!directory) return { path, init }
    const method = (init?.method ?? "GET").toUpperCase()
    if (method === "GET" || method === "HEAD") {
      const separator = path.includes("?") ? "&" : "?"
      return { path: `${path}${separator}directory=${encodeURIComponent(directory)}`, init }
    }
    const headers = new Headers(init?.headers)
    headers.set("x-opencode-directory", encodeURIComponent(directory))
    return { path, init: { ...init, headers } }
  }

  const opencode = <T>(path: string, init?: RequestInit, directory?: string | null) => {
    const request_ = withDirectory(`/api/oc${path}`, init, directory)
    return request<T>(request_.path, request_.init)
  }

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
      listSessions: (directory) => opencode<Session[]>("/session", undefined, directory),
      createSession: (directory) => opencode<Session>("/session", { method: "POST", body: "{}" }, directory),
      deleteSession: (id, directory) =>
        opencode<boolean>(`/session/${id}`, { method: "DELETE" }, directory),
      abortSession: (id, directory) =>
        opencode<boolean>(`/session/${id}/abort`, { method: "POST" }, directory),
      messages: (id, directory) => opencode<MessageWithPartsResponse[]>(`/session/${id}/message`, undefined, directory),
      promptAsync: (id, body, directory) =>
        opencode<void>(`/session/${id}/prompt_async`, { method: "POST", body: JSON.stringify(body) }, directory),
      respondPermission: (sessionID, permissionID, response, directory) =>
        opencode<boolean>(
          `/session/${sessionID}/permissions/${permissionID}`,
          { method: "POST", body: JSON.stringify({ response }) },
          directory,
        ),
      agents: () => opencode<AgentInfo[]>("/agent"),
      providers: () => opencode<ProvidersResponse>("/config/providers"),
      config: () => opencode<Config>("/config"),
      statuses: () => opencode<SessionStatuses>("/session/status"),
      projects: () => opencode<Project[]>("/project"),
    },
    workspaces: {
      list: () => request<{ workspaces: WorkspaceRecord[] }>("/api/workspaces").then((response) => response.workspaces),
      create: (input) =>
        request<{ workspace: WorkspaceRecord }>("/api/workspaces", {
          method: "POST",
          body: JSON.stringify(input),
        }).then((response) => response.workspace),
      remove: (id, options) =>
        request<void>(
          `/api/workspaces/${encodeURIComponent(id)}${options?.deleteFiles ? "?deleteFiles=1" : ""}`,
          { method: "DELETE" },
        ),
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
