export interface SseMessage {
  event?: string
  data: string
  id?: string
}

function parseBlock(block: string): SseMessage | null {
  const lines = block.split("\n")
  let data = ""
  let event: string | undefined
  let id: string | undefined

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue
    const colon = line.indexOf(":")
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? "" : line.slice(colon + 1)
    if (value.startsWith(" ")) value = value.slice(1)

    if (field === "data") data += (data ? "\n" : "") + value
    else if (field === "event") event = value
    else if (field === "id") id = value
  }

  if (!data && !event && !id) return null
  return { event, data, id }
}

export async function* parseSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<SseMessage> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n")

      let separator = buffer.indexOf("\n\n")
      while (separator !== -1) {
        const block = buffer.slice(0, separator)
        buffer = buffer.slice(separator + 2)
        const message = parseBlock(block)
        if (message) yield message
        separator = buffer.indexOf("\n\n")
      }
    }
    const rest = parseBlock(buffer)
    if (rest) yield rest
  } finally {
    reader.releaseLock()
  }
}
