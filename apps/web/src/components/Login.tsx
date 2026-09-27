import { useState } from "react"
import type { FormEvent } from "react"
import { ApiError } from "@masterhand/client-core"
import { client } from "../client"

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await client.auth.login(password)
      setPassword("")
      onSuccess()
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) setError("Too many attempts; wait 15 minutes")
        else if (err.status === 401) setError("Wrong password")
        else if (err.status === 400) setError("Enter a password")
        else setError(`Error ${err.status}`)
      } else {
        setError("Could not reach the MasterHand server")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
        <h1 className="text-xl font-bold">MasterHand</h1>
        <p className="mt-1 text-sm text-zinc-500">Your opencode agents, from anywhere.</p>
        <label htmlFor="password" className="mt-5 block text-xs font-medium text-zinc-400">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          autoFocus
          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-[15px] outline-none focus:border-indigo-500"
        />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  )
}
