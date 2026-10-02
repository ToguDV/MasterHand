import { useState } from "react"
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native"
import {
  directoryName,
  filterSessions,
  formatRelative,
  rootSessions,
  type CreateWorkspaceInput,
  type Session,
  type SessionFilter,
  type SessionStatuses,
  type WorkspaceRecord,
} from "@masterhand/client-core"
import { Screen } from "../components/Screen"
import { WorkspaceModal } from "../components/WorkspaceModal"
import { colors } from "../theme"

export function SessionsScreen({
  sessions,
  loading,
  statuses,
  connected,
  creating,
  banner,
  workspaces,
  workspaceID,
  canCreate,
  onOpen,
  onNew,
  onSignOut,
  onSelectWorkspace,
  onAddWorkspace,
  onRemoveWorkspace,
  onDeleteSession,
}: {
  sessions: Session[]
  loading: boolean
  statuses: SessionStatuses
  connected: boolean
  creating: boolean
  banner: string | null
  workspaces: WorkspaceRecord[]
  workspaceID: string | null
  canCreate: boolean
  onOpen: (sessionID: string) => void
  onNew: (isolated: boolean) => void
  onSignOut: () => void
  onSelectWorkspace: (id: string) => void
  onAddWorkspace: (input: CreateWorkspaceInput) => Promise<void>
  onRemoveWorkspace: (id: string, options: { deleteFiles: boolean }) => void
  onDeleteSession: (id: string) => void
}) {
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [filter, setFilter] = useState<SessionFilter>("all")
  const [isolated, setIsolated] = useState(false)
  const workspace = workspaces.find((item) => item.id === workspaceID) ?? null
  // Subagent children are reachable from their parent's card, not the list.
  const visible = filterSessions(rootSessions(sessions), filter)

  const FILTERS: Array<{ value: SessionFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "isolated", label: "Isolated" },
    { value: "standard", label: "Standard" },
  ]

  function confirmDeleteSession(session: Session): void {
    Alert.alert("Delete session", `Delete "${session.title || "Untitled"}" and all its data?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDeleteSession(session.id) },
    ])
  }

  function confirmRemoveWorkspace(id: string, options: { deleteFiles: boolean }): void {
    Alert.alert(
      "Remove workspace",
      options.deleteFiles
        ? "The folder and all its files will be deleted. Sessions are kept."
        : "Files and sessions are not deleted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => onRemoveWorkspace(id, options) },
      ],
    )
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Sessions</Text>
        <View style={styles.headerRight}>
          <View style={[styles.dot, { backgroundColor: connected ? colors.success : colors.warning }]} />
          <Pressable
            style={[styles.newButton, !canCreate && styles.disabled]}
            testID="new-session-button"
            onPress={() => onNew(isolated)}
            disabled={creating || !canCreate}
          >
            <Text style={styles.newButtonText}>{creating ? "Creating…" : "+ New"}</Text>
          </Pressable>
          <Pressable onPress={onSignOut}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.filterRow}>
        <View style={styles.filters}>
          {FILTERS.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setFilter(option.value)}
              style={[styles.chip, filter === option.value && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === option.value && styles.chipTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.isolatedToggle} onPress={() => setIsolated((value) => !value)}>
          <View style={[styles.checkbox, isolated && styles.checkboxChecked]}>
            {isolated ? <Text style={styles.checkboxMark}>✓</Text> : null}
          </View>
          <Text style={styles.isolatedLabel}>Isolated</Text>
        </Pressable>
      </View>

      <Pressable style={styles.workspaceBar} onPress={() => setWorkspaceOpen(true)}>
        <Text style={styles.workspaceLabel}>Workspace</Text>
        <Text style={styles.workspaceName} numberOfLines={1}>
          {workspace ? workspace.name : "Add a workspace"}
        </Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>

      {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      {!connected ? <Text style={styles.banner}>Reconnecting to the server…</Text> : null}

      <FlatList
        data={visible}
        keyExtractor={(session) => session.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {loading
              ? "Loading…"
              : canCreate
                ? filter === "all"
                  ? "No sessions yet."
                  : "No sessions match this filter."
                : "Add a workspace to start working on a project."}
          </Text>
        }
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            status={statuses[item.id]?.type}
            onPress={onOpen}
            onDelete={confirmDeleteSession}
          />
        )}
      />

      <WorkspaceModal
        visible={workspaceOpen}
        workspaces={workspaces}
        selectedID={workspaceID}
        onSelect={onSelectWorkspace}
        onAdd={onAddWorkspace}
        onRemove={(id, options) => {
          setWorkspaceOpen(false)
          confirmRemoveWorkspace(id, options)
        }}
        onClose={() => setWorkspaceOpen(false)}
      />
    </Screen>
  )
}

function SessionRow({
  session,
  status,
  onPress,
  onDelete,
}: {
  session: Session
  status: string | undefined
  onPress: (id: string) => void
  onDelete: (session: Session) => void
}) {
  return (
    <View style={styles.row}>
      <Pressable style={styles.rowMain} onPress={() => onPress(session.id)}>
        <View style={styles.rowHeader}>
          <View
            style={[
              styles.dot,
              status === "busy" ? { backgroundColor: colors.warning } : { backgroundColor: colors.surfaceMuted },
            ]}
          />
          <Text style={styles.rowTitle} numberOfLines={1}>
            {session.title || "Untitled"}
          </Text>
          {session.isolation ? (
            <View style={styles.branchBadge}>
              <Text style={styles.branchText} numberOfLines={1}>
                {session.isolation.branch}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowMeta}>
          {directoryName(session.location.directory)} · {formatRelative(session.time.updated)}
        </Text>
      </Pressable>
      <Pressable style={styles.delete} onPress={() => onDelete(session)} accessibilityLabel="Delete session">
        <Text style={styles.deleteText}>×</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  newButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  newButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  signOut: {
    color: colors.muted,
    fontSize: 12,
  },
  workspaceBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  workspaceLabel: {
    color: colors.muted,
    fontSize: 12,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  workspaceName: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  chevron: {
    color: colors.muted,
    fontSize: 12,
  },
  banner: {
    color: colors.warning,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  list: {
    paddingBottom: 24,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flex: 1,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
  },
  branchBadge: {
    maxWidth: 130,
    backgroundColor: "rgba(99, 102, 241, 0.15)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  branchText: {
    color: "#a5b4fc",
    fontSize: 10,
    fontWeight: "600",
  },
  rowMeta: {
    color: colors.muted,
    fontSize: 12,
    paddingLeft: 16,
  },
  delete: {
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  deleteText: {
    color: colors.muted,
    fontSize: 20,
    lineHeight: 22,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filters: {
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipActive: {
    backgroundColor: colors.surfaceMuted,
  },
  chipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  chipTextActive: {
    color: colors.text,
  },
  isolatedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkboxMark: {
    color: colors.text,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
  },
  isolatedLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
})
