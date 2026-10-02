import { useEffect, useRef } from "react"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import type { Client } from "./client"
import {
  appendDelta,
  makeToolPart,
  mergeLiveMessages,
  setMessageCost,
  setStreamText,
  updateToolPart,
  upsertToolPart,
} from "./chat"
import { opencodeErrorMessage } from "./errors"
import type {
  ChatMessage,
  Permission,
  SessionStatuses,
  SessionStructuredError,
  V2Event,
} from "./types"

export const queryKeys = {
  status: ["status"] as const,
  sessions: ["sessions"] as const,
  statuses: ["statuses"] as const,
  messages: (sessionID: string) => ["messages", sessionID] as const,
  agents: ["agents"] as const,
  models: ["models"] as const,
  workspaces: ["workspaces"] as const,
  /** Session list scoped to a workspace; `queryKeys.sessions` stays the invalidation prefix. */
  sessionsFor: (workspaceID?: string | null) => ["sessions", workspaceID ?? null] as const,
  /** Directories holding sessions for a workspace (base folder + worktrees). */
  directories: (workspaceID?: string | null) => ["directories", workspaceID ?? null] as const,
  preview: (sessionID: string) => ["preview", sessionID] as const,
}

export function useBffStatus(client: Client, refetchInterval: number | false = false) {
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: () => client.auth.status(),
    retry: false,
    refetchInterval,
  })
}

export function useSessions(
  client: Client,
  enabled: boolean,
  refetchInterval: number | false = 10_000,
  workspaceID?: string | null,
) {
  return useQuery({
    queryKey: queryKeys.sessionsFor(workspaceID),
    queryFn: () => client.api.sessions.list(workspaceID!),
    enabled: enabled && Boolean(workspaceID),
    refetchInterval,
  })
}

export function useSessionDirectories(client: Client, enabled: boolean, workspaceID?: string | null) {
  return useQuery({
    queryKey: queryKeys.directories(workspaceID),
    queryFn: () => client.api.sessions.directories(workspaceID!),
    enabled: enabled && Boolean(workspaceID),
  })
}

export function useWorkspaces(client: Client, enabled = true) {
  return useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: () => client.workspaces.list(),
    enabled,
  })
}

export function useSessionStatuses(client: Client, enabled: boolean, connected: boolean) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: queryKeys.statuses,
    queryFn: async () => {
      // A poll that starts before an event and resolves after it would erase
      // the status the event just set (e.g. `execution.started` while the
      // request was in flight). Merge instead of replacing.
      const requestedAt = Date.now()
      const snapshot = await client.api.statuses()
      return mergeStatuses(
        queryClient.getQueryData<SessionStatuses>(queryKeys.statuses),
        snapshot,
        statusWritesOf(queryClient),
        requestedAt,
      )
    },
    enabled,
    refetchInterval: connected ? 15_000 : 4_000,
  })
}

export function useMessages(
  client: Client,
  sessionID: string | null,
  options: { connected: boolean; busy: boolean },
) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: queryKeys.messages(sessionID ?? ""),
    queryFn: async () => {
      const projected = await client.api.messages(sessionID!)
      const previous = queryClient.getQueryData<ChatMessage[]>(queryKeys.messages(sessionID!))
      // A refetch mid-step must not drop the text already accumulated from
      // events: the projection only carries it once the step closes.
      return mergeLiveMessages(previous, projected)
    },
    enabled: Boolean(sessionID),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: !options.connected ? 5_000 : options.busy ? 3_000 : false,
  })
}

export function useAgents(client: Client) {
  return useQuery({ queryKey: queryKeys.agents, queryFn: () => client.api.agents(), staleTime: 5 * 60_000 })
}

export function useModels(client: Client) {
  return useQuery({ queryKey: queryKeys.models, queryFn: () => client.api.models(), staleTime: 5 * 60_000 })
}

export function usePreview(client: Client, sessionID: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.preview(sessionID ?? ""),
    queryFn: () => client.api.preview(sessionID!),
    enabled: enabled && Boolean(sessionID),
    refetchInterval: (query) => (query.state.data?.status === "starting" ? 1500 : false),
  })
}

export interface EventHandlerCallbacks {
  onPermission?: (permission: Permission) => void
  onPermissionReplied?: (permissionID: string) => void
  onSessionError?: (message: string) => void
  /** opencode (re)connected upstream: reconcile state that SSE never replays. */
  onServerConnected?: () => void
}

function parseRawInput(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * Timestamp of the last event-driven status write per session. The statuses
 * poll uses it to tell whether its snapshot may be older than a status an
 * event set while the request was in flight.
 */
const statusWriteTimes = new WeakMap<QueryClient, Map<string, number>>()

function statusWritesOf(queryClient: QueryClient): Map<string, number> {
  let times = statusWriteTimes.get(queryClient)
  if (!times) {
    times = new Map()
    statusWriteTimes.set(queryClient, times)
  }
  return times
}

/**
 * Merges the server's active-session snapshot into the event-driven cache. A
 * status set by an event at/after `requestedAt` (when the poll started) wins
 * over the snapshot, because the two raced; any other status missing from the
 * snapshot is idle and gets dropped.
 */
export function mergeStatuses(
  previous: SessionStatuses | undefined,
  snapshot: SessionStatuses,
  eventTimes: ReadonlyMap<string, number>,
  requestedAt: number,
): SessionStatuses {
  const merged: SessionStatuses = {}
  for (const [sessionID, status] of Object.entries(previous ?? {})) {
    if (sessionID in snapshot) continue
    if ((eventTimes.get(sessionID) ?? 0) >= requestedAt) merged[sessionID] = status
  }
  return { ...merged, ...snapshot }
}

/** Applies an opencode v2 event to the TanStack Query cache. Shared by every platform. */
export function createEventHandler(
  queryClient: QueryClient,
  callbacks: EventHandlerCallbacks = {},
): (event: unknown) => void {
  // opencode emits one catalog event per location when it hot-reloads its
  // config; coalesce the burst into a single trailing refetch (each new event
  // restarts the window).
  let catalogRefreshTimer: ReturnType<typeof setTimeout> | null = null
  const refreshCatalogs = () => {
    if (catalogRefreshTimer !== null) clearTimeout(catalogRefreshTimer)
    catalogRefreshTimer = setTimeout(() => {
      catalogRefreshTimer = null
      void queryClient.invalidateQueries({ queryKey: queryKeys.agents })
      void queryClient.invalidateQueries({ queryKey: queryKeys.models })
    }, 250)
  }

  return (raw) => {
    if (!raw || typeof raw !== "object") return
    const event = raw as V2Event

    const setStatus = (sessionID: string, status: SessionStatuses[string]) => {
      statusWritesOf(queryClient).set(sessionID, Date.now())
      queryClient.setQueryData<SessionStatuses>(queryKeys.statuses, (prev) => ({
        ...(prev ?? {}),
        [sessionID]: status,
      }))
    }
    const updateMessages = (sessionID: string, updater: (list: ChatMessage[]) => ChatMessage[]) => {
      queryClient.setQueryData<ChatMessage[]>(queryKeys.messages(sessionID), (prev) =>
        prev ? updater(prev) : prev,
      )
    }

    switch (event.type) {
      case "server.connected":
        // opencode (re)connected upstream. The BFF hub keeps the downstream
        // stream open while it retries, so a page loaded during the outage
        // (e.g. a dev-server restart) keeps failed agent/model catalogs and
        // messages until it is reloaded. This event is the recovery signal.
        invalidateOnReconnect(queryClient)
        callbacks.onServerConnected?.()
        return
      case "agent.updated":
      case "model.updated":
      case "provider.updated":
      case "models-dev.refreshed":
        // opencode hot-reloaded its catalog (config edits, models.dev refresh).
        refreshCatalogs()
        return
      case "permission.asked":
        callbacks.onPermission?.(event.data as Permission)
        return
      case "permission.replied":
        callbacks.onPermissionReplied?.(event.data.requestID)
        return
      case "session.created":
      case "session.renamed":
      case "session.metadata.updated":
      case "session.deleted":
      case "session.agent.selected":
      case "session.model.selected":
      case "session.permissions":
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        return
      case "session.status":
        setStatus(event.data.sessionID, event.data.status)
        return
      case "session.idle":
        setStatus(event.data.sessionID, { type: "idle" })
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages(event.data.sessionID) })
        return
      case "session.execution.started":
        setStatus(event.data.sessionID, { type: "busy" })
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages(event.data.sessionID) })
        return
      case "session.execution.succeeded":
      case "session.execution.interrupted":
        setStatus(event.data.sessionID, { type: "idle" })
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages(event.data.sessionID) })
        return
      case "session.execution.failed": {
        setStatus(event.data.sessionID, { type: "idle" })
        const message = opencodeErrorMessage(event.data.error as SessionStructuredError)
        if (message) callbacks.onSessionError?.(message)
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages(event.data.sessionID) })
        return
      }
      case "session.retry.scheduled":
        setStatus(event.data.sessionID, {
          type: "retry",
          attempt: event.data.attempt,
          message: event.data.error.message,
          next: event.data.at,
        })
        return
      case "session.text.delta":
        updateMessages(event.data.sessionID, (list) =>
          appendDelta(list, {
            sessionID: event.data.sessionID,
            messageID: event.data.assistantMessageID,
            ordinal: event.data.ordinal,
            kind: "text",
            delta: event.data.delta,
          }),
        )
        return
      case "session.reasoning.delta":
        updateMessages(event.data.sessionID, (list) =>
          appendDelta(list, {
            sessionID: event.data.sessionID,
            messageID: event.data.assistantMessageID,
            ordinal: event.data.ordinal,
            kind: "reasoning",
            delta: event.data.delta,
          }),
        )
        return
      case "session.text.ended":
        updateMessages(event.data.sessionID, (list) =>
          setStreamText(list, {
            sessionID: event.data.sessionID,
            messageID: event.data.assistantMessageID,
            ordinal: event.data.ordinal,
            kind: "text",
            text: event.data.text,
          }),
        )
        return
      case "session.reasoning.ended":
        updateMessages(event.data.sessionID, (list) =>
          setStreamText(list, {
            sessionID: event.data.sessionID,
            messageID: event.data.assistantMessageID,
            ordinal: event.data.ordinal,
            kind: "reasoning",
            text: event.data.text,
          }),
        )
        return
      case "session.step.ended":
        updateMessages(event.data.sessionID, (list) =>
          setMessageCost(list, event.data.sessionID, event.data.assistantMessageID, {
            cost: event.data.cost,
            tokens: event.data.tokens,
            finish: event.data.finish,
          }),
        )
        return
      case "session.tool.input.started":
        updateMessages(event.data.sessionID, (list) =>
          upsertToolPart(
            list,
            event.data.sessionID,
            event.data.assistantMessageID,
            makeToolPart(event.data.sessionID, event.data.assistantMessageID, event.data.id, event.data.name, {
              status: "pending",
              input: {},
              raw: "",
            }),
          ),
        )
        return
      case "session.tool.input.delta":
        updateMessages(event.data.sessionID, (list) =>
          updateToolPart(
            list,
            event.data.sessionID,
            event.data.assistantMessageID,
            event.data.id,
            (part) => ({ ...part, state: { ...part.state, raw: `${part.state.raw ?? ""}${event.data.delta}` } }),
            (part) => ({ ...part, state: { ...part.state, raw: event.data.delta } }),
          ),
        )
        return
      case "session.tool.input.ended":
        updateMessages(event.data.sessionID, (list) =>
          updateToolPart(
            list,
            event.data.sessionID,
            event.data.assistantMessageID,
            event.data.id,
            (part) => ({
              ...part,
              state: { ...part.state, status: "running", input: parseRawInput(event.data.text), raw: undefined },
            }),
            (part) => ({ ...part, state: { status: "running", input: parseRawInput(event.data.text) } }),
          ),
        )
        return
      case "session.tool.called":
        updateMessages(event.data.sessionID, (list) =>
          updateToolPart(
            list,
            event.data.sessionID,
            event.data.assistantMessageID,
            event.data.id,
            (part) => ({ ...part, state: { ...part.state, status: "running", input: event.data.input } }),
            (part) => ({ ...part, state: { status: "running", input: event.data.input } }),
          ),
        )
        return
      case "session.tool.progress":
        updateMessages(event.data.sessionID, (list) =>
          updateToolPart(
            list,
            event.data.sessionID,
            event.data.assistantMessageID,
            event.data.id,
            (part) => ({ ...part, state: { ...part.state, metadata: event.data.metadata } }),
            (part) => ({ ...part, state: { ...part.state, metadata: event.data.metadata } }),
          ),
        )
        return
      case "session.tool.success":
        updateMessages(event.data.sessionID, (list) =>
          updateToolPart(
            list,
            event.data.sessionID,
            event.data.assistantMessageID,
            event.data.id,
            (part) => ({
              ...part,
              state: {
                ...part.state,
                status: "completed",
                output: toolContentText(event.data.content),
                metadata: event.data.metadata,
              },
            }),
            (part) => ({
              ...part,
              state: {
                status: "completed",
                input: {},
                output: toolContentText(event.data.content),
                metadata: event.data.metadata,
              },
            }),
          ),
        )
        return
      case "session.tool.failed":
        updateMessages(event.data.sessionID, (list) =>
          updateToolPart(
            list,
            event.data.sessionID,
            event.data.assistantMessageID,
            event.data.id,
            (part) => ({
              ...part,
              state: {
                ...part.state,
                status: "error",
                error: event.data.error.message,
                output: toolContentText(event.data.content),
                metadata: event.data.metadata,
              },
            }),
            (part) => ({
              ...part,
              state: {
                status: "error",
                input: {},
                error: event.data.error.message,
                output: toolContentText(event.data.content),
                metadata: event.data.metadata,
              },
            }),
          ),
        )
        return
      default:
        return
    }
  }
}

function toolContentText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  const lines: string[] = []
  for (const item of content) {
    if (!item || typeof item !== "object") continue
    const entry = item as { type?: unknown; text?: unknown; uri?: unknown; name?: unknown }
    if (entry.type === "text" && typeof entry.text === "string") lines.push(entry.text)
    else if (entry.type === "file" && typeof entry.uri === "string") {
      lines.push(`[${typeof entry.name === "string" && entry.name ? entry.name : entry.uri}] ${entry.uri}`)
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined
}

/** Invalidates server state after (re)connecting so missed events are reconciled. */
export function invalidateOnReconnect(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
  void queryClient.invalidateQueries({ queryKey: ["messages"] })
  void queryClient.invalidateQueries({ queryKey: queryKeys.statuses })
  void queryClient.invalidateQueries({ queryKey: ["directories"] })
  // Catalogs recover on their own too: a page loaded while opencode rejected
  // the BFF credentials would otherwise keep empty composer selectors until a
  // manual reload.
  void queryClient.invalidateQueries({ queryKey: queryKeys.agents })
  void queryClient.invalidateQueries({ queryKey: queryKeys.models })
}

export interface UseEventStreamOptions {
  enabled: boolean
  onEvent: (event: unknown) => void
  onConnectionChange?: (connected: boolean) => void
  onConnect?: () => void
}

/** Reconnecting SSE subscription that also reacts to tab visibility and network changes on web. */
export function useEventStream(client: Client, options: UseEventStreamOptions): void {
  const onEventRef = useRef(options.onEvent)
  onEventRef.current = options.onEvent
  const onConnectionRef = useRef(options.onConnectionChange)
  onConnectionRef.current = options.onConnectionChange
  const onConnectRef = useRef(options.onConnect)
  onConnectRef.current = options.onConnect

  useEffect(() => {
    if (!options.enabled) return

    const stream = client.eventStream({
      onEvent: (event) => onEventRef.current(event),
      onConnectionChange: (connected) => onConnectionRef.current?.(connected),
      onConnect: () => onConnectRef.current?.(),
    })
    stream.start()

    const doc = typeof document === "undefined" ? null : document
    const win = typeof window === "undefined" ? null : window
    const handleVisibility = (): void => {
      if (doc?.visibilityState === "visible") stream.forceReconnect()
    }
    const handleOnline = (): void => stream.forceReconnect()

    doc?.addEventListener("visibilitychange", handleVisibility)
    win?.addEventListener("online", handleOnline)

    return () => {
      doc?.removeEventListener("visibilitychange", handleVisibility)
      win?.removeEventListener("online", handleOnline)
      stream.stop()
    }
  }, [client, options.enabled])
}
