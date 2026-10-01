import type {
  AgentInfo,
  BffStatus,
  Config,
  CreateSessionInput,
  CreateWorkspaceInput,
  DeviceLoginResponse,
  DeviceRecord,
  FinishSessionResult,
  MessageWithPartsResponse,
  Permission,
  PermissionResponse,
  PreviewStatus,
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
    /**
     * Workspace-scoped session operations. The BFF aggregates the workspace
     * folder and every isolated worktree, annotating each session with its
     * `isolation` (branch/worktree path) when it runs isolated.
     */
    sessions: {
      list(workspaceID: string): Promise<Session[]>
      create(workspaceID: string, input?: CreateSessionInput): Promise<Session>
      remove(workspaceID: string, sessionID: string, directory?: string | null): Promise<void>
      finish(sessionID: string): Promise<FinishSessionResult>
      /** Directories that may hold sessions for the workspace (base + worktrees). */
      directories(workspaceID: string): Promise<string[]>
    }
    abortSession(id: string, directory?: string | null): Promise<boolean>
    messages(id: string, directory?: string | null): Promise<MessageWithPartsResponse[]>
    promptAsync(id: string, body: PromptBody, directory?: string | null): Promise<void>
    /** Pending permission requests. opencode scopes this by `directory`. */
    permissions(directory?: string | null): Promise<Permission[]>
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
    /** Live preview (Cloudflare quick tunnel) for a session. */
    preview(sessionID: string): Promise<PreviewStatus>
    startPreview(sessionID: string): Promise<PreviewStatus>
    stopPreview(sessionID: string): Promise<void>
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
      sessions: {
        list: (workspaceID) =>
          request<{ sessions: Session[] }>(
            `/api/workspaces/${encodeURIComponent(workspaceID)}/sessions`,
          ).then((response) => response.sessions),
        create: (workspaceID, input) =>
          request<{ session: Session }>(`/api/workspaces/${encodeURIComponent(workspaceID)}/sessions`, {
            method: "POST",
            body: JSON.stringify(input ?? {}),
          }).then((response) => response.session),
        remove: (workspaceID, sessionID, directory) =>
          request<void>(
            `/api/workspaces/${encodeURIComponent(workspaceID)}/sessions/${encodeURIComponent(sessionID)}${
              directory ? `?directory=${encodeURIComponent(directory)}` : ""
            }`,
            { method: "DELETE" },
          ),
        finish: (sessionID) =>
          request<FinishSessionResult>(
            `/api/isolated-sessions/${encodeURIComponent(sessionID)}/finish`,
            { method: "POST" },
          ),
        directories: (workspaceID) =>
          request<{ directories: string[] }>(
            `/api/workspaces/${encodeURIComponent(workspaceID)}/directories`,
          ).then((response) => response.directories),
      },
      abortSession: (id, directory) =>
        opencode<boolean>(`/session/${id}/abort`, { method: "POST" }, directory),
      messages: (id, directory) => opencode<MessageWithPartsResponse[]>(`/session/${id}/message`, undefined, directory),
      promptAsync: (id, body, directory) =>
        opencode<void>(`/session/${id}/prompt_async`, { method: "POST", body: JSON.stringify(body) }, directory),
      permissions: (directory) => opencode<Permission[]>("/permission", undefined, directory),
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
      preview: (sessionID) =>
        request<{ preview: PreviewStatus }>(`/api/sessions/${encodeURIComponent(sessionID)}/preview`).then(
          (response) => response.preview,
        ),
      startPreview: (sessionID) =>
        request<{ preview: PreviewStatus }>(`/api/sessions/${encodeURIComponent(sessionID)}/preview`, {
          method: "POST",
        }).then((response) => response.preview),
      stopPreview: (sessionID) =>
        request<void>(`/api/sessions/${encodeURIComponent(sessionID)}/preview`, { method: "DELETE" }),
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
