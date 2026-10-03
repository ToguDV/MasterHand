import { describe, expect, it } from "vitest"
import {
  defaultAnswer,
  describeFormAnswer,
  fieldLabel,
  formIsQuestion,
  formToolCallID,
  formatAnswerValue,
  isFieldVisible,
  reconcileForms,
  toFormAnswer,
  validateForm,
} from "../src/forms"
import type { FormField, FormInfo } from "../src/types"

function form(fields: FormField[], metadata?: Record<string, unknown>): FormInfo {
  return {
    id: "frm_1",
    sessionID: "ses_1",
    title: "Questions",
    fields: fields as FormInfo["fields"],
    ...(metadata ? { metadata: metadata as FormInfo["metadata"] } : {}),
  }
}

function info(id: string, sessionID: string): FormInfo {
  return { id, sessionID, title: "Questions", fields: [{ key: "a", type: "string" }] }
}

describe("reconcileForms", () => {
  it("drops covered forms missing from the server snapshot", () => {
    expect(reconcileForms([info("frm_1", "ses_1")], [], new Set(["ses_1"]))).toEqual([])
  })

  it("refreshes covered forms still pending on the server", () => {
    const fresh = info("frm_1", "ses_1")
    expect(reconcileForms([info("frm_1", "ses_1")], [fresh], new Set(["ses_1"]))).toEqual([fresh])
  })

  it("keeps forms outside the covered sessions", () => {
    const result = reconcileForms(
      [info("frm_1", "ses_1"), info("frm_2", "ses_2")],
      [],
      new Set(["ses_1"]),
    )
    expect(result.map((item) => item.id)).toEqual(["frm_2"])
  })

  it("appends server forms not tracked locally and does not duplicate", () => {
    const fresh = info("frm_1", "ses_1")
    expect(reconcileForms([info("frm_2", "ses_2")], [fresh], new Set(["ses_1"])).map((f) => f.id)).toEqual([
      "frm_2",
      "frm_1",
    ])
    expect(reconcileForms([info("frm_2", "ses_2")], [info("frm_2", "ses_2")], new Set()).map((f) => f.id)).toEqual([
      "frm_2",
    ])
  })
})

describe("form metadata", () => {
  it("detects question forms", () => {
    expect(formIsQuestion(form([], { kind: "question" }))).toBe(true)
    expect(formIsQuestion(form([], { kind: "mcp" }))).toBe(false)
    expect(formIsQuestion(form([]))).toBe(false)
  })

  it("reads the tool call id that anchors the form to a tool part", () => {
    expect(formToolCallID(form([], { kind: "question", tool: { messageID: "msg_1", id: "call_1" } }))).toBe("call_1")
    expect(formToolCallID(form([], { kind: "question" }))).toBeNull()
    expect(formToolCallID(form([], { kind: "question", tool: "nope" }))).toBeNull()
    expect(formToolCallID(form([], { kind: "question", tool: { id: "" } }))).toBeNull()
  })
})

describe("field visibility and defaults", () => {
  const fields: FormField[] = [
    { key: "useDb", type: "boolean" },
    { key: "db", type: "string", title: "Database", when: [{ key: "useDb", op: "eq", value: true }] },
    { key: "secret", type: "string", hidden: true },
  ]

  it("keeps conditionals hidden until the trigger matches", () => {
    expect(isFieldVisible(fields[0]!, {})).toBe(true)
    expect(isFieldVisible(fields[1]!, {})).toBe(false)
    expect(isFieldVisible(fields[1]!, { useDb: true })).toBe(true)
    expect(isFieldVisible(fields[2]!, {})).toBe(false)
  })

  it("supports neq conditions and array values", () => {
    const field: FormField = { key: "x", type: "string", when: [{ key: "mode", op: "neq", value: "auto" }] }
    expect(isFieldVisible(field, {})).toBe(true)
    expect(isFieldVisible(field, { mode: "auto" })).toBe(false)
    const multi: FormField = { key: "y", type: "string", when: [{ key: "tags", op: "eq", value: "a" }] }
    expect(isFieldVisible(multi, { tags: ["a", "b"] })).toBe(true)
    expect(isFieldVisible(multi, { tags: ["b"] })).toBe(false)
  })

  it("builds the initial answer from defaults and boolean false", () => {
    const answer = defaultAnswer(
      form([
        { key: "name", type: "string", default: "hand" },
        { key: "count", type: "number", default: 3 },
        { key: "flag", type: "boolean" },
        { key: "tags", type: "multiselect", options: [{ label: "a", value: "a" }], default: ["a"] },
        { key: "hidden", type: "string", hidden: true, default: "x" },
        { key: "dep", type: "string", when: [{ key: "flag", op: "eq", value: true }], default: "y" },
      ]),
    )
    expect(answer).toEqual({ name: "hand", count: 3, flag: false, tags: ["a"] })
  })

  it("labels a field by title or key", () => {
    expect(fieldLabel({ key: "a", type: "string", title: "Alpha" })).toBe("Alpha")
    expect(fieldLabel({ key: "a", type: "string" })).toBe("a")
  })
})

describe("validateForm", () => {
  it("flags required fields", () => {
    const errors = validateForm(form([{ key: "a", type: "string", required: true }]), {})
    expect(errors).toEqual({ a: "This field is required" })
  })

  it("checks string length and pattern", () => {
    expect(validateForm(form([{ key: "a", type: "string", minLength: 3 }]), { a: "ab" })).toEqual({
      a: "At least 3 characters",
    })
    expect(validateForm(form([{ key: "a", type: "string", maxLength: 2 }]), { a: "abc" })).toEqual({
      a: "At most 2 characters",
    })
    expect(validateForm(form([{ key: "a", type: "string", pattern: "^\\d+$" }]), { a: "abc" })).toEqual({
      a: "Must match ^\\d+$",
    })
    expect(validateForm(form([{ key: "a", type: "string", pattern: "([unclosed" }]), { a: "abc" })).toEqual({})
  })

  it("checks numeric bounds", () => {
    expect(validateForm(form([{ key: "n", type: "number", minimum: 5 }]), { n: 1 })).toEqual({
      n: "Must be at least 5",
    })
    expect(validateForm(form([{ key: "n", type: "integer", maximum: 5 }]), { n: 9 })).toEqual({
      n: "Must be at most 5",
    })
    expect(validateForm(form([{ key: "n", type: "number", minimum: 5 }]), {})).toEqual({})
  })

  it("checks multiselect bounds", () => {
    const field: FormField = { key: "m", type: "multiselect", options: [{ label: "a", value: "a" }], minItems: 1 }
    expect(validateForm(form([field]), { m: [] })).toEqual({ m: "Select at least 1" })
    const max: FormField = { key: "m", type: "multiselect", options: [{ label: "a", value: "a" }], maxItems: 1 }
    expect(validateForm(form([max]), { m: ["a", "b"] })).toEqual({ m: "Select at most 1" })
  })

  it("skips hidden, invisible and external fields", () => {
    const errors = validateForm(
      form([
        { key: "hidden", type: "string", required: true, hidden: true },
        { key: "dep", type: "string", required: true, when: [{ key: "flag", op: "eq", value: true }] },
        { key: "link", type: "external", url: "https://x.dev" },
      ]),
      {},
    )
    expect(errors).toEqual({})
  })

  it("ignores an empty optional string and accepts a complete answer", () => {
    expect(validateForm(form([{ key: "a", type: "string" }]), { a: "" })).toEqual({})
    expect(validateForm(form([{ key: "a", type: "string", required: true }]), { a: "ok" })).toEqual({})
  })

  it("requires a multiselect and a number when marked required", () => {
    expect(
      validateForm(
        form([
          { key: "m", type: "multiselect", options: [{ label: "a", value: "a" }], required: true },
          { key: "n", type: "number", required: true },
        ]),
        {},
      ),
    ).toEqual({ m: "This field is required", n: "This field is required" })
  })
})

describe("toFormAnswer", () => {
  it("coerces values to the reply types", () => {
    const answer = toFormAnswer(
      form([
        { key: "s", type: "string" },
        { key: "n", type: "number" },
        { key: "i", type: "integer" },
        { key: "b", type: "boolean" },
        { key: "m", type: "multiselect", options: [{ label: "a", value: "a" }] },
        { key: "link", type: "external", url: "https://x.dev" },
      ]),
      { s: "text", n: "2.5", i: 7, b: false, m: ["a"] },
    )
    expect(answer).toEqual({ s: "text", n: 2.5, i: 7, b: false, m: ["a"] })
  })

  it("drops invisible fields, invalid numbers and non-array multiselects", () => {
    const answer = toFormAnswer(
      form([
        { key: "dep", type: "string", when: [{ key: "flag", op: "eq", value: true }] },
        { key: "bad", type: "number" },
        { key: "m", type: "multiselect", options: [{ label: "a", value: "a" }] },
      ]),
      { dep: "hidden", bad: "not-a-number", m: "a" },
    )
    expect(answer).toEqual({ m: [] })
  })

  it("always writes booleans even without a value", () => {
    expect(toFormAnswer(form([{ key: "b", type: "boolean" }]), {})).toEqual({ b: false })
  })
})

describe("answer formatting", () => {
  it("formats each value kind", () => {
    expect(formatAnswerValue(["a", "b"])).toBe("a, b")
    expect(formatAnswerValue(true)).toBe("Yes")
    expect(formatAnswerValue(false)).toBe("No")
    expect(formatAnswerValue(3)).toBe("3")
    expect(formatAnswerValue(undefined)).toBe("—")
  })

  it("describes an answer as label/value rows, skipping hidden fields", () => {
    const rows = describeFormAnswer(
      form([
        { key: "a", type: "string", title: "Alpha" },
        { key: "hidden", type: "string", hidden: true },
      ]),
      { a: "one", hidden: "two" },
    )
    expect(rows).toEqual([{ key: "Alpha", value: "one" }])
  })
})
