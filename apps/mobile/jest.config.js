const { moduleNameMapper } = require("jest-expo/jest-preset")

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/test/**/*.test.{ts,tsx}"],
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  // Keep the preset's react-native mappings and add the ESM-only SDK stub.
  moduleNameMapper: {
    ...moduleNameMapper,
    "^@opencode/client$": "<rootDir>/test/mocks/opencode-client.ts",
    "^@ronradtke/react-native-markdown-display$":
      "<rootDir>/test/mocks/react-native-markdown-display.tsx",
    "^react-native-webview$": "<rootDir>/test/mocks/react-native-webview.tsx",
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "App.tsx", "!src/theme.ts"],
  // A floor for the render suite (root `test:coverage` runs with --coverage).
  coverageThreshold: {
    global: { statements: 65, branches: 65, functions: 65, lines: 65 },
  },
}
