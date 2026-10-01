import { useState } from "react"
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native"
import { WebView } from "react-native-webview"
import { useQueryClient } from "@tanstack/react-query"
import {
  ApiError,
  queryKeys,
  useBffStatus,
  usePreview,
  type Client,
  type PreviewStatus,
} from "@masterhand/client-core"
import { colors } from "../theme"

const STOPPED: PreviewStatus = { status: "stopped", url: null, port: null, error: null }

function startErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return "The agent has not started a web server yet. Ask it to run the project first."
    if (error.status === 503) return "cloudflared is not available on the server."
    return error.message
  }
  return "Could not start the preview"
}

export function PreviewModal({
  client,
  sessionID,
  onClose,
}: {
  client: Client
  sessionID: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const statusQuery = useBffStatus(client)
  const previewQuery = usePreview(client, sessionID, statusQuery.data?.preview?.enabled === true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availability = statusQuery.data?.preview
  const preview = previewQuery.data ?? STOPPED
  const unavailable = availability ? !availability.available : false
  const key = queryKeys.preview(sessionID)

  async function start() {
    setBusy(true)
    setError(null)
    try {
      queryClient.setQueryData(key, await client.api.startPreview(sessionID))
    } catch (startError) {
      setError(startErrorMessage(startError))
    } finally {
      setBusy(false)
    }
  }

  async function stop() {
    setBusy(true)
    setError(null)
    try {
      await client.api.stopPreview(sessionID)
      queryClient.setQueryData(key, STOPPED)
    } catch {
      setError("Could not stop the preview")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.heading}>Preview</Text>
          {preview.port !== null ? <Text style={styles.port}>port {preview.port}</Text> : null}
          <View style={styles.spacer} />
          {busy ? (
            <ActivityIndicator color={colors.accent} />
          ) : preview.status === "running" ? (
            <Pressable style={styles.button} onPress={() => void stop()}>
              <Text style={styles.buttonText}>Stop</Text>
            </Pressable>
          ) : unavailable ? null : (
            <Pressable style={[styles.button, styles.primary]} onPress={() => void start()}>
              <Text style={[styles.buttonText, styles.primaryText]}>Start</Text>
            </Pressable>
          )}
          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Close</Text>
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {preview.status === "running" && preview.url ? (
          <WebView source={{ uri: preview.url }} style={styles.webview} startInLoadingState />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              {unavailable
                ? "cloudflared is not available on the server. Install it, or run MasterHand with Docker (the image bundles it)."
                : preview.status === "starting"
                  ? "Starting the tunnel…"
                  : `Ask the agent to start the web server on port ${
                      preview.port ?? availability?.portRange.min ?? ""
                    }, then press Start.`}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  heading: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  port: {
    color: colors.muted,
    fontSize: 11,
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  spacer: {
    flex: 1,
  },
  button: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surfaceMuted,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  buttonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  primaryText: {
    color: colors.text,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  webview: {
    flex: 1,
    backgroundColor: "#fff",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  placeholderText: {
    color: colors.muted,
    fontSize: 14,
    textAlign: "center",
  },
})
