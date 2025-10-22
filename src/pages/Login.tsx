import { useState } from "react"
import { useAuth } from "../auth"

export default function Login() {
  const { signInWithMagicLink } = useAuth()
  const [email, setEmail] = useState("aipeu.office@gmail.com")
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    const { error } = await signInWithMagicLink(email)
    setBusy(false)
    if (error) setErr(error.message ?? "Failed to send magic link")
    else setSent(true)
  }

  return (
    <div className="min-h-screen bg-gray-50 grid place-items-center p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <p className="text-sm text-gray-600 mt-1">Enter your email to receive a magic link.</p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input type="email" className="w-full rounded-lg border px-3 py-2"
            value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <button disabled={busy} className="w-full rounded-lg bg-black text-white py-2 disabled:opacity-60">
            {busy ? "Sending..." : "Send magic link"}
          </button>
        </form>
        {sent && <p className="text-green-700 text-sm mt-3">Check your inbox and click the link.</p>}
        {err && <p className="text-red-600 text-sm mt-3">{err}</p>}
      </div>
    </div>
  )
}
