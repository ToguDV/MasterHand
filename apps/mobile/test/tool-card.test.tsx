import { fireEvent, render, screen } from "@testing-library/react-native"
import type { ChatToolPart, ChatToolState } from "@masterhand/client-core"
import { ToolCard } from "../src/components/tools/ToolCard"

function part(tool: string, state: Partial<ChatToolState> = {}): ChatToolPart {
  return {
    id: "c1",
    sessionID: "s1",
    messageID: "m1",
    type: "tool",
    tool,
    callID: "c1",
    state: { status: "completed", input: {}, ...state },
  }
}

describe("ToolCard", () => {
  it("summarizes a shell command and reveals its terminal output", async () => {
    await render(
      <ToolCard
        part={part("bash", {
          input: { command: "npm test -- --run", description: "Run the suite" },
          output: "Tests passed",
          metadata: { exitCode: 0 },
        })}
      />,
    )

    expect(screen.getByText("npm test -- --run")).toBeOnTheScreen()
    expect(screen.getByText(/Run the suite/)).toBeOnTheScreen()
    expect(screen.getByText("exit 0")).toBeOnTheScreen()
    expect(screen.queryByText("Tests passed")).toBeNull()

    await fireEvent.press(screen.getByText("npm test -- --run"))
    expect(screen.getByText("Tests passed")).toBeOnTheScreen()
  })

  it("marks a failed exit code in red and shows the error", async () => {
    await render(
      <ToolCard
        part={part("bash", {
          status: "error",
          input: { command: "boom" },
          metadata: { exitCode: 1 },
          error: "command failed",
        })}
      />,
    )

    expect(screen.getByText("exit 1")).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("boom"))
    expect(screen.getByText("command failed")).toBeOnTheScreen()
  })

  it("renders a read with its line count and content", async () => {
    await render(
      <ToolCard part={part("read", { input: { filePath: "src/app.ts" }, output: "00001| a\n00002| b" })} />,
    )

    expect(screen.getByText("src/app.ts")).toBeOnTheScreen()
    expect(screen.getByText(/2 lines/)).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("src/app.ts"))
    expect(screen.getByText("00001| a")).toBeOnTheScreen()
  })

  it("renders a write with its content", async () => {
    await render(
      <ToolCard part={part("write", { input: { filePath: "src/new.ts", content: "export const a = 1" } })} />,
    )

    expect(screen.getByText("src/new.ts")).toBeOnTheScreen()
    expect(screen.getByText(/1 line/)).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("src/new.ts"))
    expect(screen.getByText("export const a = 1")).toBeOnTheScreen()
  })

  it("renders an edit as a diff with stats", async () => {
    await render(
      <ToolCard
        part={part("edit", {
          input: { filePath: "src/app.ts", oldString: "const value = 1", newString: "const value = 2\nconst more = 3" },
        })}
      />,
    )

    expect(screen.getByText("src/app.ts")).toBeOnTheScreen()
    expect(screen.getByText(/\+2/)).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("src/app.ts"))
    expect(screen.getByText("const value = 1")).toBeOnTheScreen()
    expect(screen.getByText("const more = 3")).toBeOnTheScreen()
  })

  it("renders search matches and the empty state", async () => {
    await render(
      <ToolCard part={part("grep", { input: { pattern: "TODO", path: "src" }, output: "a.ts:1 TODO\nb.ts:2 TODO" })} />,
    )

    expect(screen.getByText("TODO")).toBeOnTheScreen()
    expect(screen.getByText("2 matches")).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("TODO"))
    expect(screen.getByText("a.ts:1 TODO")).toBeOnTheScreen()

    await render(<ToolCard part={part("grep", { input: { pattern: "nope" }, output: "" })} />)
    await fireEvent.press(screen.getAllByText("nope")[0]!)
    expect(screen.getByText("No matches")).toBeOnTheScreen()
  })

  it("renders a web call as a URL", async () => {
    await render(
      <ToolCard
        part={part("webfetch", { input: { url: "https://example.com/docs" }, output: "Page body" })}
      />,
    )

    await fireEvent.press(screen.getAllByText("https://example.com/docs")[0]!)
    expect(screen.getByText("Page body")).toBeOnTheScreen()
  })

  it("renders a todo checklist with completed counts", async () => {
    await render(
      <ToolCard
        part={part("todowrite", {
          input: {
            todos: [
              { content: "first", status: "completed" },
              { content: "second", status: "in_progress" },
            ],
          },
        })}
      />,
    )

    expect(screen.getByText("1/2")).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("Todo list"))
    expect(screen.getByText("first")).toBeOnTheScreen()
    expect(screen.getByText("second")).toBeOnTheScreen()
  })

  it("falls back to a question list for the question tool without form state", async () => {
    await render(
      <ToolCard
        part={part("question", {
          input: {
            questions: [
              { header: "DB", question: "Which database?", options: [{ label: "Postgres", description: "Relational" }] },
            ],
          },
        })}
      />,
    )

    expect(screen.getByText("DB")).toBeOnTheScreen()
    await fireEvent.press(screen.getAllByText("DB")[0]!)
    expect(screen.getByText("Which database?")).toBeOnTheScreen()
    expect(screen.getByText("Postgres")).toBeOnTheScreen()
  })

  it("renders unknown tools as key/value rows instead of raw JSON", async () => {
    await render(
      <ToolCard
        part={part("mcp__srv__op", { input: { key: "value", nested: { a: 1 } }, output: "done" })}
      />,
    )

    expect(screen.getAllByText("mcp__srv__op").length).toBeGreaterThan(0)
    await fireEvent.press(screen.getAllByText("mcp__srv__op")[0]!)
    expect(screen.getByText("value")).toBeOnTheScreen()
    expect(screen.getByText('{"a":1}')).toBeOnTheScreen()
    expect(screen.getByText("done")).toBeOnTheScreen()
  })

  it("shows the pending placeholder while the input streams", async () => {
    await render(<ToolCard part={part("bash", { status: "pending", raw: '{"comm' })} />)

    expect(screen.getByText("Preparing…")).toBeOnTheScreen()
  })

  it("expands long code blocks and search results on demand", async () => {
    const content = Array.from({ length: 40 }, (_, index) => `line ${index}`).join("\n")
    await render(<ToolCard part={part("read", { input: { filePath: "big.ts" }, output: content })} />)
    await fireEvent.press(screen.getByText("big.ts"))
    expect(screen.getByText(/Show all \(40 lines\)/)).toBeOnTheScreen()
    await fireEvent.press(screen.getByText(/Show all \(40 lines\)/))
    expect(screen.getByText("line 39")).toBeOnTheScreen()

    const matches = Array.from({ length: 45 }, (_, index) => `match ${index}`).join("\n")
    await render(<ToolCard part={part("grep", { input: { pattern: "match" }, output: matches })} />)
    await fireEvent.press(screen.getByText("match"))
    await fireEvent.press(screen.getByText(/more matches/))
    expect(screen.getByText("match 44")).toBeOnTheScreen()
  })

  it("caps very long diffs and expands them", async () => {
    const before = Array.from({ length: 200 }, (_, index) => `old ${index}`).join("\n")
    const after = Array.from({ length: 200 }, (_, index) => `new ${index}`).join("\n")
    await render(
      <ToolCard part={part("edit", { input: { filePath: "big.ts", oldString: before, newString: after } })} />,
    )
    await fireEvent.press(screen.getByText("big.ts"))
    await fireEvent.press(screen.getByText(/more lines \(show all\)/))
    expect(screen.getByText("new 199")).toBeOnTheScreen()
  })

  it("ticks the duration while a tool is running and freezes it when done", async () => {
    await render(
      <ToolCard
        part={part("bash", {
          status: "running",
          input: { command: "sleep" },
          timing: { created: Date.now() - 10_000 },
        })}
      />,
    )
    expect(screen.getByText(/10(\.\d+)?s/)).toBeOnTheScreen()

    await render(
      <ToolCard
        part={part("bash", { input: { command: "done" }, timing: { created: 1_000, completed: 3_500 } })}
      />,
    )
    expect(screen.getByText("2.5s")).toBeOnTheScreen()
  })
})
