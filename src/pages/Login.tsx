import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "../auth"

type Method = "magic" | "password" | "pin"

function getErrMsg(e: unknown) {
  if (!e) return "Unknown error"
  if (typeof e === "object" && "message" in e) return String((e as { message?: unknown }).message)
  return String(e)
}

export default function Login() {
  const { signInWithMagicLink, signInWithPassword, signUpWithPassword, signInWithPin, signUpWithPin } = useAuth()
  const navigate = useNavigate()
  const [method, setMethod] = useState<Method>("magic")
  const [mode, setMode] = useState<"signin" | "signup">("signin")

  const [email, setEmail] = useState("")
  const [secret, setSecret] = useState("") // password or pin
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    setSent(false)

    try {
      if (method === "magic") {
        const { error } = await signInWithMagicLink(email)
        if (error) setErr(getErrMsg(error))
        else setSent(true)
      } else if (method === "password") {
        if (mode === "signin") {
          const { error } = await signInWithPassword(email, secret)
          if (error) setErr(getErrMsg(error))
          else {
            // Successful sign-in: redirect to home
            navigate("/", { replace: true })
          }
        } else {
          const { error } = await signUpWithPassword(email, secret)
          if (error) setErr(getErrMsg(error))
          else setSent(true)
        }
      } else if (method === "pin") {
        // PIN is treated as a short password (see auth.tsx for security note)
        if (mode === "signin") {
          const { error } = await signInWithPin(email, secret)
          if (error) setErr(getErrMsg(error))
          else {
            // Successful sign-in: redirect to home
            navigate("/", { replace: true })
          }
        } else {
          const { error } = await signUpWithPin(email, secret)
          if (error) setErr(getErrMsg(error))
          else setSent(true)
        }
      }
    } catch (e) {
      setErr(getErrMsg(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    // Use flex centering for more predictable vertical centering across devices.
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6">
      {/* Card constrained to viewport height to avoid overflow; internal scroll if content exceeds height */}
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 shadow-sm overflow-y-auto max-h-[calc(100vh-4rem)]">
        <h1 className="text-xl font-semibold">Sign in</h1>

        <div className="mt-3 flex gap-2 text-sm">
          <label className={`px-3 py-1 rounded ${method==="magic"?"bg-black text-white":"border"}`}>
            <input type="radio" name="method" checked={method==="magic"} onChange={()=>setMethod("magic")} className="hidden" />
            Magic Link
          </label>
          <label className={`px-3 py-1 rounded ${method==="password"?"bg-black text-white":"border"}`}>
            <input type="radio" name="method" checked={method==="password"} onChange={()=>setMethod("password")} className="hidden" />
            Password
          </label>
          <label className={`px-3 py-1 rounded ${method==="pin"?"bg-black text-white":"border"}`}>
            <input type="radio" name="method" checked={method==="pin"} onChange={()=>setMethod("pin")} className="hidden" />
            PIN
          </label>
        </div>

        {method !== "magic" && (
          <div className="mt-2 text-sm">
            <label className="inline-flex items-center mr-3">
              <input type="radio" name="mode" checked={mode==="signin"} onChange={()=>setMode("signin")} className="mr-2" />
              Sign in
            </label>
            <label className="inline-flex items-center">
              <input type="radio" name="mode" checked={mode==="signup"} onChange={()=>setMode("signup")} className="mr-2" />
              Sign up
            </label>
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input type="email" className="w-full rounded-lg border px-3 py-2"
            value={email} onChange={(e)=>setEmail(e.target.value)} required />

          {method === "magic" ? null : (
            <input
              type={method === "pin" ? "password" : "password"}
              className="w-full rounded-lg border px-3 py-2"
              placeholder={method === "pin" ? "4-6 digit PIN" : "Password"}
              value={secret} onChange={(e)=>setSecret(e.target.value)} required />
          )}

          <button disabled={busy} className="w-full rounded-lg bg-black text-white py-2 disabled:opacity-60">
            {busy ? "Working..." : (method === "magic" ? "Send magic link" : mode === "signin" ? "Sign in" : "Sign up")}
          </button>
        </form>

        {sent && <p className="text-green-700 text-sm mt-3">Action completed — check messages or you're signed in.</p>}
        {err && <p className="text-red-600 text-sm mt-3">{err}</p>}

        <p className="text-xs text-gray-500 mt-4">Note: PINs are treated as short passwords (convenience). For production, prefer strong passwords or implement secure PIN storage / MFA.</p>
      </div>
    </div>
  )
}
