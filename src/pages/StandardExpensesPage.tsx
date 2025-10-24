import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"
import { inr } from "../lib/format"

type Division = { id: string; name: string }
type TemplateRow = { id: string; category_id: string; default_amount: number | null; default_notes: string | null }

async function fetchDivisions(): Promise<Division[]> {
  const { data, error } = await supabase.from("divisions").select("id,name").order("name")
  if (error) throw error
  return data ?? []
}
async function fetchTemplates(): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from("standard_expense_templates")
    .select("id,category_id,default_amount,default_notes")
    .order("id")
  if (error) throw error
  return data ?? []
}
async function fetchOutgoingCategories() {
  const { data, error } = await supabase.from("categories").select("id,name,kind").eq("kind","OUTGOING").order("name")
  if (error) throw error
  return data ?? []
}

export default function StandardExpensesPage() {
  const qc = useQueryClient()
  const { data: divisions }  = useQuery({ queryKey: ["divisions"],  queryFn: fetchDivisions })
  const { data: templates }  = useQuery({ queryKey: ["std_templates"], queryFn: fetchTemplates })
  const { data: outCats }    = useQuery({ queryKey: ["categories_outgoing"], queryFn: fetchOutgoingCategories })

  const [categoryId, setCategoryId] = useState<string>("")
  const [amount, setAmount] = useState<number | "">("")
  const [notes, setNotes] = useState("")
  const [postDate, setPostDate] = useState(() => new Date().toISOString().slice(0,10))
  const [postDivision, setPostDivision] = useState<string | "">("")

  const addMut = useMutation({
    mutationFn: async () => {
      if (!categoryId) throw new Error("Choose a category")
      const payload = {
        category_id: categoryId,
        default_amount: amount === "" ? null : Number(amount),
        default_notes: notes || null
      }
      const { error } = await supabase.from("standard_expense_templates").insert([payload])
      if (error) throw error
    },
    onSuccess: () => { setCategoryId(""); setAmount(""); setNotes(""); qc.invalidateQueries({ queryKey: ["std_templates"] }) }
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("standard_expense_templates").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["std_templates"] })
  })

  const postMut = useMutation({
    mutationFn: async () => {
      const rows = (templates ?? [])
      if (rows.length === 0) throw new Error("No standard templates available")
      const payload = rows.map(t => ({
        ts: postDate,
        kind: "OUTGOING" as const,
        division_id: postDivision || null,
        person_id: null,
        group_id: null,
        category_id: t.category_id,
        amount: Number(t.default_amount ?? 0),
        notes: t.default_notes ?? null
      }))
      if (!payload.some(p => p.amount > 0)) throw new Error("All template amounts are 0. Set default amounts first.")
      const { error } = await supabase.from("journal").insert(payload)
      if (error) throw error
    }
  })

  useEffect(() => { setPostDate(new Date().toISOString().slice(0,10)) }, [])

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Daily Standard Expenses</h1>
        <p className="text-sm text-gray-600 mb-4">Manage templates and post today’s standard expenses in one tap.</p>

      <div className="rounded-2xl border bg-white p-4 shadow-sm mb-5">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">Date</label>
            <input type="date" className="w-full rounded-lg border px-3 py-2" value={postDate} onChange={e => setPostDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Division (optional)</label>
            <select className="w-full rounded-lg border px-3 py-2" value={postDivision} onChange={e => setPostDivision(e.target.value)}>
              <option value="">—</option>
              {divisions?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={() => postMut.mutate()} disabled={postMut.isPending} className="w-full rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60">
              {postMut.isPending ? "Posting…" : "Post today’s standard"}
            </button>
          </div>
        </div>
        {postMut.isError && <p className="text-sm text-red-600 mt-2">{(postMut.error as any).message}</p>}
        {postMut.isSuccess && <p className="text-sm text-green-700 mt-2">Posted to journal.</p>}
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium">Templates</h2>
        <p className="text-xs text-gray-600 mb-3">Each row becomes one journal entry when you post.</p>

        <form className="grid sm:grid-cols-3 gap-3 mb-4" onSubmit={(e)=>{e.preventDefault(); addMut.mutate()}}>
          <div>
            <label className="text-sm">Expense Category</label>
            <select className="w-full rounded-lg border px-3 py-2" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
              <option value="">Select…</option>
              {outCats?.map((c:any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm">Default Amount (₹)</label>
            <input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2"
              value={amount} onChange={e => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="0.00" />
          </div>
          <div>
            <label className="text-sm">Default Notes</label>
            <input className="w-full rounded-lg border px-3 py-2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g., Daily stationery" />
          </div>
          <div className="sm:col-span-3">
            <button disabled={addMut.isPending} className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60">
              {addMut.isPending ? "Adding…" : "Add Template"}
            </button>
          </div>
          {addMut.isError && <p className="text-sm text-red-600">{(addMut.error as any).message}</p>}
        </form>

        <ul className="divide-y">
          {(templates ?? []).map(t => {
            const catName = outCats?.find((c: any) => c.id === t.category_id)?.name ?? "Unknown"
            return (
              <li key={t.id} className="py-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{catName}</div>
                  <div className="text-xs text-gray-600">
                    {inr(Number(t.default_amount ?? 0))} {t.default_notes ? `• ${t.default_notes}` : ""}
                  </div>
                </div>
                <button onClick={()=>delMut.mutate(t.id)} className="text-red-600 text-sm underline" disabled={delMut.isPending}>
                  Delete
                </button>
              </li>
            )
          })}
          {(templates ?? []).length === 0 && (
            <li className="py-2 text-sm text-gray-600">No templates yet. Add your standard expenses above.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
