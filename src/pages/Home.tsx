import { useQuery } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"
import { inr } from "../lib/format"
import { Link } from "react-router-dom"

async function fetchBalance(): Promise<number> {
  // Prefer the view if you have it; else compute with a quick aggregate
  const { data, error } = await supabase.from("v_balance").select("balance").limit(1)
  if (!error && data && data.length) return Number(data[0].balance) || 0

  // Fallback: compute from journal if the view is empty
  const { data: rows, error: e2 } = await supabase
    .from("journal")
    .select("kind, amount")
    .limit(20000) // enough for single-user
  if (e2) throw e2
  let incoming = 0, outgoing = 0
  for (const r of rows ?? []) {
    if (r.kind === "INCOMING") incoming += Number(r.amount) || 0
    else outgoing += Number(r.amount) || 0
  }
  return incoming - outgoing
}

export default function Home() {
  const { data: balance, isLoading } = useQuery({ queryKey: ["v_balance"], queryFn: fetchBalance })

  return (
    <div className="container">
      <h1 className="h1">Dashboard</h1>
      <p className="small mb-4">Welcome to the Postal Union expense tracker.</p>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-gray-600">Current Balance</div>
          <div className="text-2xl font-semibold">{isLoading ? "…" : inr(balance ?? 0)}</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-gray-600">Quick Action</div>
          <Link to="/journal" className="btn btn-primary mt-2 inline-block">Add Entry</Link>
        </div>

        <div className="card p-4">
          <div className="text-xs text-gray-600">Reports</div>
          <Link to="/stats" className="btn btn-outline mt-2 inline-block">View Stats</Link>
        </div>
      </div>
    </div>
  )
}
