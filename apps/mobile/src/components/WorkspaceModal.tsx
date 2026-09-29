import { useEffect, useState } from "react"
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { ApiError, type CreateWorkspaceInput, type WorkspaceRecord } from "@masterhand/client-core"
import { colors } from "../theme"

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "That workspace is already registered"
    if (error.status === 403) return "The path is outside the allowed projects root"
    if (error.status === 400) return "Enter an absolute path (starting with /)"
  }
  return "Could not add the workspace"
}

export function WorkspaceModal({
  visible,
  workspaces,
  selectedID,
  onSelect,
  onAdd,
  onRemove,
  onClose,
}: {
  visible: boolean
  workspaces: WorkspaceRecord[]
  selectedID: string | null
  onSelect: (id: string) => void
  onAdd: (input: CreateWorkspaceInput) => Promise<void>
  onRemove: (id: string) => void
  onClose: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [path, setPath] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) return
    setAdding(false)
    setPath("")
    setName("")
    setBusy(false)
    setError(null)
  }, [visible])

  async function submit(): Promise<void> {
    const trimmed = path.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      await onAdd({ path: trimmed, ...(name.trim() ? { name: name.trim() } : {}) })
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  const selected = workspaces.find((workspace) => workspace.id === selectedID) ?? null

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Workspaces</Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {workspaces.length === 0 && <Text style={styles.empty}>No workspaces yet.</Text>}
            {workspaces.map((workspace) => (
              <Pressable
                key={workspace.id}
                style={[styles.option, workspace.id === selectedID && styles.optionSelected]}
                onPress={() => {
                  onSelect(workspace.id)
                  onClose()
                }}
              >
                <Text style={[styles.optionText, workspace.id === selectedID && styles.optionTextSelected]}>
                  {workspace.name}
                </Text>
                <Text style={styles.optionMeta} numberOfLines={1}>
                  {workspace.path}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {adding ? (
            <View style={styles.form}>
              <TextInput
                value={path}
                onChangeText={setPath}
                placeholder="/workspace/my-project"
                placeholderTextColor={colors.muted}
                autoCorrect={false}
                autoCapitalize="none"
                style={styles.input}
              />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Name (optional)"
                placeholderTextColor={colors.muted}
                autoCorrect={false}
                style={styles.input}
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.formActions}>
                <Pressable style={styles.secondary} disabled={busy} onPress={() => setAdding(false)}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.primary, (!path.trim() || busy) && styles.disabled]}
                  disabled={!path.trim() || busy}
                  onPress={() => void submit()}
                >
                  <Text style={styles.primaryText}>{busy ? "Adding…" : "Add"}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.formActions}>
              {selectedID ? (
                <Pressable style={styles.danger} onPress={() => onRemove(selectedID)}>
                  <Text style={styles.dangerText}>Remove workspace</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.primary} onPress={() => setAdding(true)}>
                <Text style={styles.primaryText}>Add workspace</Text>
              </Pressable>
            </View>
          )}

          {selected && !adding ? (
            <Text style={styles.hint} numberOfLines={1}>
              {selected.path}
            </Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    maxHeight: "80%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.surface,
    paddingBottom: 24,
  },
  title: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  list: {
    flexGrow: 0,
  },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 2,
  },
  optionSelected: {
    backgroundColor: colors.surfaceMuted,
  },
  optionText: {
    color: colors.text,
    fontSize: 15,
  },
  optionTextSelected: {
    color: colors.accent,
    fontWeight: "600",
  },
  optionMeta: {
    color: colors.muted,
    fontSize: 12,
  },
  empty: {
    color: colors.muted,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  form: {
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.background,
    borderRadius: 10,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  secondary: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  danger: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: "auto",
  },
  dangerText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  hint: {
    color: colors.muted,
    fontSize: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  disabled: {
    opacity: 0.5,
  },
})
