import type { Agent, Message, Part, Provider, Session as OpenCodeSession, SessionStatus } from "@opencode-ai/sdk"

export type {
  Message,
  UserMessage,
  AssistantMessage,
  Part,
  Event,
  FileDiff,
  Todo,
  SessionStatus,
  TextPart,
  ReasoningPart,
  ToolPart,
  ToolState,
  Agent,
  Provider,
  Config,
  Project,
} from "@opencode-ai/sdk"

/**
 * A pending opencode permission request, as carried by the `permission.asked`
 * event and `GET /permission` (verified against opencode 1.18.32).
 *
 * The published SDK still describes the older `permission.updated` payload
 * (`type`, `pattern`, `title`, `time`), which the server no longer emits, so
 * MasterHand models the real shape here.
 */
export interface Permission {
  id: string
  sessionID: string
  /** Permission kind, e.g. "bash", "edit". */
  permission: string
  /** Affected resources (commands, paths, globs). */
  patterns: string[]
  metadata?: Record<string, unknown>
  /** Patterns the "always" answer would persist. */
  always?: string[]
  tool?: { messageID: string; callID: string }
}

/**
 * The model a session last ran with. opencode persists it per session and
 * returns it from `GET /session`, but the published SDK types do not declare
 * the field yet.
 */
/** Subtask part emitted by opencode when the `task` tool runs a subagent. */
export interface SubtaskPart {
  id: string
  sessionID: string
  messageID: string
  type: "subtask"
  prompt: string
  description: string
  agent: string
}

export interface SessionModel {
  id: string
  providerID: string
  variant?: string
}

export interface Session extends OpenCodeSession {
  agent?: string
  model?: SessionModel
}

export interface DeviceRecord {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number
}

export interface WorkspaceRecord {
  id: string
  name: string
  path: string
  createdAt: number
}

export interface CreateWorkspaceInput {
  name: string
}

export interface BffStatus {
  ok: boolean
  opencode?: {
    healthy: boolean
    version?: string
  }
}

export interface DeviceLoginResponse {
  token: string
  device: DeviceRecord
}

export interface MessageWithPartsResponse {
  info: Message
  parts: Part[]
}

export interface ModelInfo {
  id: string
  name: string
  variants?: Record<string, Record<string, unknown>>
}

export interface ProviderInfo extends Omit<Provider, "models"> {
  models: Record<string, ModelInfo>
}

export interface AgentInfo extends Agent {
  hidden?: boolean
}

export interface ProvidersResponse {
  providers: ProviderInfo[]
  default: Record<string, string>
}

export type SessionStatuses = Record<string, SessionStatus>

export interface PromptBody {
  parts: Array<{ type: "text"; text: string }>
  agent?: string
  variant?: string
  model?: { providerID: string; modelID: string }
}

export type PermissionResponse = "once" | "always" | "reject"
