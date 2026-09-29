import { useEffect, useMemo, useRef, useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import {
  ApiError,
  defaultModelValue,
  flattenModels,
  parseModel,
  recentModelValue,
  selectableAgents,
  sessionModelValue,
  useAgents,
  useConfig,
  useProviders,
  useSessions,
  variantLabel,
  type Client,
} from "@masterhand/client-core"
import { ChoiceModal, type ChoiceOption } from "./ChoiceModal"
import { colors } from "../theme"

type OpenPicker = "agent" | "model" | "effort" | null

export function Composer({
  client,
  sessionID,
  busy,
  directory,
  autoAccept,
  onToggleAutoAccept,
}: {
  client: Client
  sessionID: string
  busy: boolean
  directory?: string | null
  autoAccept: boolean
  onToggleAutoAccept: (on: boolean) => void
}) {
  const agentsQuery = useAgents(client)
  const providersQuery = useProviders(client)
  const configQuery = useConfig(client)
  const sessionsQuery = useSessions(client, true, 10_000, directory)

  const agents = useMemo(() => selectableAgents(agentsQuery.data ?? []), [agentsQuery.data])
  const modelOptions = useMemo(() => flattenModels(providersQuery.data?.providers ?? []), [providersQuery.data])
  const defaultModel = useMemo(() => {
    const sessions = sessionsQuery.data ?? []
    const session = sessions.find((item) => item.id === sessionID)
    const preferred = sessionModelValue(session, modelOptions) ?? recentModelValue(sessions, modelOptions)
    return defaultModelValue(configQuery.data?.model, providersQuery.data?.default ?? {}, modelOptions, preferred)
  }, [configQuery.data, providersQuery.data, modelOptions, sessionsQuery.data, sessionID])

  const [text, setText] = useState("")
  const [agent, setAgent] = useState("")
  const [model, setModel] = useState("")
  const [variant, setVariant] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState<OpenPicker>(null)
  const modelTouched = useRef(false)

  const variants = useMemo(
    () => modelOptions.find((option) => option.value === model)?.variants ?? [],
    [model, modelOptions],
  )

  useEffect(() => {
    if (!agent && agents[0]) setAgent(agents[0].name)
  }, [agent, agents])

  useEffect(() => {
    if (!modelTouched.current) setModel(defaultModel)
  }, [defaultModel])

  useEffect(() => {
    if (variant && !variants.includes(variant)) setVariant("")
  }, [variant, variants])

  async function send() {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setError(null)
    try {
      const modelValue = model ? parseModel(model) : undefined
      await client.api.promptAsync(
        sessionID,
        {
          parts: [{ type: "text", text: trimmed }],
          ...(agent ? { agent } : {}),
          ...(variant ? { variant } : {}),
          ...(modelValue ? { model: modelValue } : {}),
        },
        directory,
      )
      setText("")
    } catch (err) {
      setError(err instanceof ApiError ? `Could not send (HTTP ${err.status})` : "Could not send")
    } finally {
      setSending(false)
    }
  }

  async function stop() {
    try {
      await client.api.abortSession(sessionID, directory)
    } catch {
      // the state reconciles through events
    }
  }

  const agentChoices: ChoiceOption[] = agents.map((item) => ({ value: item.name, label: item.name }))
  const modelChoices: ChoiceOption[] = modelOptions.map((option) => ({ value: option.value, label: option.label }))
  const effortChoices: ChoiceOption[] = variants.map((key) => ({ value: key, label: variantLabel(key) }))

  return (
    <View style={styles.container}>
      <View style={styles.selectors}>
        <Selector
          label={agent || "agent…"}
          onPress={() => setPicker("agent")}
          disabled={agentChoices.length === 0}
        />
        <Selector
          label={modelOptions.find((option) => option.value === model)?.label ?? "model…"}
          onPress={() => setPicker("model")}
          disabled={modelChoices.length === 0}
        />
        {variants.length > 0 && (
          <Selector
            label={variant ? variantLabel(variant) : "effort: default"}
            onPress={() => setPicker("effort")}
            disabled={false}
          />
        )}
        <Pressable
          style={[styles.selector, styles.autoAccept, autoAccept && styles.autoAcceptOn]}
          onPress={() => onToggleAutoAccept(!autoAccept)}
          accessibilityRole="switch"
          accessibilityState={{ checked: autoAccept }}
          accessibilityLabel="Auto-accept permission requests for this session"
        >
          <Text
            style={[styles.selectorText, autoAccept && styles.autoAcceptText]}
            numberOfLines={1}
          >
            {autoAccept ? "auto-accept: on" : "auto-accept"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Write a message…"
          placeholderTextColor={colors.muted}
          multiline
        />
        {busy ? (
          <Pressable style={[styles.action, styles.stop]} onPress={() => void stop()}>
            <Text style={styles.actionText}>Stop</Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.action, (!text.trim() || sending) && styles.actionDisabled]}
            disabled={!text.trim() || sending}
            onPress={() => void send()}
          >
            <Text style={styles.actionText}>Send</Text>
          </Pressable>
        )}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <ChoiceModal
        visible={picker === "agent"}
        title="Agent"
        options={agentChoices}
        selected={agent}
        onSelect={setAgent}
        onClose={() => setPicker(null)}
      />
      <ChoiceModal
        visible={picker === "model"}
        title="Model"
        options={modelChoices}
        selected={model}
        onSelect={(value) => {
          modelTouched.current = true
          setModel(value)
        }}
        onClose={() => setPicker(null)}
      />
      <ChoiceModal
        visible={picker === "effort"}
        title="Effort"
        options={[{ value: "", label: "Default" }, ...effortChoices]}
        selected={variant}
        onSelect={setVariant}
        onClose={() => setPicker(null)}
      />
    </View>
  )
}

function Selector({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable style={[styles.selector, disabled && styles.actionDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={styles.selectorText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 16,
  },
  selectors: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  selector: {
    flexGrow: 1,
    flexBasis: "30%",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectorText: {
    color: colors.text,
    fontSize: 12,
  },
  autoAccept: {
    flexGrow: 0,
    flexBasis: "auto",
  },
  autoAcceptOn: {
    borderColor: colors.warning,
    backgroundColor: "rgba(245, 158, 11, 0.12)",
  },
  autoAcceptText: {
    color: colors.warning,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    maxHeight: 140,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
  },
  action: {
    height: 44,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
  },
  stop: {
    backgroundColor: "#7f1d1d",
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
})
