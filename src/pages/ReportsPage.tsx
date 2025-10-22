import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"
import { inr } from "../lib/format"
import Papa from "papaparse"

type Division = { id: string; name: string }
type DailyRow = { ts: string; incoming: number; outgoing: number; net: number }
type CatRow = { category_id: string | null; category_name: string | null; kind: "INCOMING"|"OUTGOING"; total: number }

async function fetchDivisions(): Promise<Division[]> {
  const { data, error } = await supabase.from("divisions").select("id,name").order("name")
  if (error) throw error
  return data ?? []
}

/** Query daily summary by range & (optional) division */
async function fetchDaily(from: string, to: string, divisionId: string | ""): Promise<DailyRow[]> {
  // v_daily_summary is per-owner; we’ll slice by date and then if division filter is present,
  // recompute from journal for that division for accuracy.
  if (!divisionId) {
    const { data, error } = await supabase
      .from("v_daily_summary")
      .select("ts,incoming,outgoing,net")
      .gte("ts", from)
      .lte("ts", to)
      .order("ts", { ascending: true })
    if (error) throw error
    return data ?? []
  } else {
    // recompute daily per division
    const { data, error } = await supabase
      .from("journal")
      .select("ts, kind, amount")
      .gte("ts", from)
      .lte("ts", to)
      .eq("division_id", divisionId)
      .order("ts", { ascending: true })
    if (error) throw error
    // reduce client-side
    const map = new Map<string, { incoming: number; outgoing: number }>()
    for (const r of (data ?? [])) {
      const k = r.ts as string
      const rec = map.get(k) ?? { incoming: 0, outgoing: 0 }
      if (r.kind === "INCOMING") rec.incoming += Number(r.amount)
      else rec.outgoing += Number(r.amount)
      map.set(k, rec)
    }
    return Array.from(map.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([ts, v]) => ({
      ts, incoming: v.incoming, outgoing: v.outgoing, net: v.incoming - v.outgoing
    }))
  }
}

/** Aggregate by category for the range (+ optional division and kind) */
async function fetchByCategory(from: string, to: string, divisionId: string | "", kind: "ALL"|"INCOMING"|"OUTGOING"): Promise<CatRow[]> {
  let q = supabase
    .from("journal")
    .select("category_id, amount, kind, categories(name)")
    .gte("ts", from)
    .lte("ts", to)

  if (divisionId) q = q.eq("division_id", divisionId)
  if (kind !== "ALL") q = q.eq("kind", kind)

  const { data, error } = await q
  if (error) throw error

  const map = new Map<string, { name: string | null; kind: "INCOMING"|"OUTGOING"; total: number }>()
  for (const r of (data ?? []) as any[]) {
    const id = r.category_id ?? "uncat"
    const k = `${id}:${r.kind}`
    const name = r.categories?.name ?? (id === "uncat" ? "Uncategorized" : "Unknown")
    const cur = map.get(k) ?? { name, kind: r.kind, total: 0 }
    cur.total += Number(r.amount)
    map.set(k, cur)
  }

  const rows: CatRow[] = Array.from(map.entries()).map(([key, v]) => {
    const [category_id] = key.split(":")
    return { category_id: category_id === "uncat" ? null : category_id, category_name: v.name, kind: v.kind, total: v.total }
  })
  // sort: outgoing first then incoming, and by total desc
  return rows.sort((a,b) => {
    if (a.kind !== b.kind) return a.kind === "OUTGOING" ? -1 : 1
    return b.total - a.total
  })
}

export default function ReportsPage() {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, "0")
  const dd = String(today.getDate()).padStart(2, "0")
  const startOfMonth = `${yyyy}-${mm}-01`
  const todayStr = `${yyyy}-${mm}-${dd}`

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(todayStr)
  const [divisionId, setDivisionId] = useState<string | "">("")
  const [kind, setKind] = useState<"ALL"|"INCOMING"|"OUTGOING">("ALL")

  const { data: divisions } = useQuery({ queryKey: ["divisions"], queryFn: fetchDivisions })
  const { data: daily, isLoading: loadingDaily, error: errDaily } = useQuery({
    queryKey: ["daily", from, to, divisionId],
    queryFn: () => fetchDaily(from, to, divisionId)
  })
  const { data: byCat, isLoading: loadingCat, error: errCat } = useQuery({
    queryKey: ["byCat", from, to, divisionId, kind],
    queryFn: () => fetchByCategory(from, to, divisionId, kind)
  })

  const totals = useMemo(() => {
    const incoming = (daily ?? []).reduce((s, r) => s + Number(r.incoming), 0)
    const outgoing = (daily ?? []).reduce((s, r) => s + Number(r.outgoing), 0)
    return { incoming, outgoing, net: incoming - outgoing }
  }, [daily])

  function downloadCSV() {
    const rows = [
      ["From", from],
      ["To", to],
      ["Division", divisions?.find(d=>d.id===divisionId)?.name ?? "All"],
      ["Kind", kind],
      [],
      ["Daily Summary"],
      ["Date", "Incoming", "Outgoing", "Net"],
      ...(daily ?? []).map(r => [r.ts, r.incoming, r.outgoing, r.net]),
      [],
      ["By Category"],
      ["Category", "Kind", "Total"],
      ...(byCat ?? []).map(r => [r.category_name ?? "Uncategorized", r.kind, r.total])
    ]
    const csv = Papa.unparse(rows, { newline: "\r\n" })
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `report_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    // ensure from <= to; if not, reset to today
    if (from > to) setTo(from)
  }, [from, to])

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-xl font-semibold">Reports</h1>
      <p className="text-sm text-gray-600 mb-4">Totals, daily trend, and category breakdown with CSV export.</p>

      {/* Filters */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm mb-5">
        <div className="grid sm:grid-cols-5 gap-3">
          <div>
            <label className="text-sm">From</label>
            <input type="date" className="w-full rounded-lg border px-3 py-2" value={from} onChange={e=>setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">To</label>
            <input type="date" className="w-full rounded-lg border px-3 py-2" value={to} onChange={e=>setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Division</label>
            <select className="w-full rounded-lg border px-3 py-2" value={divisionId} onChange={e=>setDivisionId(e.target.value)}>
              <option value="">All</option>
              {divisions?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Kind</label>
            <select className="w-full rounded-lg border px-3 py-2" value={kind} onChange={e=>setKind(e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="INCOMING">Incoming</option>
              <option value="OUTGOING">Outgoing</option>
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={downloadCSV} className="w-full rounded-lg bg-black text-white px-4 py-2">Export CSV</button>
          </div>
        </div>
      </div>

      {/* Total cards */}
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Total Incoming</div>
          <div className="text-lg font-semibold">{inr(totals.incoming)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Total Outgoing</div>
          <div className="text-lg font-semibold">{inr(totals.outgoing)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Net</div>
          <div className="text-lg font-semibold">{inr(totals.net)}</div>
        </div>
      </div>

      {/* Daily summary */}
      <div className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium mb-2">Daily Summary</h2>
        {loadingDaily && <p>Loading…</p>}
        {errDaily && <p className="text-red-600">{(errDaily as any).message}</p>}
        {!loadingDaily && !errDaily && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Incoming</th>
                  <th className="py-2 pr-4">Outgoing</th>
                  <th className="py-2 pr-4">Net</th>
                </tr>
              </thead>
              <tbody>
                {(daily ?? []).map(r => (
                  <tr key={r.ts} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{r.ts}</td>
                    <td className="py-2 pr-4">{inr(r.incoming)}</td>
                    <td className="py-2 pr-4">{inr(r.outgoing)}</td>
                    <td className="py-2 pr-4">{inr(r.net)}</td>
                  </tr>
                ))}
                {(daily ?? []).length === 0 && (
                  <tr><td className="py-2 text-gray-600" colSpan={4}>No rows in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By category */}
      <div className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium mb-2">By Category</h2>
        {loadingCat && <p>Loading…</p>}
        {errCat && <p className="text-red-600">{(errCat as any).message}</p>}
        {!loadingCat && !errCat && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Kind</th>
                  <th className="py-2 pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {(byCat ?? []).map((r, idx) => (
                  <tr key={idx} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">{r.category_name ?? "Uncategorized"}</td>
                    <td className="py-2 pr-4">{r.kind}</td>
                    <td className="py-2 pr-4">{inr(r.total)}</td>
                  </tr>
                ))}
                {(byCat ?? []).length === 0 && (
                  <tr><td className="py-2 text-gray-600" colSpan={3}>No rows in this range.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
