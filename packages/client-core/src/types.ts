import type {
  AgentInfo,
  ModelInfo,
  ModelRef,
  PermissionRequest,
  ProviderInfo,
  SessionInfo,
  SessionStructuredError,
  SessionStatus,
  TokenUsageInfo,
} from "@opencode/client"

export type {
  AgentInfo,
  ModelInfo,
  ModelRef,
  ModelVariant,
  PermissionRequest,
  ProviderInfo,
  SessionInfo,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  SessionMessageUser,
  SessionStatus,
  SessionStructuredError,
  TokenUsageInfo,
  V2Event,
} from "@opencode/client"

/**
 * A pending opencode permission request (v2 `Permission.Request`). Also carried
 * by the `permission.asked` event and `GET /api/permission/request`.
 */
export type Permission = PermissionRequest

export type PermissionResponse = "once" | "always" | "reject"

/** The model a session last ran with (opencode persists it per session). */
export type SessionModel = ModelRef

/**
 * MasterHand metadata for a session running in its own git worktree
 * (isolated mode). Added by the BFF; opencode itself knows nothing about it.
 */
export interface SessionIsolation {
  isolated: true
  /** Worktree directory the session runs in (its opencode location). */
  worktreePath: string
  /** Branch checked out in the worktree (unique per worktree). */
  branch: string
  /** Branch/commit the worktree was created from. */
  baseRef: string
  pushed?: boolean
  prUrl?: string | null
}

export interface Session extends SessionInfo {
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

export type SessionStatuses = Record<string, SessionStatus>

/** Catalog used by the model selector: models, providers and the server default. */
export interface ModelsCatalog {
  models: ModelInfo[]
  providers: ProviderInfo[]
  defaultModel: ModelInfo | null
}

export interface PromptInput {
  text: string
  /** Agent id to run the turn with (switched before prompting when it changed). */
  agent?: string
  /** Model (and optional variant) to run the turn with. */
  model?: ModelRef
}

/** Current agent/model of the session, used to avoid redundant switch calls. */
export interface PromptContext {
  agent?: string
  model?: ModelRef
}

/** Normalized chat view model shared by web and mobile. */
export interface ChatMessageInfo {
  id: string
  sessionID: string
  role: "user" | "assistant"
  time: { created: number; streamed?: number; completed?: number }
  agent?: string
  providerID?: string
  modelID?: string
  cost?: number
  tokens?: TokenUsageInfo
  error?: SessionStructuredError
}

export type ChatToolStatus = "pending" | "running" | "completed" | "error"

export interface ChatToolState {
  status: ChatToolStatus
  title?: string
  input: Record<string, unknown>
  output?: string
  error?: string
  metadata?: Record<string, unknown>
  /** Raw (partial) JSON while the tool input is still streaming. */
  raw?: string
}

export type ChatTextPart = {
  id: string
  sessionID: string
  messageID: string
  type: "text"
  text: string
}

export type ChatReasoningPart = {
  id: string
  sessionID: string
  messageID: string
  type: "reasoning"
  text: string
}

export type ChatToolPart = {
  id: string
  sessionID: string
  messageID: string
  type: "tool"
  tool: string
  callID: string
  state: ChatToolState
}

/** Kept for compatibility with the previous subagent card model. */
export type ChatSubtaskPart = {
  id: string
  sessionID: string
  messageID: string
  type: "subtask"
  prompt: string
  description: string
  agent: string
}

export type ChatPart = ChatTextPart | ChatReasoningPart | ChatToolPart | ChatSubtaskPart

export interface ChatMessage {
  info: ChatMessageInfo
  parts: ChatPart[]
}
