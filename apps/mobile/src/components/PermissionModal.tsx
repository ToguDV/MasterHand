import { Modal, Pressable, StyleSheet, Text, View } from "react-native"
import type { Permission } from "@masterhand/client-core"
import { colors } from "../theme"

export function PermissionModal({
  permission,
  busy,
  onRespond,
}: {
  permission: Permission
  busy: boolean
  onRespond: (response: "once" | "always" | "reject") => void
}) {
  const patterns = permission.patterns?.join(", ") ?? ""

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>Permission required</Text>
          <Text style={styles.title}>{permission.permission}</Text>
          {patterns ? <Text style={styles.meta}>{patterns}</Text> : null}

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.reject]}
              disabled={busy}
              onPress={() => onRespond("reject")}
            >
              <Text style={[styles.buttonText, styles.rejectText]}>Reject</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.always]}
              disabled={busy}
              onPress={() => onRespond("always")}
            >
              <Text style={styles.buttonText}>Always</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.once, busy && styles.disabled]}
              disabled={busy}
              onPress={() => onRespond("once")}
            >
              <Text style={styles.buttonText}>Once</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  heading: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  button: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
  },
  reject: {
    backgroundColor: "#450a0a",
  },
  always: {
    backgroundColor: colors.surfaceMuted,
  },
  once: {
    backgroundColor: colors.accent,
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  rejectText: {
    color: colors.danger,
  },
})
