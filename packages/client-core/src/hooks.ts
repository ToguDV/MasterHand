import { useEffect, useRef } from "react"
import { useQuery, type QueryClient } from "@tanstack/react-query"
import type { Client } from "./client"
import {
  appendDelta,
  makeToolPart,
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
  return useQuery({
    queryKey: queryKeys.statuses,
    queryFn: () => client.api.statuses(),
    enabled,
    refetchInterval: connected ? 15_000 : 4_000,
  })
}

export function useMessages(
  client: Client,
  sessionID: string | null,
  options: { connected: boolean; busy: boolean },
) {
  return useQuery({
    queryKey: queryKeys.messages(sessionID ?? ""),
    queryFn: () => client.api.messages(sessionID!),
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

/** Applies an opencode v2 event to the TanStack Query cache. Shared by every platform. */
export function createEventHandler(
  queryClient: QueryClient,
  callbacks: EventHandlerCallbacks = {},
): (event: unknown) => void {
  return (raw) => {
    if (!raw || typeof raw !== "object") return
    const event = raw as V2Event

    const setStatus = (sessionID: string, status: SessionStatuses[string]) => {
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
