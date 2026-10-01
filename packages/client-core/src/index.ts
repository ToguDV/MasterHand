export * from "./types"
export { ApiError, createClient, type Client, type ClientOptions } from "./client"
export { opencodeErrorMessage, previewErrorMessage } from "./errors"
export { createEventStream, type EventStream, type EventStreamOptions } from "./events"
export { parseSseStream, type SseMessage } from "./sse"
export {
  appendDelta,
  directoryName,
  formatRelative,
  hasVisibleParts,
  isStreaming,
  isTaskTool,
  makeToolPart,
  messageText,
  partsFromContent,
  placeholderAssistant,
  removeMessage,
  replaceParts,
  sessionUsage,
  setMessageCost,
  setStreamText,
  splitFences,
  subagentInfo,
  subagentOutput,
  toChatMessage,
  toolTitle,
  updateToolPart,
  upsertMessage,
  upsertToolPart,
  type SessionUsage,
  type StreamKind,
  type SubagentInfo,
  type TextSegment,
} from "./chat"
export {
  defaultModelValue,
  flattenModels,
  parseModel,
  recentModelValue,
  selectableAgents,
  sessionModelValue,
  variantLabel,
  type FlatModelOption,
} from "./models"
export {
  createEventHandler,
  invalidateOnReconnect,
  queryKeys,
  useAgents,
  useBffStatus,
  useEventStream,
  useMessages,
  useModels,
  usePreview,
  useSessionDirectories,
  useSessionStatuses,
  useSessions,
  useWorkspaces,
  type EventHandlerCallbacks,
  type UseEventStreamOptions,
} from "./hooks"
export { filterSessions, sessionDirectory, type SessionFilter } from "./sessions"
