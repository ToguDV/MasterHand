import { useRef } from "react"
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native"
import { sessionUsage, useMessages, type Client, type MessageWithParts } from "@masterhand/client-core"
import { Composer } from "../components/Composer"
import { MessageBubble } from "../components/MessageBubble"
import { Screen } from "../components/Screen"
import { colors } from "../theme"

export function ChatScreen({
  client,
  sessionID,
  title,
  busy,
  connected,
  directory,
  autoAccept,
  onToggleAutoAccept,
  onBack,
}: {
  client: Client
  sessionID: string
  title: string
  busy: boolean
  connected: boolean
  directory?: string | null
  autoAccept: boolean
  onToggleAutoAccept: (on: boolean) => void
  onBack: () => void
}) {
  const messagesQuery = useMessages(client, sessionID, { busy, connected, directory })
  const listRef = useRef<FlatList<MessageWithParts>>(null)
  const messages = messagesQuery.data ?? []
  const usage = sessionUsage(messages)

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {title || "Session"}
        </Text>
        <View style={[styles.dot, { backgroundColor: connected ? colors.success : colors.warning }]} />
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(entry) => entry.info.id}
        contentContainerStyle={styles.list}
        style={styles.listContainer}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          messagesQuery.isLoading ? (
            <Text style={styles.empty}>Loading conversation…</Text>
          ) : (
            <Text style={styles.empty}>Write a message to start working with the agent.</Text>
          )
        }
        renderItem={({ item }) => <MessageBubble entry={item} />}
      />

      {usage.cost > 0 ? (
        <Text style={styles.usage}>
          Session · ${usage.cost.toFixed(4)}
          {usage.tokens > 0 ? ` · ${usage.tokens} tok` : ""}
        </Text>
      ) : null}

      <Composer
        client={client}
        sessionID={sessionID}
        busy={busy}
        directory={directory}
        autoAccept={autoAccept}
        onToggleAutoAccept={onToggleAutoAccept}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  back: {
    paddingHorizontal: 4,
  },
  backText: {
    color: colors.muted,
    fontSize: 26,
    lineHeight: 28,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listContainer: {
    flex: 1,
  },
  list: {
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 32,
  },
  usage: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "right",
    paddingHorizontal: 14,
    paddingTop: 8,
  },
})
