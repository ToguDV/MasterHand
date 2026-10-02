/**
 * `react-native-safe-area-context` reads the native view config to report
 * insets; under Jest there is no native host, so its shipped Jest mock supplies
 * fixed insets instead. Without this the `SafeAreaView` in `Screen` (and every
 * screen rendered through it) would read zero/garbage insets.
 */
jest.mock("react-native-safe-area-context", () => {
  const mock = jest.requireActual<{ default: unknown }>("react-native-safe-area-context/jest/mock")
  return mock.default
})
