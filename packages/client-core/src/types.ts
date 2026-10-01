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

/**
 * MasterHand metadata for a session running in its own git worktree
 * (isolated mode). Added by the BFF; opencode itself knows nothing about it.
 */
export interface SessionIsolation {
  isolated: true
  /** Worktree directory the session runs in (its opencode `directory`). */
  worktreePath: string
  /** Branch checked out in the worktree (unique per worktree). */
  branch: string
  /** Branch/commit the worktree was created from. */
  baseRef: string
  pushed?: boolean
  prUrl?: string | null
}

export interface Session extends OpenCodeSession {
  agent?: string
  model?: SessionModel
  isolation?: SessionIsolation
}

export interface CreateSessionInput {
  /** Run the session in its own git worktree instead of the workspace folder. */
  isolated?: boolean
}

export interface FinishSessionResult {
  committed: boolean
  pushed: boolean
  prUrl: string | null
  branch: string
  path: string
  /** Push failure detail, when the branch could not be pushed. */
  error: string | null
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
  preview?: PreviewAvailability
}

export interface PreviewPortRange {
  min: number
  max: number
}

export interface PreviewAvailability {
  enabled: boolean
  available: boolean
  portRange: PreviewPortRange
}

export type PreviewPhase = "stopped" | "starting" | "running" | "error"

/** State of a session's Cloudflare quick-tunnel preview, owned by the BFF. */
export interface PreviewStatus {
  status: PreviewPhase
  /** Public trycloudflare.com URL while the tunnel is running. */
  url: string | null
  /** Port reserved for the session's dev server (null until first used). */
  port: number | null
  error: string | null
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
