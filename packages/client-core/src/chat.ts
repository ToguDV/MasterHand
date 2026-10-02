import type {
  ChatMessage,
  ChatPart,
  ChatToolPart,
  ChatToolState,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  TokenUsageInfo,
} from "./types"

function readString(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") return null
  const value = (source as Record<string, unknown>)[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

function toolOutput(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  const lines: string[] = []
  for (const item of content) {
    if (!item || typeof item !== "object") continue
    const entry = item as { type?: unknown; text?: unknown; uri?: unknown; name?: unknown; mime?: unknown }
    if (entry.type === "text" && typeof entry.text === "string") lines.push(entry.text)
    else if (entry.type === "file" && typeof entry.uri === "string") {
      const name = typeof entry.name === "string" && entry.name ? entry.name : entry.uri
      lines.push(`[${name}] ${entry.uri}`)
    }
  }
  return lines.length > 0 ? lines.join("\n") : undefined
}

function toolState(part: SessionMessageAssistantTool): ChatToolState {
  const state = part.state
  if (state.status === "streaming") {
    return { status: "pending", input: {}, raw: state.input }
  }
  if (state.status === "running") {
    return {
      status: "running",
      input: state.input as Record<string, unknown>,
      metadata: state.metadata as Record<string, unknown>,
      title: readString(state.metadata, "title") ?? undefined,
    }
  }
  if (state.status === "completed") {
    return {
      status: "completed",
      input: state.input as Record<string, unknown>,
      output: toolOutput(state.content),
      metadata: state.metadata as Record<string, unknown> | undefined,
      title: readString(state.metadata, "title") ?? undefined,
    }
  }
  return {
    status: "error",
    input: state.input as Record<string, unknown>,
    output: toolOutput(state.content),
    // opencode can report `error` without a payload; never throw while
    // projecting history.
    error: state.error?.message ?? "Tool failed",
    metadata: state.metadata as Record<string, unknown> | undefined,
  }
}

function toChatPart(part: RawContentPart, sessionID: string, messageID: string, key: string): ChatPart {
  if (part.type === "text") {
    return { id: key, sessionID, messageID, type: "text", text: part.text }
  }
  if (part.type === "reasoning") {
    return { id: key, sessionID, messageID, type: "reasoning", text: part.text }
  }
  return {
    id: part.id,
    sessionID,
    messageID,
    type: "tool",
    tool: part.name,
    callID: part.id,
    state: toolState(part as SessionMessageAssistantTool),
  }
}

/** Structural shape shared by projected and event-encoded assistant content. */
type RawContentPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; id: string; name: string; state: unknown }

export type StreamKind = "text" | "reasoning"

/** Part id shared by streaming events and projected snapshots. */
function streamPartID(messageID: string, kind: StreamKind, ordinal: number): string {
  return `${messageID}:${kind}:${ordinal}`
}

/**
 * Projects assistant content with the streaming event ids. opencode v2 numbers
 * text and reasoning ordinals per kind, so the projection must too: otherwise a
 * history refetch mid-stream stores a second part with a different id and the
 * next delta appends to a duplicate.
 */
function projectContent(
  content: ReadonlyArray<RawContentPart>,
  sessionID: string,
  messageID: string,
): ChatPart[] {
  const ordinals: Record<StreamKind, number> = { text: 0, reasoning: 0 }
  return content.map((part) => {
    if (part.type === "tool") return toChatPart(part, sessionID, messageID, part.id)
    const ordinal = ordinals[part.type]
    ordinals[part.type] = ordinal + 1
    return toChatPart(part, sessionID, messageID, streamPartID(messageID, part.type, ordinal))
  })
}

/**
 * Adapts a v2 projected message to MasterHand's `ChatMessage` view model.
 * Non-chat entries (idle, system, shell, compaction, switches) return `null`.
 */
export function toChatMessage(message: SessionMessageInfo, sessionID: string): ChatMessage | null {
  if (message.type === "user") {
    return {
      info: {
        id: message.id,
        sessionID,
        role: "user",
        time: { created: message.time.created },
      },
      parts: [{ id: `${message.id}:text`, sessionID, messageID: message.id, type: "text", text: message.text }],
    }
  }
  if (message.type !== "assistant") return null

  return {
    info: {
      id: message.id,
      sessionID,
      role: "assistant",
      time: {
        created: message.time.created,
        streamed: message.time.streamed,
        completed: message.time.completed,
      },
      agent: message.agent,
      providerID: message.model?.providerID,
      modelID: message.model?.id,
      cost: message.cost,
      tokens: message.tokens,
      error: message.error,
    },
    parts: projectContent(message.content, sessionID, message.id),
  }
}

export function placeholderAssistant(sessionID: string, messageID: string, now = Date.now()): ChatMessage {
  return {
    info: { id: messageID, sessionID, role: "assistant", time: { created: now } },
    parts: [],
  }
}

/**
 * Merges a history projection with the live cache. opencode's projection
 * includes the in-flight assistant message but omits its accumulated text
 * until the step closes (verified against a live 2.0.21 server), so live parts
 * are preserved while the message is incomplete; completed messages are
 * authoritative projections.
 */
export function mergeLiveMessages(
  previous: ChatMessage[] | undefined,
  projected: ChatMessage[],
): ChatMessage[] {
  if (!previous || previous.length === 0) return projected
  const byID = new Map(previous.map((message) => [message.info.id, message]))
  return projected.map((message) => {
    if (message.info.role !== "assistant" || message.info.time.completed !== undefined) return message
    const live = byID.get(message.info.id)
    if (!live) return message

    const merged = message.parts.map((part): ChatPart => {
      const livePart = live.parts.find((item) => item.id === part.id)
      // Tool parts come from the authoritative projection; for streamed text
      // and reasoning, keep the live part when it already has more text.
      if (!livePart) return part
      if (part.type === "text" && livePart.type === "text") {
        return livePart.text.length > part.text.length ? livePart : part
      }
      if (part.type === "reasoning" && livePart.type === "reasoning") {
        return livePart.text.length > part.text.length ? livePart : part
      }
      return part
    })
    const ids = new Set(merged.map((part) => part.id))
    for (const part of live.parts) if (!ids.has(part.id)) merged.push(part)
    return { ...message, parts: merged }
  })
}

function updateMessage(
  list: ChatMessage[],
  sessionID: string,
  messageID: string,
  updater: (message: ChatMessage) => ChatMessage,
  now = Date.now(),
): ChatMessage[] {
  const index = list.findIndex((entry) => entry.info.id === messageID)
  if (index === -1) {
    return [...list, updater(placeholderAssistant(sessionID, messageID, now))]
  }
  const next = [...list]
  next[index] = updater(next[index]!)
  return next
}

function updateParts(
  list: ChatMessage[],
  sessionID: string,
  messageID: string,
  updater: (parts: ChatPart[]) => ChatPart[],
  now?: number,
): ChatMessage[] {
  return updateMessage(
    list,
    sessionID,
    messageID,
    (message) => ({ ...message, parts: updater(message.parts) }),
    now,
  )
}

/** Appends a streaming delta to a text/reasoning part (keyed by its ordinal). */
export function appendDelta(
  list: ChatMessage[],
  event: { sessionID: string; messageID: string; ordinal: number; kind: StreamKind; delta: string },
  now = Date.now(),
): ChatMessage[] {
  const partID = streamPartID(event.messageID, event.kind, event.ordinal)
  return updateParts(
    list,
    event.sessionID,
    event.messageID,
    (parts) => {
      const index = parts.findIndex((part) => part.id === partID)
      if (index === -1) {
        return [
          ...parts,
          { id: partID, sessionID: event.sessionID, messageID: event.messageID, type: event.kind, text: event.delta },
        ]
      }
      const existing = parts[index]!
      if (existing.type !== event.kind) return parts
      const next = [...parts]
      next[index] = { ...existing, text: existing.text + event.delta }
      return next
    },
    now,
  )
}

/** Replaces a text/reasoning part with its final text (the `*.ended` event). */
export function setStreamText(
  list: ChatMessage[],
  event: { sessionID: string; messageID: string; ordinal: number; kind: StreamKind; text: string },
  now = Date.now(),
): ChatMessage[] {
  const partID = streamPartID(event.messageID, event.kind, event.ordinal)
  return updateParts(
    list,
    event.sessionID,
    event.messageID,
    (parts) => {
      const index = parts.findIndex((part) => part.id === partID)
      const part: ChatPart = {
        id: partID,
        sessionID: event.sessionID,
        messageID: event.messageID,
        type: event.kind,
        text: event.text,
      }
      if (index === -1) return [...parts, part]
      const next = [...parts]
      next[index] = part
      return next
    },
    now,
  )
}

/** Inserts or replaces a tool part in the assistant message. */
export function upsertToolPart(
  list: ChatMessage[],
  sessionID: string,
  messageID: string,
  part: ChatToolPart,
  now = Date.now(),
): ChatMessage[] {
  return updateParts(
    list,
    sessionID,
    messageID,
    (parts) => {
      const index = parts.findIndex((item) => item.type === "tool" && item.callID === part.callID)
      if (index === -1) return [...parts, part]
      const next = [...parts]
      next[index] = part
      return next
    },
    now,
  )
}

export function makeToolPart(
  sessionID: string,
  messageID: string,
  callID: string,
  tool: string,
  state: ChatToolState,
): ChatToolPart {
  return { id: callID, sessionID, messageID, type: "tool", tool, callID, state }
}

/** Updates an existing tool part (or creates it from `fallback` when missing). */
export function updateToolPart(
  list: ChatMessage[],
  sessionID: string,
  messageID: string,
  callID: string,
  updater: (part: ChatToolPart) => ChatToolPart,
  fallback: (part: ChatToolPart) => ChatToolPart,
  now = Date.now(),
): ChatMessage[] {
  return updateParts(
    list,
    sessionID,
    messageID,
    (parts) => {
      const index = parts.findIndex((item) => item.type === "tool" && item.callID === callID)
      if (index === -1) return [...parts, fallback(makeToolPart(sessionID, messageID, callID, callID, { status: "pending", input: {} }))]
      const next = [...parts]
      next[index] = updater(next[index] as ChatToolPart)
      return next
    },
    now,
  )
}

export function setMessageCost(
  list: ChatMessage[],
  sessionID: string,
  messageID: string,
  usage: { cost?: number; tokens?: TokenUsageInfo; finish?: string },
): ChatMessage[] {
  return updateMessage(list, sessionID, messageID, (message) => ({
    ...message,
    info: {
      ...message.info,
      cost: usage.cost ?? message.info.cost,
      tokens: usage.tokens ?? message.info.tokens,
      time: usage.finish
        ? { ...message.info.time, completed: message.info.time.completed ?? Date.now(), streamed: Date.now() }
        : message.info.time,
    },
  }))
}

export interface SessionUsage {
  cost: number
  tokens: number
}

export function sessionUsage(messages: ChatMessage[]): SessionUsage {
  let cost = 0
  let tokens = 0
  for (const message of messages) {
    if (message.info.role !== "assistant") continue
    cost += message.info.cost ?? 0
    tokens += message.info.tokens?.output ?? 0
  }
  return { cost, tokens }
}

export function toolTitle(part: ChatToolPart): string {
  const state = part.state
  if (state.status === "running" || state.status === "completed") return state.title ?? part.tool
  if (state.status === "error") return "Error"
  return "Preparing…"
}

/** True when the tool part is opencode's `subagent` tool (a subagent run). */
export function isTaskTool(part: ChatPart): part is ChatToolPart {
  return part.type === "tool" && part.tool === "subagent"
}

export interface SubagentInfo {
  name: string
  description: string
  prompt: string | null
  sessionID: string | null
  background: boolean
}

/** Normalizes the `subagent` tool part into the fields the UI renders. */
export function subagentInfo(part: ChatToolPart): SubagentInfo {
  const state = part.state
  return {
    name: readString(state.input, "agent") ?? "subagent",
    description: readString(state.input, "description") ?? toolTitle(part),
    prompt: readString(state.input, "prompt"),
    sessionID: readString(state.metadata, "sessionID") ?? readString(state.metadata, "sessionId"),
    background: state.metadata?.background === true,
  }
}

/** Inner text of the `subagent` tool output, without its wrapper tags. */
export function subagentOutput(part: ChatToolPart): string | null {
  const state = part.state
  if (state.status !== "completed" || !state.output) return null
  const text = state.output
    .replace(/<subagent\b[^>]*>|<\/subagent>/g, "")
    .replace(/<task\b[^>]*>|<\/task>/g, "")
    .replace(/<summary>[\s\S]*?<\/summary>/g, "")
    .replace(/<\/?task_(result|error)>/g, "")
    .trim()
  return text.length > 0 ? text : null
}

export function directoryName(directory: string): string {
  const parts = directory.split("/").filter(Boolean)
  return parts[parts.length - 1] ?? directory
}

export function formatRelative(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  if (seconds < 60) return "now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} d ago`
  return new Date(timestamp).toLocaleDateString()
}


