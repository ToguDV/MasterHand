import type { Agent, Message, Part, Provider, SessionStatus } from "@opencode-ai/sdk"

export type {
  Session,
  Message,
  UserMessage,
  AssistantMessage,
  Part,
  Permission,
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

export interface DeviceRecord {
  id: string
  name: string
  createdAt: number
  lastUsedAt: number
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
