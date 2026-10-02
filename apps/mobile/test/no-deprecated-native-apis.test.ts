/**
 * Static guards for the mobile app.
 *
 * React Native removes deprecated APIs in later releases, so a source-level
 * check keeps them out: `SafeAreaView` from `react-native` already logs a
 * deprecation warning, and `react-native-safe-area-context` is the supported
 * replacement — which only works with its provider mounted at the app root,
 * otherwise every inset silently reads as zero and the UI slides under the
 * status bar.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(path) ? [path] : []
  })
}

const sourceFilesList = [...sourceFiles(join(appRoot, "src")), join(appRoot, "App.tsx")]

/** Names imported from `module` across every import statement of a source file. */
function importedNames(source: string, module: string): string[] {
  const pattern = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+"${module}"`, "g")
  return [...source.matchAll(pattern)].flatMap((match) =>
    (match[1] ?? "")
      .split(",")
      .map((name) => name.replace(/\s+as\s+.*$/, "").trim())
      .filter(Boolean),
  )
}

function offenders(names: string[]): string[] {
  return sourceFilesList.flatMap((file) => {
    const imported = importedNames(readFileSync(file, "utf8"), "react-native")
    return names
      .filter((name) => imported.includes(name))
      .map((name) => `${relative(appRoot, file)} imports ${name}`)
  })
}

describe("react-native APIs", () => {
  it("never imports SafeAreaView from react-native (deprecated)", () => {
    expect(offenders(["SafeAreaView"])).toEqual([])
  })

  it("never imports modules React Native already removed", () => {
    const removed = [
      "AsyncStorage",
      "Clipboard",
      "DatePickerIOS",
      "ListView",
      "MaskedViewIOS",
      "PickerIOS",
      "Slider",
      "ViewPropTypes",
      "WebView",
    ]
    expect(offenders(removed)).toEqual([])
  })

  it("keeps SafeAreaProvider mounted at the app root", () => {
    const app = readFileSync(join(appRoot, "App.tsx"), "utf8")
    expect(app).toContain("<SafeAreaProvider>")
    expect(app).toContain("</SafeAreaProvider>")
  })

  it("uses the safe-area-context SafeAreaView in Screen", () => {
    const screen = readFileSync(join(appRoot, "src/components/Screen.tsx"), "utf8")
    expect(importedNames(screen, "react-native-safe-area-context")).toContain("SafeAreaView")
  })

  it("declares react-native-safe-area-context as a dependency", () => {
    const pkg = JSON.parse(readFileSync(join(appRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>
    }
    expect(pkg.dependencies?.["react-native-safe-area-context"]).toBeTruthy()
  })
})
