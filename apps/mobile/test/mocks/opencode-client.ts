/**
 * `@opencode/client` is ESM-only (its `exports` map has no CommonJS condition),
 * so it cannot be pulled into Jest's CJS graph. The mobile render tests never
 * drive it: they exercise presentational components and the pure helpers
 * re-exported by `@masterhand/client-core`. This stub satisfies the single
 * runtime binding client-core imports so importing client-core stays cheap; the
 * real SDK is covered by the `client-core` vitest suite.
 */
export class OpenCode {
  static make(): never {
    throw new Error("OpenCode.make is not available in mobile render tests")
  }
}
