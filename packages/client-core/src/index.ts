export * from "./types"
export { ApiError, createClient, type Client, type ClientOptions } from "./client"
export { opencodeErrorMessage, previewErrorMessage } from "./errors"
export { createEventStream, type EventStream, type EventStreamOptions } from "./events"
export { parseSseStream, type SseMessage } from "./sse"
export {
  directoryName,
  formatRelative,
  hasVisibleParts,
  isStreaming,
  isTaskTool,
  mergePart,
  messageText,
  removeMessage,
  removePart,
  sessionUsage,
  splitFences,
  subagentInfo,
  subagentOutput,
  toolTitle,
  upsertMessage,
  upsertPart,
  type MessageWithParts,
  type SessionUsage,
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
  useConfig,
  useEventStream,
  useMessages,
  usePreview,
  useProviders,
  useSessionDirectories,
  useSessionStatuses,
  useSessions,
  useWorkspaces,
  type EventHandlerCallbacks,
  type UseEventStreamOptions,
} from "./hooks"
export { filterSessions, sessionDirectory, type SessionFilter } from "./sessions"
