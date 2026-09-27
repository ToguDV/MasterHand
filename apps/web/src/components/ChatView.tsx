import { useEffect, useRef } from "react"
import { useMessages } from "@masterhand/client-core"
import { client } from "../client"
import { AssistantBlock, UserBubble } from "./MessageContent"
import { Composer } from "./Composer"

export function ChatView({ sessionID, busy, connected }: { sessionID: string; busy: boolean; connected: boolean }) {
  const messagesQuery = useMessages(client, sessionID, { busy, connected })

  const messages = messagesQuery.data ?? []
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)

  useEffect(() => {
    const element = scrollRef.current
    if (element && stickToBottom.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [messages])

  function handleScroll() {
    const element = scrollRef.current
    if (!element) return
    stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          {messagesQuery.isLoading && <p className="text-center text-sm text-zinc-500">Loading conversation…</p>}
          {messagesQuery.error && (
            <p className="text-center text-sm text-red-400">Could not load the conversation</p>
          )}
          {!messagesQuery.isLoading && messages.length === 0 && (
            <p className="py-12 text-center text-sm text-zinc-500">
              Write a message to start working with the agent.
            </p>
          )}
          {messages.map((entry) =>
            entry.info.role === "user" ? (
              <UserBubble key={entry.info.id} entry={entry} />
            ) : (
              <AssistantBlock key={entry.info.id} entry={entry} />
            ),
          )}
        </div>
      </div>
      <Composer sessionID={sessionID} busy={busy} />
    </div>
  )
}
