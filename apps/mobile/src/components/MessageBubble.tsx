import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import Markdown, { darkStyles, type MarkdownStyleMap } from "@ronradtke/react-native-markdown-display"
import {
  formatSpeed,
  formatTokens,
  isQuestionTool,
  isTaskTool,
  subagentInfo,
  subagentOutput,
  tokenCounts,
  tokenSpeed,
  toolTitle,
  type ChatMessage,
  type ChatPart,
  type ChatReasoningPart,
  type ChatTextPart,
  type ChatToolPart,
  type FormAnswer,
  type FormInfo,
} from "@masterhand/client-core"
import { colors } from "../theme"
import { statusColor } from "./tools/theme"
import { ToolCard } from "./tools/ToolCard"
import { QuestionCard } from "./QuestionCard"

// Assistant output is markdown: render it as such. The library ships a complete
// dark preset; only the palette is overridden to match the app theme.
const markdownStyles: MarkdownStyleMap = {
  ...darkStyles,
  body: { color: colors.text, fontSize: 15, lineHeight: 22 },
  paragraph: { ...darkStyles.paragraph, marginTop: 4, marginBottom: 4 },
  heading1: { ...darkStyles.heading1, color: colors.text, fontWeight: "700", marginTop: 8, marginBottom: 4 },
  heading2: { ...darkStyles.heading2, color: colors.text, fontWeight: "700", marginTop: 8, marginBottom: 4 },
  heading3: { ...darkStyles.heading3, color: colors.text, fontWeight: "700", marginTop: 6, marginBottom: 2 },
  heading4: { ...darkStyles.heading4, color: colors.text, fontWeight: "700", marginTop: 6, marginBottom: 2 },
  heading5: { ...darkStyles.heading5, color: colors.muted, fontWeight: "700", marginTop: 6, marginBottom: 2 },
  heading6: { ...darkStyles.heading6, color: colors.muted, fontWeight: "700", marginTop: 6, marginBottom: 2 },
  hr: { backgroundColor: colors.border, height: StyleSheet.hairlineWidth },
  blockquote: {
    ...darkStyles.blockquote,
    backgroundColor: "transparent",
    borderColor: colors.border,
    borderLeftWidth: 2,
    marginLeft: 0,
    paddingHorizontal: 8,
  },
  link: { ...darkStyles.link, color: "#818cf8" },
  blocklink: { ...darkStyles.blocklink, borderColor: colors.border },
  code_inline: {
    ...darkStyles.code_inline,
    borderWidth: 0,
    backgroundColor: colors.surfaceMuted,
    color: "#e4e4e7",
    padding: 0,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  code_block: {
    ...darkStyles.code_block,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: "#000000",
    color: "#d4d4d8",
    padding: 10,
    borderRadius: 8,
  },
  fence: { ...darkStyles.fence, borderColor: colors.border, borderRadius: 8 },
  fence_header: { ...darkStyles.fence_header, backgroundColor: colors.surface, borderBottomColor: colors.border },
  fence_language_label: { ...darkStyles.fence_language_label, color: colors.muted },
  fence_code: { ...darkStyles.fence_code, backgroundColor: "#000000" },
  table: { ...darkStyles.table, borderColor: colors.border, borderRadius: 6 },
  tr: { ...darkStyles.tr, borderColor: colors.border },
  th: { ...darkStyles.th, color: colors.text, fontWeight: "700", backgroundColor: colors.surface },
  td: { ...darkStyles.td, color: colors.text },
}

function MarkdownText({ text }: { text: string }) {
  if (!text.trim()) return null
  return (
    <Markdown colorScheme="dark" style={markdownStyles}>
      {text}
    </Markdown>
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

interface PartViewProps {
  part: ChatPart
  onOpenSession?: (id: string) => void
  forms: FormInfo[]
  answeredForms: Array<{ form: FormInfo; answer: FormAnswer }>
  busyFormID: string | null
  onRespondForm?: (form: FormInfo, answer: FormAnswer) => void
  onCancelForm?: (form: FormInfo) => void
}

function PartView({ part, onOpenSession, forms, answeredForms, busyFormID, onRespondForm, onCancelForm }: PartViewProps) {
  switch (part.type) {
    case "text":
      return <MarkdownText text={part.text} />
    case "reasoning":
      return <Reasoning text={part.text} />
    case "tool":
      if (isTaskTool(part)) return <Subagent part={part} onOpenSession={onOpenSession} />
      if (isQuestionTool(part) && onRespondForm && onCancelForm) {
        return (
          <QuestionCard
            part={part}
            forms={forms}
            answeredForms={answeredForms}
            busyFormID={busyFormID}
            onRespond={onRespondForm}
            onCancel={onCancelForm}
          />
        )
      }
      return <ToolCard part={part} />
    default:
      return null
  }
}

export function MessageBubble({
  entry,
  onOpenSession,
  forms = [],
  answeredForms = [],
  busyFormID = null,
  onRespondForm,
  onCancelForm,
}: {
  entry: ChatMessage
  onOpenSession?: (id: string) => void
  forms?: FormInfo[]
  answeredForms?: Array<{ form: FormInfo; answer: FormAnswer }>
  busyFormID?: string | null
  onRespondForm?: (form: FormInfo, answer: FormAnswer) => void
  onCancelForm?: (form: FormInfo) => void
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
  const counts = tokenCounts(info.tokens)
  const breakdown = formatTokens(counts)
  const speed = formatSpeed(tokenSpeed(counts, (info.time.completed ?? 0) - info.time.created))

  return (
    <View style={styles.assistantBlock}>
      {visible.map((part) => (
        <PartView
          key={part.id}
          part={part}
          onOpenSession={onOpenSession}
          forms={forms}
          answeredForms={answeredForms}
          busyFormID={busyFormID}
          onRespondForm={onRespondForm}
          onCancelForm={onCancelForm}
        />
      ))}
      {streaming && visible.length === 0 ? <Text style={styles.caption}>Thinking…</Text> : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
      {info.time.completed !== undefined ? (
        <Text style={styles.caption}>
          {info.modelID}
          {(info.cost ?? 0) > 0 ? ` · $${(info.cost ?? 0).toFixed(4)}` : ""}
          {breakdown ? ` · ${breakdown}` : ""}
          {speed ? ` · ${speed}` : ""}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
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
  codeText: {
    color: "#d4d4d8",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
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
