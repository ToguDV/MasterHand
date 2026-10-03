import { fireEvent, render, screen } from "@testing-library/react-native"
import type { ChatToolPart, FormInfo } from "@masterhand/client-core"
import { QuestionCard } from "../src/components/QuestionCard"

function questionPart(state: Partial<ChatToolPart["state"]> = {}): ChatToolPart {
  return {
    id: "p-q",
    sessionID: "s1",
    messageID: "m1",
    type: "tool",
    tool: "question",
    callID: "c1",
    state: { status: "running", input: {}, ...state },
  }
}

function form(
  fields: FormInfo["fields"],
  metadata: FormInfo["metadata"] = { kind: "question", tool: { messageID: "m1", id: "c1" } },
): FormInfo {
  return {
    id: "frm_1",
    sessionID: "s1",
    title: "Questions",
    fields,
    metadata,
  }
}

describe("QuestionCard", () => {
  it("renders the options and replies with the chosen answer", async () => {
    const onRespond = jest.fn()
    const info = form([
      {
        key: "db",
        type: "string",
        title: "Database",
        required: true,
        options: [
          { label: "Postgres", value: "pg", description: "Relational" },
          { label: "SQLite", value: "sqlite" },
        ],
      },
    ])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={onRespond}
        onCancel={jest.fn()}
      />,
    )

    expect(screen.getByText(/Database/)).toBeOnTheScreen()
    expect(screen.getByText("Relational")).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("Postgres"))
    await fireEvent.press(screen.getByText("Answer"))
    expect(onRespond).toHaveBeenCalledWith(info, { db: "pg" })
  })

  it("blocks submit until required fields are answered", async () => {
    const onRespond = jest.fn()
    const info = form([{ key: "name", type: "string", title: "Name", required: true, placeholder: "Your name" }])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={onRespond}
        onCancel={jest.fn()}
      />,
    )

    await fireEvent.press(screen.getByText("Answer"))
    expect(onRespond).not.toHaveBeenCalled()
    expect(screen.getByText("This field is required")).toBeOnTheScreen()

    await fireEvent.changeText(screen.getByPlaceholderText("Your name"), "Ada")
    await fireEvent.press(screen.getByText("Answer"))
    expect(onRespond).toHaveBeenCalledWith(info, { name: "Ada" })
  })

  it("dismisses the question", async () => {
    const onCancel = jest.fn()
    const info = form([{ key: "name", type: "string", title: "Name" }])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={jest.fn()}
        onCancel={onCancel}
      />,
    )

    await fireEvent.press(screen.getByText("Dismiss"))
    expect(onCancel).toHaveBeenCalledWith(info)
  })

  it("shows a read-only summary once answered", async () => {
    const info = form([{ key: "db", type: "string", title: "Database" }])
    await render(
      <QuestionCard
        part={questionPart({ status: "completed" })}
        forms={[]}
        answeredForms={[{ form: info, answer: { db: "pg" } }]}
        busyFormID={null}
        onRespond={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    expect(screen.getByText("Answered")).toBeOnTheScreen()
    expect(screen.getByText("pg")).toBeOnTheScreen()
    expect(screen.queryByText("Answer")).toBeNull()
  })

  it("toggles a boolean field", async () => {
    const onRespond = jest.fn()
    const info = form([{ key: "flag", type: "boolean", title: "Enable feature" }])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={onRespond}
        onCancel={jest.fn()}
      />,
    )

    expect(screen.getByText("Enable feature")).toBeOnTheScreen()
    await fireEvent(screen.getByRole("switch"), "valueChange", true)
    await fireEvent.press(screen.getByText("Answer"))
    expect(onRespond).toHaveBeenCalledWith(info, { flag: true })
  })

  it("validates numeric bounds and accepts a valid number", async () => {
    const onRespond = jest.fn()
    const info = form([{ key: "count", type: "integer", title: "Count", minimum: 5 }])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={onRespond}
        onCancel={jest.fn()}
      />,
    )

    await fireEvent.changeText(screen.getByLabelText("Count"), "1")
    await fireEvent.press(screen.getByText("Answer"))
    expect(screen.getByText("Must be at least 5")).toBeOnTheScreen()
    expect(onRespond).not.toHaveBeenCalled()

    await fireEvent.changeText(screen.getByLabelText("Count"), "10")
    await fireEvent.press(screen.getByText("Answer"))
    expect(onRespond).toHaveBeenCalledWith(info, { count: 10 })
  })

  it("selects multiselect options and appends custom values as chips", async () => {
    const onRespond = jest.fn()
    const info = form([
      {
        key: "tags",
        type: "multiselect",
        title: "Tags",
        options: [
          { label: "Alpha", value: "a" },
          { label: "Beta", value: "b" },
        ],
        minItems: 1,
        custom: true,
      },
    ])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={onRespond}
        onCancel={jest.fn()}
      />,
    )

    await fireEvent.press(screen.getByText("Alpha"))
    await fireEvent.changeText(screen.getByLabelText("Add Tags"), "Gamma")
    await fireEvent.press(screen.getByText("Add"))
    expect(screen.getByText("Gamma ×")).toBeOnTheScreen()

    await fireEvent.press(screen.getByText("Answer"))
    expect(onRespond).toHaveBeenCalledWith(info, { tags: ["a", "Gamma"] })
  })

  it("renders an external field as an informational link", async () => {
    const info = form([{ key: "link", type: "external", url: "https://example.com/help", title: "Docs" }])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    expect(screen.getByText("https://example.com/help")).toBeOnTheScreen()
  })

  it("reveals conditional fields when their trigger is answered", async () => {
    const info = form([
      { key: "flag", type: "boolean", title: "Advanced" },
      { key: "level", type: "string", title: "Level", when: [{ key: "flag", op: "eq", value: true }] },
    ])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    expect(screen.queryByText("Level")).toBeNull()
    await fireEvent(screen.getByRole("switch"), "valueChange", true)
    expect(screen.getByText("Level")).toBeOnTheScreen()
  })

  it("supports the custom 'Other…' option", async () => {
    const onRespond = jest.fn()
    const info = form([
      {
        key: "db",
        type: "string",
        title: "Database",
        options: [{ label: "Postgres", value: "pg" }],
        custom: true,
      },
    ])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={onRespond}
        onCancel={jest.fn()}
      />,
    )

    await fireEvent.press(screen.getByText("Other…"))
    await fireEvent.changeText(screen.getByLabelText("Database"), "MySQL")
    await fireEvent.press(screen.getByText("Answer"))
    expect(onRespond).toHaveBeenCalledWith(info, { db: "MySQL" })
  })

  it("disables submit while the reply is in flight", async () => {
    const onRespond = jest.fn()
    const info = form([{ key: "name", type: "string", title: "Name" }])
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={info.id}
        onRespond={onRespond}
        onCancel={jest.fn()}
      />,
    )

    expect(screen.getByText("Sending…")).toBeOnTheScreen()
    await fireEvent.press(screen.getByText("Sending…"))
    expect(onRespond).not.toHaveBeenCalled()
  })

  it("matches a single same-session question when the form has no tool metadata", async () => {
    const info = form([{ key: "name", type: "string", title: "Name" }], { kind: "question" })
    await render(
      <QuestionCard
        part={questionPart()}
        forms={[info]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    expect(screen.getByTestId("question-card")).toBeOnTheScreen()
    expect(screen.getByText("Name")).toBeOnTheScreen()
  })

  it("falls back to the tool output when no local answer is available", async () => {
    await render(
      <QuestionCard
        part={questionPart({ status: "completed", output: "Answered: postgres" })}
        forms={[]}
        answeredForms={[]}
        busyFormID={null}
        onRespond={jest.fn()}
        onCancel={jest.fn()}
      />,
    )

    expect(screen.getByText("Answered: postgres")).toBeOnTheScreen()
  })
})
