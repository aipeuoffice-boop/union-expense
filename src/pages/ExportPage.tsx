import { useEffect, useState } from "react"
import Papa from "papaparse"
import { supabase } from "../lib/supabase"

type Division = { id: string; name: string }

async function fetchDivisions(): Promise<Division[]> {
  const { data, error } = await supabase.from("divisions").select("id,name").order("name")
  if (error) throw error
  return data ?? []
}

export default function ExportPage() {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const startOfMonth = `${yyyy}-${mm}-01`
  const today = `${yyyy}-${mm}-${dd}`

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(today)
  const [divisionId, setDivisionId] = useState<string | "">("")
  const [kind, setKind] = useState<"ALL" | "INCOMING" | "OUTGOING">("ALL")
  const [busy, setBusy] = useState(false)
  const [divisions, setDivisions] = useState<Division[]>([])

  useEffect(() => {
    fetchDivisions().then(setDivisions).catch(console.error)
  }, [])

  async function download() {
    setBusy(true)
    try {
      // Try selecting with related names (Supabase will follow FK relationships)
      let q = supabase.from("journal").select(`
        ts, kind, amount, notes,
        division:divisions(name),
        category:categories(name),
        person:persons(full_name),
        group:groups(name)
      `)
      q = q.gte("ts", from).lte("ts", to)
      if (divisionId) q = q.eq("division_id", divisionId)
      if (kind !== "ALL") q = q.eq("kind", kind)

      const { data, error } = await q
      if (error) throw error

      const rows = (data ?? []).map((r: any) => ({
        Date: r.ts,
        Kind: r.kind,
        Division: r.division?.name ?? "",
        Category: r.category?.name ?? "",
        Person: r.person?.full_name ?? "",
        Group: r.group?.name ?? "",
        Amount: Number(r.amount),
        Notes: r.notes ?? ""
      }))

      const csv = Papa.unparse(rows, { newline: "\r\n" })
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `journal_${from}_to_${to}${divisionId ? `_div_${divisionId}` : ""}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert((e as any).message || "Export failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Export</h1>
      <p className="text-sm text-gray-600 mb-4">Download journal rows as CSV with optional filters.</p>

      <div className="rounded-2xl border bg-white p-4 shadow-sm grid sm:grid-cols-5 gap-3">
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
            {divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
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
          <button onClick={download} disabled={busy} className="w-full rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60">
            {busy ? "Preparing…" : "Download CSV"}
          </button>
        </div>
      </div>
    </div>
  )
}
