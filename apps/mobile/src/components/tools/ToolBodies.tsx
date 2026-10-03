import { Fragment, useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import {
  looksLineNumbered,
  truncateLines,
  type DiffLine,
  type KeyValueEntry,
  type TodoItem,
} from "@masterhand/client-core"
import { colors } from "../../theme"

/** Monospace block with optional line numbers and a "show all" toggle. */
export function CodeBlock({
  text,
  title,
  maxLines = 24,
  numbered = true,
}: {
  text: string
  title?: string
  maxLines?: number
  numbered?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const showNumbers = numbered && !looksLineNumbered(text)
  const truncated = truncateLines(text, expanded ? Number.POSITIVE_INFINITY : maxLines)
  const lines = truncated.text.split("\n")

  return (
    <View style={styles.block}>
      {title || truncated.hiddenLines > 0 ? (
        <View style={styles.blockHeader}>
          <Text style={styles.blockTitle} numberOfLines={1}>
            {title}
          </Text>
          {truncated.hiddenLines > 0 ? (
            <Pressable onPress={() => setExpanded(true)}>
              <Text style={styles.showAll}>Show all ({truncated.totalLines} lines)</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={styles.blockBody}>
        {lines.map((line, index) => (
          <View key={index} style={styles.codeRow}>
            {showNumbers ? <Text style={styles.lineNumber}>{index + 1}</Text> : null}
            <Text selectable style={styles.codeText}>
              {line || " "}
            </Text>
          </View>
        ))}
        {truncated.hiddenLines > 0 ? (
          <Text style={styles.moreLines}>… {truncated.hiddenLines} more lines</Text>
        ) : null}
      </View>
    </View>
  )
}

/** Terminal-style block: command line, working directory and output. */
export function TerminalBody({
  command,
  cwd,
  output,
  running,
}: {
  command: string
  cwd?: string
  output?: string
  running: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const truncated = truncateLines(output ?? "", expanded ? Number.POSITIVE_INFINITY : 30)

  return (
    <View style={styles.terminal}>
      <View style={styles.commandRow}>
        <Text style={styles.commandPrompt}>$</Text>
        <Text selectable style={styles.commandText}>
          {command}
        </Text>
      </View>
      {cwd ? <Text style={styles.cwd}>{cwd}</Text> : null}
      {output ? (
        <>
          <Text selectable style={styles.terminalOutput}>
            {truncated.text}
          </Text>
          {truncated.hiddenLines > 0 ? (
            <Pressable onPress={() => setExpanded(true)} style={styles.showAllRow}>
              <Text style={styles.showAll}>… {truncated.hiddenLines} more lines (show all)</Text>
            </Pressable>
          ) : null}
        </>
      ) : running ? (
        <Text style={styles.mutedText}>Running…</Text>
      ) : null}
    </View>
  )
}

function diffRowColor(kind: DiffLine["kind"], text: string): string {
  if (kind === "add") return "rgba(16, 185, 129, 0.10)"
  if (kind === "remove") return "rgba(239, 68, 68, 0.10)"
  if (text.startsWith("@@")) return "rgba(39, 39, 42, 0.6)"
  return "transparent"
}

function diffTextColor(kind: DiffLine["kind"], text: string): string {
  if (kind === "add") return "#a7f3d0"
  if (kind === "remove") return "#fecaca"
  if (text.startsWith("@@")) return colors.muted
  return "#d4d4d8"
}

/** Unified line diff with +/− coloring and a row cap. */
export function DiffView({ diff }: { diff: DiffLine[] }) {
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? diff : diff.slice(0, 160)
  const hidden = diff.length - rows.length
  return (
    <View style={styles.block}>
      <View style={styles.blockBody}>
        {rows.map((line, index) => (
          <View key={index} style={[styles.diffRow, { backgroundColor: diffRowColor(line.kind, line.text) }]}>
            <Text style={[styles.diffSign, { color: diffTextColor(line.kind, line.text) }]}>
              {line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "}
            </Text>
            <Text selectable style={[styles.codeText, { color: diffTextColor(line.kind, line.text) }]}>
              {line.text || " "}
            </Text>
          </View>
        ))}
        {hidden > 0 ? (
          <Pressable onPress={() => setExpanded(true)} style={styles.showAllRow}>
            <Text style={styles.showAll}>… {hidden} more lines (show all)</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

/** Fallback body for unknown tools: readable key/value rows instead of raw JSON. */
export function KeyValueList({ entries }: { entries: KeyValueEntry[] }) {
  if (entries.length === 0) return null
  return (
    <View style={[styles.block, styles.kvBody]}>
      {entries.map((entry) => (
        <View key={entry.key} style={styles.kvRow}>
          <Text style={styles.kvKey} numberOfLines={1}>
            {entry.key}
          </Text>
          <Text selectable style={styles.kvValue}>
            {entry.value}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** Search results: one monospace row per match, pattern highlighted. */
export function SearchBody({ pattern, matches }: { pattern: string; matches: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (matches.length === 0) return <Text style={styles.mutedText}>No matches</Text>
  const shown = expanded ? matches : matches.slice(0, 40)
  return (
    <View style={styles.block}>
      {shown.map((line, index) => (
        <View key={index} style={styles.searchRow}>
          <Text numberOfLines={1} style={styles.searchText}>
            <Highlight text={line} pattern={pattern} />
          </Text>
        </View>
      ))}
      {matches.length > shown.length ? (
        <Pressable onPress={() => setExpanded(true)} style={styles.showAllRow}>
          <Text style={styles.showAll}>… {matches.length - shown.length} more matches (show all)</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function Highlight({ text, pattern }: { text: string; pattern: string }) {
  if (!pattern) return <>{text}</>
  let regex: RegExp
  try {
    regex = new RegExp(pattern, "gi")
  } catch {
    return <>{text}</>
  }
  const parts = text.split(regex)
  const matches = text.match(regex) ?? []
  if (matches.length === 0) return <>{text}</>
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < matches.length ? <Text style={styles.highlight}>{matches[index]}</Text> : null}
        </Fragment>
      ))}
    </>
  )
}

const TODO_GLYPHS: Record<string, { icon: string; color: string }> = {
  completed: { icon: "✓", color: colors.success },
  in_progress: { icon: "▸", color: colors.warning },
  cancelled: { icon: "✕", color: colors.muted },
  pending: { icon: "○", color: colors.muted },
}

/** Checklist for the todo tool. */
export function TodoBody({ todos }: { todos: TodoItem[] }) {
  if (todos.length === 0) return null
  return (
    <View style={[styles.block, styles.kvBody]}>
      {todos.map((todo, index) => {
        const glyph = TODO_GLYPHS[todo.status] ?? TODO_GLYPHS.pending!
        return (
          <View key={index} style={styles.todoRow}>
            <Text style={[styles.todoIcon, { color: glyph.color }]}>{glyph.icon}</Text>
            <Text style={[styles.todoText, todo.status === "completed" && styles.todoDone]}>{todo.content}</Text>
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  block: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "#0b0b0d",
    overflow: "hidden",
  },
  blockHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  blockTitle: {
    flex: 1,
    color: colors.muted,
    fontFamily: "monospace",
    fontSize: 11,
  },
  showAll: {
    color: colors.muted,
    fontSize: 10,
  },
  showAllRow: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  blockBody: {
    padding: 8,
  },
  codeRow: {
    flexDirection: "row",
    gap: 8,
  },
  lineNumber: {
    width: 22,
    textAlign: "right",
    color: "#52525b",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 18,
  },
  codeText: {
    flex: 1,
    color: "#d4d4d8",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 18,
  },
  moreLines: {
    color: "#52525b",
    fontSize: 10,
    marginTop: 2,
  },
  terminal: {
    gap: 6,
  },
  commandRow: {
    flexDirection: "row",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16, 185, 129, 0.18)",
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  commandPrompt: {
    color: "#34d399",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  commandText: {
    flex: 1,
    color: "#e4e4e7",
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 18,
  },
  cwd: {
    color: "#52525b",
    fontFamily: "monospace",
    fontSize: 10,
  },
  terminalOutput: {
    color: "#d4d4d8",
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    padding: 10,
  },
  diffRow: {
    flexDirection: "row",
    gap: 6,
    borderRadius: 3,
    paddingHorizontal: 4,
  },
  diffSign: {
    width: 10,
    fontFamily: "monospace",
    fontSize: 11,
    lineHeight: 18,
  },
  kvBody: {
    padding: 10,
    gap: 6,
  },
  kvRow: {
    flexDirection: "row",
    gap: 8,
  },
  kvKey: {
    width: 96,
    color: colors.muted,
    fontFamily: "monospace",
    fontSize: 11,
  },
  kvValue: {
    flex: 1,
    color: "#d4d4d8",
    fontSize: 11,
    lineHeight: 16,
  },
  searchRow: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  searchText: {
    color: "#d4d4d8",
    fontFamily: "monospace",
    fontSize: 11,
  },
  highlight: {
    backgroundColor: "rgba(20, 184, 166, 0.25)",
    color: "#99f6e4",
  },
  mutedText: {
    color: colors.muted,
    fontSize: 12,
  },
  todoRow: {
    flexDirection: "row",
    gap: 8,
  },
  todoIcon: {
    width: 14,
    fontFamily: "monospace",
    fontSize: 12,
  },
  todoText: {
    flex: 1,
    color: "#d4d4d8",
    fontSize: 12,
    lineHeight: 17,
  },
  todoDone: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
})
