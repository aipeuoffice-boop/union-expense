import { useState, useEffect, type ChangeEvent } from "react"
import { supabase } from "../lib/supabase"

type DivisionRow = { name: string; area?: string }
type PersonRow = { full_name: string; division_id?: string }
type GroupRow = { name: string; division_id?: string }

export default function BulkUploadPage() {
  const [table, setTable] = useState<"divisions" | "persons" | "groups">("divisions")
  const [divRows, setDivRows] = useState<DivisionRow[]>([{ name: "", area: "" }])
  const [personRows, setPersonRows] = useState<PersonRow[]>([{ full_name: "", division_id: "" }])
  const [groupRows, setGroupRows] = useState<GroupRow[]>([{ name: "", division_id: "" }])
  const [divisionsList, setDivisionsList] = useState<Array<{ id: string; name: string; area?: string }>>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const addRow = () => {
  if (table === "divisions") setDivRows((s) => [...s, { name: "", area: "" }])
  if (table === "persons") setPersonRows((s) => [...s, { full_name: "", division_id: "" }])
  if (table === "groups") setGroupRows((s) => [...s, { name: "", division_id: "" }])
  }

  useEffect(() => {
    let mounted = true
    async function loadDivs() {
      const { data, error } = await supabase.from("divisions").select("id,name,area").order("name")
      if (error) {
        console.error("Failed to load divisions", error)
        return
      }
      if (mounted) setDivisionsList(data ?? [])
    }
    loadDivs()
    return () => { mounted = false }
  }, [])

  const removeRow = (idx: number) => {
  if (table === "divisions") setDivRows((s) => s.filter((_, i) => i !== idx))
  if (table === "persons") setPersonRows((s) => s.filter((_, i) => i !== idx))
  if (table === "groups") setGroupRows((s) => s.filter((_, i) => i !== idx))
  }

  const updateRow = (idx: number, partial: Partial<DivisionRow | PersonRow | GroupRow>) => {
  if (table === "divisions") setDivRows((s) => s.map((r, i) => (i === idx ? { ...r, ...(partial as DivisionRow) } : r)))
  if (table === "persons") setPersonRows((s) => s.map((r, i) => (i === idx ? { ...r, ...(partial as PersonRow) } : r)))
  if (table === "groups") setGroupRows((s) => s.map((r, i) => (i === idx ? { ...r, ...(partial as GroupRow) } : r)))
  }

  const insertRows = async () => {
    setMessage(null)
    setLoading(true)
    try {
      if (table === "divisions") {
        const payload = divRows.map(r => ({ name: r.name || null, area: r.area || null }))
        const { error } = await supabase.from("divisions").insert(payload)
        if (error) throw error
        setMessage(`Inserted ${payload.length} divisions`)
      }
      if (table === "persons") {
        const payload = personRows.map(r => ({ full_name: r.full_name || null, division_id: r.division_id || null }))
        const { error } = await supabase.from("persons").insert(payload)
        if (error) throw error
        setMessage(`Inserted ${payload.length} persons`)
      }
      if (table === "groups") {
        const payload = groupRows.map(r => ({ name: r.name || null, division_id: r.division_id || null }))
        const { error } = await supabase.from("groups").insert(payload)
        if (error) throw error
        setMessage(`Inserted ${payload.length} groups`)
      }
    } catch (e: unknown) {
      const err = e as Error
      setMessage(`Insert failed: ${err.message ?? String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const currentCount = table === "divisions" ? divRows.length : table === "persons" ? personRows.length : groupRows.length

  return (
    <div className="container">
      <h1 className="h1">Bulk Upload (UI)</h1>
  <p className="small mb-4">Add multiple rows directly in the UI for Divisions, Persons or Groups and insert them in one batch.</p>

      <div className="card p-4 mb-4">
        <label className="block text-sm mb-2">Target type</label>
  <select value={table} onChange={(e: ChangeEvent<HTMLSelectElement>) => setTable(e.target.value as "divisions" | "persons" | "groups")} className="border rounded px-2 py-1">
          <option value="divisions">Divisions</option>
          <option value="persons">Persons</option>
          <option value="groups">Groups</option>
        </select>

        <div className="mt-4">
          <button type="button" className="btn mr-2" onClick={addRow}>Add row</button>
          <button type="button" className="btn btn-outline" disabled={currentCount === 0} onClick={insertRows}>{loading ? "Inserting..." : `Insert ${currentCount} rows`}</button>
        </div>

        {message && <div className="mt-3 text-sm text-gray-700">{message}</div>}
      </div>

      <div className="card p-4">
        {table === "divisions" && (
          <div>
            <h3 className="font-semibold mb-2">Divisions ({divRows.length})</h3>
            <div className="space-y-2">
              {divRows.map((r, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input className="col-span-6 sm:col-span-4 border rounded px-2 py-1" placeholder="Name" value={r.name} onChange={(e: ChangeEvent<HTMLInputElement>)=>updateRow(idx, { name: e.target.value })} />
                  <input className="col-span-6 sm:col-span-4 border rounded px-2 py-1" placeholder="Area" value={r.area} onChange={(e: ChangeEvent<HTMLInputElement>)=>updateRow(idx, { area: e.target.value })} />
                  <button className="col-span-12 sm:col-span-4 btn btn-ghost mt-2 sm:mt-0" onClick={()=>removeRow(idx)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {table === "persons" && (
          <div>
            <h3 className="font-semibold mb-2">Persons ({personRows.length})</h3>
            <div className="space-y-2">
              {personRows.map((r, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input className="col-span-8 sm:col-span-6 border rounded px-2 py-1" placeholder="Full name" value={r.full_name} onChange={(e: ChangeEvent<HTMLInputElement>)=>updateRow(idx, { full_name: e.target.value })} />
                  <select className="col-span-4 sm:col-span-4 border rounded px-2 py-1" value={r.division_id ?? ""} onChange={(e: ChangeEvent<HTMLSelectElement>)=>updateRow(idx, { division_id: e.target.value })}>
                    <option value="">No division</option>
                    {divisionsList.map(d => (
                      <option key={d.id} value={d.id}>{d.name}{d.area?` — ${d.area}`:""}</option>
                    ))}
                  </select>
                  <button className="col-span-12 sm:col-span-2 btn btn-ghost mt-2 sm:mt-0" onClick={()=>removeRow(idx)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {table === "groups" && (
          <div>
            <h3 className="font-semibold mb-2">Groups ({groupRows.length})</h3>
            <div className="space-y-2">
              {groupRows.map((r, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input className="col-span-8 sm:col-span-6 border rounded px-2 py-1" placeholder="Name" value={r.name} onChange={(e: ChangeEvent<HTMLInputElement>)=>updateRow(idx, { name: e.target.value })} />
                  <select className="col-span-4 sm:col-span-4 border rounded px-2 py-1" value={r.division_id ?? ""} onChange={(e: ChangeEvent<HTMLSelectElement>)=>updateRow(idx, { division_id: e.target.value })}>
                    <option value="">No division</option>
                    {divisionsList.map(d => (
                      <option key={d.id} value={d.id}>{d.name}{d.area?` — ${d.area}`:""}</option>
                    ))}
                  </select>
                  <button className="col-span-12 sm:col-span-2 btn btn-ghost mt-2 sm:mt-0" onClick={()=>removeRow(idx)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
