import { FlatList, Pressable, StyleSheet, Text, View } from "react-native"
import { directoryName, formatRelative, type Session, type SessionStatuses } from "@masterhand/client-core"
import { Screen } from "../components/Screen"
import { colors } from "../theme"

export function SessionsScreen({
  sessions,
  loading,
  statuses,
  connected,
  creating,
  banner,
  onOpen,
  onNew,
  onSignOut,
}: {
  sessions: Session[]
  loading: boolean
  statuses: SessionStatuses
  connected: boolean
  creating: boolean
  banner: string | null
  onOpen: (sessionID: string) => void
  onNew: () => void
  onSignOut: () => void
}) {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Sessions</Text>
        <View style={styles.headerRight}>
          <View style={[styles.dot, { backgroundColor: connected ? colors.success : colors.warning }]} />
          <Pressable style={styles.newButton} onPress={onNew} disabled={creating}>
            <Text style={styles.newButtonText}>{creating ? "Creating…" : "+ New"}</Text>
          </Pressable>
          <Pressable onPress={onSignOut}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      {banner ? <Text style={styles.banner}>{banner}</Text> : null}
      {!connected ? <Text style={styles.banner}>Reconnecting to the server…</Text> : null}

      <FlatList
        data={sessions}
        keyExtractor={(session) => session.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>{loading ? "Loading…" : "No sessions yet."}</Text>}
        renderItem={({ item }) => <SessionRow session={item} status={statuses[item.id]?.type} onPress={onOpen} />}
      />
    </Screen>
  )
}

function SessionRow({
  session,
  status,
  onPress,
}: {
  session: Session
  status: string | undefined
  onPress: (id: string) => void
}) {
  return (
    <Pressable style={styles.row} onPress={() => onPress(session.id)}>
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
      </View>
      <Text style={styles.rowMeta}>
        {directoryName(session.directory)} · {formatRelative(session.time.updated)}
      </Text>
    </Pressable>
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
  },
  row: {
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
  rowMeta: {
    color: colors.muted,
    fontSize: 12,
    paddingLeft: 16,
  },
})
