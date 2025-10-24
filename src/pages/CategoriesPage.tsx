import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"
import { useState } from "react"
import { kindLabel } from "../lib/format"

type Category = { id: string; name: string; kind: "INCOMING"|"OUTGOING"; is_standard: boolean; created_at: string }

async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,kind,is_standard,created_at")
    .order("kind", { ascending: false })
    .order("name", { ascending: true })
  if (error) throw error
  return data ?? []
}
async function createCategory(values: { name: string; kind: "INCOMING"|"OUTGOING"; is_standard: boolean }) {
  const { error } = await supabase.from("categories").insert([values])
  if (error) throw error
}
async function deleteCategory(id: string) {
  const { error } = await supabase.from("categories").delete().eq("id", id)
  if (error) throw error
}

export default function CategoriesPage() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories })
  const [name, setName] = useState("")
  const [kind, setKind] = useState<"INCOMING"|"OUTGOING">("INCOMING")
  const [isStandard, setIsStandard] = useState(false)

  const addMut = useMutation({
    mutationFn: createCategory,
    onSuccess: () => { setName(""); setIsStandard(false); qc.invalidateQueries({ queryKey: ["categories"] }) }
  })
  const delMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] })
  })

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold">Categories</h1>
  <p className="text-sm text-gray-600 mb-4">Income and expense categories. Mark standard daily expenses.</p>

      <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={(e)=>{e.preventDefault(); addMut.mutate({ name, kind, is_standard: isStandard })}}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="text-sm">Name</label>
            <input className="w-full rounded-lg border px-3 py-2" value={name} onChange={e=>setName(e.target.value)} required />
          </div>
          <div>
            <label className="text-sm">Kind</label>
            <select className="w-full rounded-lg border px-3 py-2" value={kind} onChange={e=>setKind(e.target.value as "INCOMING"|"OUTGOING") }>
              <option value="INCOMING">{kindLabel("INCOMING")}</option>
              <option value="OUTGOING">{kindLabel("OUTGOING")}</option>
            </select>
          </div>
        </div>
        <label className="mt-3 inline-flex items-center gap-2">
          <input type="checkbox" checked={isStandard} onChange={(e)=>setIsStandard(e.target.checked)} />
          <span className="text-sm">Is standard daily expense</span>
        </label>
        <div>
          <button disabled={addMut.isPending} className="mt-3 rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60">
            {addMut.isPending ? "Adding…" : "Add Category"}
          </button>
        </div>
        {addMut.isError && <p className="text-red-600 text-sm mt-2">{(addMut.error as any).message}</p>}
      </form>

      <div className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
        {isLoading && <p>Loading…</p>}
        {error && <p className="text-red-600">{(error as any).message}</p>}
        {!isLoading && !error && (
          <ul className="divide-y">
            {data?.map(c => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-medium">{c.name}</div>
                  <div className="text-xs text-gray-600">{kindLabel(c.kind)} {c.is_standard ? "• standard" : ""}</div>
                </div>
                <button onClick={()=>delMut.mutate(c.id)} className="text-red-600 text-sm underline" disabled={delMut.isPending}>
                  Delete
                </button>
              </li>
            ))}
            {data?.length === 0 && <li className="py-2 text-sm text-gray-600">No categories yet.</li>}
          </ul>
        )}
      </div>
    </div>
  )
}
