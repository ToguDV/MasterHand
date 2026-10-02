import { useState } from "react"
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { Screen } from "../components/Screen"
import { colors } from "../theme"

export function LoginScreen({
  initialServerUrl,
  busy,
  error,
  onSubmit,
}: {
  initialServerUrl: string | null
  busy: boolean
  error: string | null
  onSubmit: (serverUrl: string, password: string) => void
}) {
  const [serverUrl, setServerUrl] = useState(initialServerUrl ?? "")
  const [password, setPassword] = useState("")

  const canSubmit = serverUrl.trim().length > 0 && password.length > 0 && !busy

  return (
    <Screen style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>MasterHand</Text>
        <Text style={styles.subtitle}>Your opencode agents, from anywhere.</Text>

        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          testID="server-url-input"
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder="https://masterhand.example.com"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          testID="password-input"
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor={colors.muted}
          secureTextEntry
          autoCapitalize="none"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          disabled={!canSubmit}
          onPress={() => onSubmit(serverUrl.trim(), password)}
        >
          {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 6,
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
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 10,
  },
  button: {
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    height: 46,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
})
