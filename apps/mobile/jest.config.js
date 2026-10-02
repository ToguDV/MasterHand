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
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "App.tsx", "!src/theme.ts"],
}
