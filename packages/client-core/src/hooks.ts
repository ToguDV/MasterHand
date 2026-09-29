import { useEffect, useRef } from "react"
import { useQuery, type QueryClient } from "@tanstack/react-query"
import type { Client } from "./client"
import { removeMessage, removePart, upsertMessage, upsertPart } from "./chat"
import type { Event, MessageWithPartsResponse, Permission, SessionStatuses } from "./types"

export const queryKeys = {
  status: ["status"] as const,
  sessions: ["sessions"] as const,
  statuses: ["statuses"] as const,
  messages: (sessionID: string) => ["messages", sessionID] as const,
  agents: ["agents"] as const,
  providers: ["providers"] as const,
  config: ["config"] as const,
  workspaces: ["workspaces"] as const,
  /** Session list scoped to a workspace; `queryKeys.sessions` stays the invalidation prefix. */
  sessionsFor: (directory?: string | null) => ["sessions", directory ?? null] as const,
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
  directory?: string | null,
) {
  return useQuery({
    queryKey: queryKeys.sessionsFor(directory),
    queryFn: () => client.api.listSessions(directory),
    enabled,
    refetchInterval,
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
  options: { connected: boolean; busy: boolean; directory?: string | null },
) {
  return useQuery({
    queryKey: queryKeys.messages(sessionID ?? ""),
    queryFn: () => client.api.messages(sessionID!, options.directory),
    enabled: Boolean(sessionID),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: !options.connected ? 5_000 : options.busy ? 3_000 : false,
  })
}

export function useAgents(client: Client) {
  return useQuery({ queryKey: queryKeys.agents, queryFn: () => client.api.agents(), staleTime: 5 * 60_000 })
}

export function useProviders(client: Client) {
  return useQuery({ queryKey: queryKeys.providers, queryFn: () => client.api.providers(), staleTime: 5 * 60_000 })
}

export function useConfig(client: Client) {
  return useQuery({ queryKey: queryKeys.config, queryFn: () => client.api.config(), staleTime: 5 * 60_000 })
}

export interface EventHandlerCallbacks {
  onPermission?: (permission: Permission) => void
  onPermissionReplied?: (permissionID: string) => void
  onSessionError?: () => void
}

/** Applies an opencode event to the TanStack Query cache. Shared by every platform. */
export function createEventHandler(
  queryClient: QueryClient,
  callbacks: EventHandlerCallbacks = {},
): (event: unknown) => void {
  return (raw) => {
    const event = raw as Event
    switch (event.type) {
      case "session.created":
      case "session.updated":
      case "session.deleted":
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
        break
      case "session.status": {
        const { sessionID, status } = event.properties
        queryClient.setQueryData<SessionStatuses>(queryKeys.statuses, (prev) => ({
          ...(prev ?? {}),
          [sessionID]: status,
        }))
        break
      }
      case "session.idle": {
        const { sessionID } = event.properties
        queryClient.setQueryData<SessionStatuses>(queryKeys.statuses, (prev) => ({
          ...(prev ?? {}),
          [sessionID]: { type: "idle" },
        }))
        void queryClient.invalidateQueries({ queryKey: queryKeys.messages(sessionID) })
        break
      }
      case "message.updated": {
        const { info } = event.properties
        queryClient.setQueryData<MessageWithPartsResponse[]>(queryKeys.messages(info.sessionID), (prev) =>
          prev ? upsertMessage(prev, info) : prev,
        )
        break
      }
      case "message.part.updated": {
        const { part, delta } = event.properties
        queryClient.setQueryData<MessageWithPartsResponse[]>(queryKeys.messages(part.sessionID), (prev) =>
          prev ? upsertPart(prev, part, delta) : prev,
        )
        break
      }
      case "message.part.removed": {
        const { sessionID, messageID, partID } = event.properties
        queryClient.setQueryData<MessageWithPartsResponse[]>(queryKeys.messages(sessionID), (prev) =>
          prev ? removePart(prev, messageID, partID) : prev,
        )
        break
      }
      case "message.removed": {
        const { sessionID, messageID } = event.properties
        queryClient.setQueryData<MessageWithPartsResponse[]>(queryKeys.messages(sessionID), (prev) =>
          prev ? removeMessage(prev, messageID) : prev,
        )
        break
      }
      case "permission.updated":
        callbacks.onPermission?.(event.properties)
        break
      case "permission.replied":
        callbacks.onPermissionReplied?.(event.properties.permissionID)
        break
      case "session.error":
        callbacks.onSessionError?.()
        break
    }
  }
}

/** Invalidates server state after (re)connecting so missed events are reconciled. */
export function invalidateOnReconnect(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
  void queryClient.invalidateQueries({ queryKey: ["messages"] })
  void queryClient.invalidateQueries({ queryKey: queryKeys.statuses })
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
