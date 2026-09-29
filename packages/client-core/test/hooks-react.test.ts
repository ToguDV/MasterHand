/**
 * @vitest-environment jsdom
 */
import { createElement, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Client } from "../src/client"
import {
  useAgents,
  useBffStatus,
  useConfig,
  useEventStream,
  useMessages,
  useProviders,
  useSessions,
  useSessionStatuses,
  useWorkspaces,
} from "../src/hooks"

afterEach(cleanup)

function makeEventStream() {
  return { start: vi.fn(), stop: vi.fn(), forceReconnect: vi.fn(), connected: false }
}

function makeClient(stream = makeEventStream()) {
  const auth = { status: vi.fn(async () => ({ ok: true, opencode: { healthy: true } })) }
  const api = {
    listSessions: vi.fn(async () => []),
    statuses: vi.fn(async () => ({})),
    messages: vi.fn(async () => []),
    agents: vi.fn(async () => []),
    providers: vi.fn(async () => ({ providers: [], default: {} })),
    config: vi.fn(async () => ({ model: "x/y" })),
  }
  const eventStream = vi.fn((_options: Parameters<Client["eventStream"]>[0]) => stream)
  const workspaces = { list: vi.fn(async () => []) }
  return {
    client: { baseUrl: "", auth, api, workspaces, eventStream } as unknown as Client,
    stream,
    auth,
    api,
    workspaces,
    eventStream,
  }
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
}

describe("query hooks", () => {
  it("useBffStatus fetches the BFF status", async () => {
    const qc = newQueryClient()
    const { client, auth } = makeClient()
    const { result } = renderHook(() => useBffStatus(client, false), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(auth.status).toHaveBeenCalledTimes(1)
    expect(result.current.data).toEqual({ ok: true, opencode: { healthy: true } })
  })

  it("useSessions only fetches when enabled", async () => {
    const qc = newQueryClient()
    const { client, api } = makeClient()

    const disabled = renderHook(() => useSessions(client, false), { wrapper: wrapper(qc) })
    expect(disabled.result.current.fetchStatus).toBe("idle")
    expect(api.listSessions).not.toHaveBeenCalled()

    const enabled = renderHook(() => useSessions(client, true, false), { wrapper: wrapper(qc) })
    await waitFor(() => expect(enabled.result.current.isSuccess).toBe(true))
    expect(api.listSessions).toHaveBeenCalledTimes(1)
  })

  it("useSessionStatuses adapts its polling to connectivity", async () => {
    const qc = newQueryClient()
    const { client, api } = makeClient()
    const { result } = renderHook(() => useSessionStatuses(client, true, true), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.statuses).toHaveBeenCalledTimes(1)
  })

  it("useMessages stays disabled without a session", async () => {
    const qc = newQueryClient()
    const { client, api } = makeClient()

    const disabled = renderHook(() => useMessages(client, null, { connected: true, busy: false }), {
      wrapper: wrapper(qc),
    })
    expect(disabled.result.current.fetchStatus).toBe("idle")
    expect(api.messages).not.toHaveBeenCalled()

    const enabled = renderHook(() => useMessages(client, "ses_1", { connected: false, busy: true }), {
      wrapper: wrapper(qc),
    })
    await waitFor(() => expect(enabled.result.current.isSuccess).toBe(true))
    expect(api.messages).toHaveBeenCalledWith("ses_1", undefined)
  })

  it("useSessions scopes the fetch to a workspace directory", async () => {
    const qc = newQueryClient()
    const { client, api } = makeClient()
    const { result } = renderHook(() => useSessions(client, true, false, "/workspace/app"), {
      wrapper: wrapper(qc),
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.listSessions).toHaveBeenCalledWith("/workspace/app")
  })

  it("useWorkspaces loads the registered workspaces", async () => {
    const qc = newQueryClient()
    const { client, workspaces } = makeClient()
    const { result } = renderHook(() => useWorkspaces(client), { wrapper: wrapper(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(workspaces.list).toHaveBeenCalledTimes(1)
  })

  it("useAgents, useProviders and useConfig load their resources", async () => {
    const qc = newQueryClient()
    const { client, api } = makeClient()

    const agents = renderHook(() => useAgents(client), { wrapper: wrapper(qc) })
    const providers = renderHook(() => useProviders(client), { wrapper: wrapper(qc) })
    const config = renderHook(() => useConfig(client), { wrapper: wrapper(qc) })

    await waitFor(() => expect(config.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(providers.result.current.isSuccess).toBe(true))
    await waitFor(() => expect(agents.result.current.isSuccess).toBe(true))
    expect(api.agents).toHaveBeenCalledTimes(1)
    expect(api.providers).toHaveBeenCalledTimes(1)
    expect(api.config).toHaveBeenCalledTimes(1)
  })
})

describe("useEventStream", () => {
  it("does nothing while disabled", () => {
    const qc = newQueryClient()
    const { client, stream } = makeClient()
    renderHook(() => useEventStream(client, { enabled: false, onEvent: () => {} }), { wrapper: wrapper(qc) })
    expect(client.eventStream).not.toHaveBeenCalled()
    expect(stream.start).not.toHaveBeenCalled()
  })

  it("subscribes, wires callbacks, reacts to network changes and cleans up", async () => {
    const qc = newQueryClient()
    const { client, stream, eventStream } = makeClient()
    const onEvent = vi.fn()
    const onConnectionChange = vi.fn()
    const onConnect = vi.fn()

    const view = renderHook(
      () => useEventStream(client, { enabled: true, onEvent, onConnectionChange, onConnect }),
      { wrapper: wrapper(qc) },
    )

    await waitFor(() => expect(stream.start).toHaveBeenCalledTimes(1))

    const options = eventStream.mock.calls[0]?.[0] as {
      onEvent: (event: unknown) => void
      onConnectionChange: (connected: boolean) => void
      onConnect: () => void
    }
    options.onEvent({ type: "session.idle" })
    options.onConnectionChange(true)
    options.onConnect()
    expect(onEvent).toHaveBeenCalledWith({ type: "session.idle" })
    expect(onConnectionChange).toHaveBeenCalledWith(true)
    expect(onConnect).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new Event("visibilitychange"))
    window.dispatchEvent(new Event("online"))
    expect(stream.forceReconnect).toHaveBeenCalledTimes(2)

    view.unmount()
    expect(stream.stop).toHaveBeenCalledTimes(1)
  })
})
