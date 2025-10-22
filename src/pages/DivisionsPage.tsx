import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"
import { useState } from "react"

type Division = { id: string; name: string; area: string | null; created_at: string }

async function fetchDivisions(): Promise<Division[]> {
  const { data, error } = await supabase.from("divisions").select("id,name,area,created_at").order("name")
  if (error) throw error
  return data ?? []
}
async function createDivision(values: { name: string; area?: string }) {
  const { error } = await supabase.from("divisions").insert([{ name: values.name, area: values.area ?? null }])
  if (error) throw error
}
async function deleteDivision(id: string) {
  const { error } = await supabase.from("divisions").delete().eq("id", id)
  if (error) throw error
}

export default function DivisionsPage() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ["divisions"], queryFn: fetchDivisions })
  const [name, setName] = useState("")
  const [area, setArea] = useState("")

  const addMut = useMutation({
    mutationFn: createDivision,
    onSuccess: () => { setName(""); setArea(""); qc.invalidateQueries({ queryKey: ["divisions"] }) }
  })
  const delMut = useMutation({
    mutationFn: deleteDivision,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["divisions"] })
  })

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">Divisions</h1>
      <p className="text-sm text-gray-600 mb-4">Add and manage postal divisions.</p>

      <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={(e)=>{e.preventDefault(); addMut.mutate({ name, area })}}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-sm">Name</label>
            <input className="w-full rounded-lg border px-3 py-2" value={name} onChange={e=>setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm">Area (district/mandal)</label>
            <input className="w-full rounded-lg border px-3 py-2" value={area} onChange={e=>setArea(e.target.value)} />
          </div>
        </div>
        <button disabled={addMut.isPending} className="mt-3 rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60">
          {addMut.isPending ? "Adding…" : "Add Division"}
        </button>
        {addMut.isError && <p className="text-red-600 text-sm mt-2">{(addMut.error as any).message}</p>}
      </form>

      <div className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
        {isLoading && <p>Loading…</p>}
        {error && <p className="text-red-600">{(error as any).message}</p>}
        {!isLoading && !error && (
          <ul className="divide-y">
            {data?.map(d => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{d.name}</div>
                  <div className="text-sm text-gray-600">{d.area || "—"}</div>
                </div>
                <button onClick={()=>delMut.mutate(d.id)} className="text-red-600 text-sm underline" disabled={delMut.isPending}>
                  Delete
                </button>
              </li>
            ))}
            {data?.length === 0 && <li className="py-2 text-sm text-gray-600">No divisions yet.</li>}
          </ul>
        )}
      </div>
    </div>
  )
}
