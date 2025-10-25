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

// Generic count helper using Postgres exact count via head:true
async function fetchCount(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true })
  if (error) throw error
  return count ?? 0
}

async function fetchExpensesThisMonth(): Promise<{ sum: number; count: number }>{
  // compute month start & end in ISO (server uses date or timestamptz)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)

  const { data, error } = await supabase
    .from("journal")
    .select("amount, kind")
    .gte("date", start.toISOString())
    .lt("date", end.toISOString())
    .eq("kind", "OUTGOING")
    .limit(20000)

  if (error) throw error
  let sum = 0
  for (const r of data ?? []) sum += Number(r.amount) || 0
  return { sum, count: (data ?? []).length }
}

export default function Home() {
  const { data: balance, isLoading: loadingBalance } = useQuery({ queryKey: ["v_balance"], queryFn: fetchBalance })

  const { data: categoriesCount, isLoading: loadingCategories } = useQuery({ queryKey: ["count", "categories"], queryFn: () => fetchCount("categories") })
  const { data: divisionsCount, isLoading: loadingDivisions } = useQuery({ queryKey: ["count", "divisions"], queryFn: () => fetchCount("divisions") })
  const { data: standardsCount, isLoading: loadingStandards } = useQuery({ queryKey: ["count", "standard_expenses"], queryFn: () => fetchCount("standard_expenses") })
  const { data: journalCount, isLoading: loadingJournal } = useQuery({ queryKey: ["count", "journal"], queryFn: () => fetchCount("journal") })

  const { data: thisMonth, isLoading: loadingMonth } = useQuery({ queryKey: ["expenses", "thisMonth"], queryFn: fetchExpensesThisMonth })

  
  const avgExpense = (thisMonth && thisMonth.count) ? (thisMonth.sum / thisMonth.count) : 0

  return (
    <div className="container">
      <h1 className="h1">Dashboard</h1>
      <p className="small mb-4">Welcome to the Postal Union expense tracker.</p>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <div className="text-xs text-gray-600">Current Balance</div>
          <div className="text-2xl font-semibold">{loadingBalance ? "…" : inr(balance ?? 0)}</div>
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

      <h2 className="h2 mt-6">Key Performance Indicators</h2>
      <div className="grid sm:grid-cols-3 gap-3 mt-2">
        <div className="card p-4">
          <div className="text-xs text-gray-600">Total Categories</div>
          <div className="text-2xl font-semibold">{loadingCategories ? "…" : (categoriesCount ?? 0)}</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-gray-600">Total Divisions</div>
          <div className="text-2xl font-semibold">{loadingDivisions ? "…" : (divisionsCount ?? 0)}</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-gray-600">Standard Expenses</div>
          <div className="text-2xl font-semibold">{loadingStandards ? "…" : (standardsCount ?? 0)}</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-gray-600">Journal Entries</div>
          <div className="text-2xl font-semibold">{loadingJournal ? "…" : (journalCount ?? 0)}</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-gray-600">Expenses This Month</div>
          <div className="text-2xl font-semibold">{loadingMonth ? "…" : inr(thisMonth?.sum ?? 0)}</div>
          <div className="text-xs text-gray-500 mt-1">{loadingMonth ? "" : `${thisMonth?.count ?? 0} outgoing entries`}</div>
        </div>

        <div className="card p-4">
          <div className="text-xs text-gray-600">Avg Expense (this month)</div>
          <div className="text-2xl font-semibold">{loadingMonth ? "…" : inr(avgExpense)}</div>
        </div>
      </div>
    </div>
  )
}
