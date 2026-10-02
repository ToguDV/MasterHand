import { Text } from "react-native"

/**
 * `react-native-webview` renders a native view that has no meaning in Jest; the
 * preview tests only assert that the modal mounts a WebView with the tunnel URL.
 */
export function WebView({ source }: { source?: { uri?: string } }) {
  return <Text>{`WebView: ${source?.uri ?? ""}`}</Text>
}
