import type { Message, Part, TextPart, ToolPart } from "./types"

export interface MessageWithParts {
  info: Message
  parts: Part[]
}

export function mergePart(existing: Part | undefined, incoming: Part, delta?: string): Part {
  if (existing && existing.type === "text" && incoming.type === "text" && delta) {
    const current = existing as TextPart
    const next = incoming as TextPart
    if (next.text === current.text) {
      return { ...next, text: current.text + delta }
    }
  }
  return incoming
}

export function upsertMessage(list: MessageWithParts[], info: Message): MessageWithParts[] {
  const index = list.findIndex((entry) => entry.info.id === info.id)
  if (index === -1) return [...list, { info, parts: [] }]
  const next = [...list]
  next[index] = { ...next[index]!, info }
  return next
}

export function upsertPart(list: MessageWithParts[], part: Part, delta?: string): MessageWithParts[] {
  let found = false
  const next = list.map((entry) => {
    if (entry.info.id !== part.messageID) return entry
    found = true
    const parts = [...entry.parts]
    const index = parts.findIndex((item) => item.id === part.id)
    if (index === -1) parts.push(mergePart(undefined, part, delta))
    else parts[index] = mergePart(parts[index], part, delta)
    return { ...entry, parts }
  })
  return found ? next : list
}

export function removePart(list: MessageWithParts[], messageID: string, partID: string): MessageWithParts[] {
  return list.map((entry) =>
    entry.info.id === messageID
      ? { ...entry, parts: entry.parts.filter((part) => part.id !== partID) }
      : entry,
  )
}

export function removeMessage(list: MessageWithParts[], messageID: string): MessageWithParts[] {
  return list.filter((entry) => entry.info.id !== messageID)
}

export interface SessionUsage {
  cost: number
  tokens: number
}

export function sessionUsage(messages: MessageWithParts[]): SessionUsage {
  let cost = 0
  let tokens = 0
  for (const entry of messages) {
    if (entry.info.role !== "assistant") continue
    cost += entry.info.cost
    tokens += entry.info.tokens.output
  }
  return { cost, tokens }
}

export function messageText(entry: MessageWithParts): string {
  return entry.parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

export function isStreaming(entry: MessageWithParts): boolean {
  return entry.info.role === "assistant" && entry.info.time.completed === undefined
}

export function hasVisibleParts(entry: MessageWithParts): boolean {
  return entry.parts.some((part) => part.type !== "step-start" && part.type !== "step-finish")
}

export function toolTitle(part: ToolPart): string {
  const state = part.state
  if (state.status === "running" && state.title) return state.title
  if (state.status === "completed") return state.title
  if (state.status === "error") return "Error"
  return "Preparing…"
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

export interface TextSegment {
  type: "text" | "code"
  content: string
  language?: string
}

export function splitFences(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  const pattern = /```([\w-]*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, match.index) })
    }
    segments.push({ type: "code", content: match[2] ?? "", language: match[1] || undefined })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) })
  }
  return segments.filter((segment) => segment.content.trim().length > 0)
}
