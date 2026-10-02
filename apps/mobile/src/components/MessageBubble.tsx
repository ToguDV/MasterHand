import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import {
  isTaskTool,
  splitFences,
  subagentInfo,
  subagentOutput,
  toolTitle,
  type ChatMessage,
  type ChatPart,
  type ChatReasoningPart,
  type ChatTextPart,
  type ChatToolPart,
} from "@masterhand/client-core"
import { colors } from "../theme"

function SegmentText({ text }: { text: string }) {
  const segments = splitFences(text)
  return (
    <View style={styles.segments}>
      {segments.map((segment, index) =>
        segment.type === "code" ? (
          <View key={index} style={styles.codeBlock}>
            <Text style={styles.codeText}>{segment.content}</Text>
          </View>
        ) : (
          <Text key={index} style={styles.bodyText}>
            {segment.content.trimEnd()}
          </Text>
        ),
      )}
    </View>
  )
}

function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <View>
      <Pressable onPress={() => setOpen((value) => !value)}>
        <Text style={styles.caption}>{open ? "▾ Reasoning" : "▸ Reasoning"}</Text>
      </Pressable>
      {open && <Text style={styles.reasoningText}>{text}</Text>}
    </View>
  )
}

function statusColor(status: ChatToolPart["state"]["status"]): string {
  return status === "completed"
    ? colors.success
    : status === "error"
      ? colors.danger
      : status === "running"
        ? colors.warning
        : colors.muted
}

function Tool({ part }: { part: ChatToolPart }) {
  const [open, setOpen] = useState(false)
  const state = part.state

  return (
    <View style={styles.toolCard}>
      <Pressable style={styles.toolHeader} onPress={() => setOpen((value) => !value)}>
        <View style={[styles.dot, { backgroundColor: statusColor(state.status) }]} />
        <Text style={styles.toolName}>{part.tool}</Text>
        <Text style={styles.toolTitle} numberOfLines={1}>
          {toolTitle(part)}
        </Text>
        <Text style={styles.caption}>{state.status}</Text>
      </Pressable>
      {open && (
        <View style={styles.toolBody}>
          <Text style={styles.codeText}>{JSON.stringify(state.input, null, 2)}</Text>
          {state.status === "completed" && state.output ? (
            <Text style={[styles.codeText, styles.toolOutput]} numberOfLines={40}>
              {state.output}
            </Text>
          ) : null}
          {state.status === "error" ? <Text style={styles.errorText}>{state.error}</Text> : null}
        </View>
      )}
    </View>
  )
}

function Subagent({ part, onOpenSession }: { part: ChatToolPart; onOpenSession?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const state = part.state
  const info = subagentInfo(part)
  const output = subagentOutput(part)

  return (
    <View style={styles.subagentCard}>
      <Pressable style={styles.toolHeader} onPress={() => setOpen((value) => !value)}>
        <View style={[styles.dot, { backgroundColor: statusColor(state.status) }]} />
        <Text style={styles.subagentBadge}>SUBAGENT</Text>
        <Text style={styles.subagentName} numberOfLines={1}>
          {info.name}
        </Text>
        <Text style={styles.toolTitle} numberOfLines={1}>
          {info.description}
        </Text>
        <Text style={styles.caption}>{state.status}</Text>
      </Pressable>
      {open && (
        <View style={styles.toolBody}>
          {info.prompt ? <Text style={styles.codeText}>{info.prompt}</Text> : null}
          {output ? (
            <Text style={[styles.codeText, styles.toolOutput]} numberOfLines={40}>
              {output}
            </Text>
          ) : null}
          {state.status === "error" ? <Text style={styles.errorText}>{state.error}</Text> : null}
        </View>
      )}
      {info.sessionID && onOpenSession ? (
        <Pressable style={styles.subagentOpen} onPress={() => onOpenSession(info.sessionID!)}>
          <Text style={styles.subagentOpenText}>Open session →</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function PartView({
  part,
  onOpenSession,
}: {
  part: ChatPart
  onOpenSession?: (id: string) => void
}) {
  switch (part.type) {
    case "text":
      return <SegmentText text={part.text} />
    case "reasoning":
      return <Reasoning text={part.text} />
    case "tool":
      return isTaskTool(part) ? (
        <Subagent part={part} onOpenSession={onOpenSession} />
      ) : (
        <Tool part={part} />
      )
    default:
      return null
  }
}

export function MessageBubble({
  entry,
  onOpenSession,
}: {
  entry: ChatMessage
  onOpenSession?: (id: string) => void
}) {
  const info = entry.info

  if (info.role === "user") {
    const text = entry.parts
      .filter((part): part is ChatTextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n")
    if (!text.trim()) return null
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.bodyText}>{text}</Text>
        </View>
      </View>
    )
  }

  const visible = entry.parts
  const streaming = info.time.completed === undefined
  const errorMessage = info.error ? info.error.message || "Agent error" : null

  return (
    <View style={styles.assistantBlock}>
      {visible.map((part) => (
        <PartView key={part.id} part={part} onOpenSession={onOpenSession} />
      ))}
      {streaming && visible.length === 0 ? <Text style={styles.caption}>Thinking…</Text> : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {info.time.completed !== undefined ? (
        <Text style={styles.caption}>
          {info.modelID}
          {(info.cost ?? 0) > 0 ? ` · $${(info.cost ?? 0).toFixed(4)}` : ""}
          {(info.tokens?.output ?? 0) > 0 ? ` · ${info.tokens?.output} tok` : ""}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  segments: {
    gap: 8,
  },
  bodyText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  userRow: {
    alignItems: "flex-end",
  },
  userBubble: {
    maxWidth: "85%",
    backgroundColor: "#312e81",
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  assistantBlock: {
    gap: 8,
  },
  caption: {
    color: colors.muted,
    fontSize: 12,
  },
  reasoningText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  codeBlock: {
    backgroundColor: "#000000",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 10,
  },
  codeText: {
    color: "#d4d4d8",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  toolCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  toolHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  toolName: {
    color: colors.muted,
    fontFamily: "monospace",
    fontSize: 12,
  },
  toolTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },
  toolBody: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: 10,
  },
  toolOutput: {
    maxHeight: 240,
  },
  subagentCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentMuted,
    borderRadius: 8,
    backgroundColor: "rgba(99, 102, 241, 0.08)",
    overflow: "hidden",
  },
  subagentBadge: {
    color: "#a5b4fc",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  subagentName: {
    color: "#a5b4fc",
    fontFamily: "monospace",
    fontSize: 12,
  },
  subagentOpen: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.accentMuted,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  subagentOpenText: {
    color: "#a5b4fc",
    fontSize: 12,
    fontWeight: "600",
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
})
