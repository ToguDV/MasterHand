import type { PropsWithChildren } from "react"
import { Platform, SafeAreaView, StatusBar, StyleSheet, View } from "react-native"
import { colors } from "../theme"

export function Screen({ children, style }: PropsWithChildren<{ style?: object }>) {
  const topInset = Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0
  return (
    <SafeAreaView style={[styles.safe, { paddingTop: topInset }]}>
      <View style={[styles.content, style]}>{children}</View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
})
