import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native"
import { colors } from "../theme"

export interface ComposerSuggestion {
  id: string
  label: string
  detail?: string
}

/** Inline list of commands, subagent mentions or argument suggestions above the input. */
export function ComposerSuggestions({
  title,
  hint,
  items,
  emptyLabel = "No matches",
  onSelect,
}: {
  title: string
  hint?: string | null
  items: ComposerSuggestion[]
  emptyLabel?: string
  onSelect: (id: string) => void
}) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {items.length === 0 && <Text style={styles.empty}>{emptyLabel}</Text>}
        {items.map((item) => (
          <Pressable
            key={item.id}
            style={styles.item}
            onPress={() => onSelect(item.id)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Text style={styles.label} numberOfLines={1}>
              {item.label}
            </Text>
            {item.detail ? (
              <Text style={styles.detail} numberOfLines={1}>
                {item.detail}
              </Text>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  title: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  hint: {
    color: colors.muted,
    fontSize: 11,
  },
  list: {
    flexGrow: 0,
  },
  item: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  label: {
    flexShrink: 0,
    color: colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  detail: {
    flexShrink: 1,
    color: colors.muted,
    fontSize: 11,
  },
  empty: {
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
})
