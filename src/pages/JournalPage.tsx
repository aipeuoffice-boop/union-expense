import { useEffect, useMemo, useState } from "react"
import { useForm, type SubmitHandler } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"
import { inr } from "../lib/format"

type Division = { id: string; name: string }
type Person = { id: string; full_name: string; division_id: string | null }
type Group = { id: string; name: string; division_id: string | null }
type Category = { id: string; name: string; kind: "INCOMING" | "OUTGOING" }
type Journal = {
  id: string; ts: string; kind: "INCOMING"|"OUTGOING";
  amount: number; notes: string | null;
  division_id: string | null; category_id: string | null;
  person_id: string | null; group_id: string | null;
  created_at: string;
}
type DailySummary = { ts: string; incoming: number; outgoing: number; net: number }

const FormSchema = z.object({
  ts: z.string().min(1, "Date required"),
  kind: z.enum(["INCOMING","OUTGOING"]),
  division_id: z.string().uuid().nullable().optional(),
  whoType: z.enum(["person","group","none"]),
  person_id: z.string().uuid().nullable().optional(),
  group_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid({ message: "Category required" }),
  amount: z.coerce.number().positive("Amount must be > 0"),
  notes: z.string().optional().nullable(),
  new_person: z.string().optional(),
  new_group: z.string().optional()
}).refine(val => {
  if (val.whoType === "person") return !!(val.person_id || (val.new_person && val.new_person.trim()))
  if (val.whoType === "group")  return !!(val.group_id  || (val.new_group  && val.new_group.trim()))
  return true
}, { message: "Choose a person/group or create one", path: ["whoType"] })

type FormValues = z.infer<typeof FormSchema>

async function fetchDivisions(): Promise<Division[]> {
  const { data, error } = await supabase.from("divisions").select("id,name").order("name")
  if (error) throw error
  return data ?? []
}
async function fetchPeople(): Promise<Person[]> {
  const { data, error } = await supabase.from("persons").select("id,full_name,division_id").order("full_name")
  if (error) throw error
  return data ?? []
}
async function fetchGroups(): Promise<Group[]> {
  const { data, error } = await supabase.from("groups").select("id,name,division_id").order("name")
  if (error) throw error
  return data ?? []
}
async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("id,name,kind").order("kind",{ascending:false}).order("name")
  if (error) throw error
  return data ?? []
}
async function fetchRecent(): Promise<Journal[]> {
  const { data, error } = await supabase
    .from("journal")
    .select("id,ts,kind,amount,notes,division_id,category_id,person_id,group_id,created_at")
    .order("ts", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) throw error
  return data ?? []
}
async function fetchTodaySummary(): Promise<DailySummary | null> {
  const d = new Date().toISOString().slice(0,10)
  const { data, error } = await supabase
    .from("v_daily_summary")
    .select("ts,incoming,outgoing,net")
    .eq("ts", d)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

export default function JournalPage() {
  const qc = useQueryClient()
  const [kind, setKind] = useState<"INCOMING"|"OUTGOING">("INCOMING")

  const { data: divisions } = useQuery({ queryKey: ["divisions"], queryFn: fetchDivisions })
  const { data: people }    = useQuery({ queryKey: ["persons"],   queryFn: fetchPeople })
  const { data: groups }    = useQuery({ queryKey: ["groups"],    queryFn: fetchGroups })
  const { data: categories }= useQuery({ queryKey: ["categories"],queryFn: fetchCategories })
  const { data: recent }    = useQuery({ queryKey: ["journal_recent"], queryFn: fetchRecent })
  const { data: today }     = useQuery({ queryKey: ["today_summary"],   queryFn: fetchTodaySummary })

  const filteredCategories = useMemo(
    () => (categories ?? []).filter(c => c.kind === kind),
    [categories, kind]
  )

  const form = useForm<FormValues>({
    // IMPORTANT: don't pass generics to zodResolver to avoid TS conflicts
    resolver: zodResolver(FormSchema) as any,
    defaultValues: {
      ts: new Date().toISOString().slice(0,10),
      kind: "INCOMING",
      whoType: "none",
      amount: 0
    }
  })

  useEffect(() => { form.setValue("kind", kind) }, [kind, form])

  const addEntry = useMutation({
    mutationFn: async (values: FormValues) => {
      let person_id = values.person_id ?? null
      let group_id  = values.group_id  ?? null

      if (values.whoType === "person" && !person_id && values.new_person?.trim()) {
        const { data, error } = await supabase
          .from("persons")
          .insert([{ full_name: values.new_person!, division_id: values.division_id ?? null }])
          .select("id").single()
        if (error) throw error
        person_id = data.id
      }
      if (values.whoType === "group" && !group_id && values.new_group?.trim()) {
        const { data, error } = await supabase
          .from("groups")
          .insert([{ name: values.new_group!, division_id: values.division_id ?? null }])
          .select("id").single()
        if (error) throw error
        group_id = data.id
      }

      const payload = {
        ts: values.ts,
        kind: values.kind,
        division_id: values.division_id ?? null,
        person_id: person_id ?? null,
        group_id: group_id ?? null,
        category_id: values.category_id,
        amount: values.amount,
        notes: values.notes ?? null
      }
      const { error } = await supabase.from("journal").insert([payload])
      if (error) throw error
    },
    onSuccess: () => {
      form.reset({
        ts: new Date().toISOString().slice(0,10),
        kind,
        whoType: "none",
        division_id: null,
        person_id: null,
        group_id: null,
        category_id: undefined as unknown as string,
        amount: 0,
        notes: ""
      })
      qc.invalidateQueries({ queryKey: ["journal_recent"] })
      qc.invalidateQueries({ queryKey: ["today_summary"] })
    }
  })

  const onSubmit: SubmitHandler<FormValues> = (v) => addEntry.mutate(v)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">Add Entry</h1>
      <p className="text-sm text-gray-600 mb-4">Record incoming funds or outgoing expenses.</p>

      {/* Kind toggle */}
      <div className="inline-flex rounded-lg border bg-white shadow-sm overflow-hidden">
        {(["INCOMING","OUTGOING"] as const).map(k => (
          <button
            key={k}
            className={`px-4 py-2 text-sm ${kind===k ? "bg-black text-white" : ""}`}
            onClick={()=>setKind(k)}
            type="button"
          >
            {k}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 rounded-2xl border bg-white p-4 shadow-sm grid gap-3">
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">Date</label>
            <input type="date" className="w-full rounded-lg border px-3 py-2" {...form.register("ts")} />
            <p className="text-xs text-red-600">{form.formState.errors.ts?.message}</p>
          </div>

          <div>
            <label className="text-sm">Division</label>
            <select className="w-full rounded-lg border px-3 py-2" {...form.register("division_id", { setValueAs: v => v || null })}>
              <option value="">—</option>
              {divisions?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm">Category</label>
            <select className="w-full rounded-lg border px-3 py-2" {...form.register("category_id", { setValueAs: v => v || null })}>
              <option value="">Select…</option>
              {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <p className="text-xs text-red-600">{form.formState.errors.category_id?.message}</p>
          </div>
        </div>

        {/* Who */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="text-sm">Entry tagged to</label>
            <div className="flex gap-3 mt-1 text-sm">
              <label className="inline-flex items-center gap-1">
                <input type="radio" value="none" {...form.register("whoType")} defaultChecked />
                None
              </label>
              <label className="inline-flex items-center gap-1">
                <input type="radio" value="person" {...form.register("whoType")} />
                Person
              </label>
              <label className="inline-flex items-center gap-1">
                <input type="radio" value="group" {...form.register("whoType")} />
                Group
              </label>
            </div>
            <p className="text-xs text-red-600">{form.formState.errors.whoType?.message}</p>
          </div>

          {/* Person picker / new */}
          <div>
            <label className="text-sm">Person (optional)</label>
            <select className="w-full rounded-lg border px-3 py-2" {...form.register("person_id", { setValueAs: v => v || null })}>
              <option value="">—</option>
              {people?.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <input placeholder="or new person name" className="mt-2 w-full rounded-lg border px-3 py-2" {...form.register("new_person")} />
          </div>

          {/* Group picker / new */}
          <div>
            <label className="text-sm">Group (optional)</label>
            <select className="w-full rounded-lg border px-3 py-2" {...form.register("group_id", { setValueAs: v => v || null })}>
              <option value="">—</option>
              {groups?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input placeholder="or new group name" className="mt-2 w-full rounded-lg border px-3 py-2" {...form.register("new_group")} />
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label className="text-sm">Amount (₹)</label>
            <input type="number" step="0.01" className="w-full rounded-lg border px-3 py-2" {...form.register("amount", { valueAsNumber: true })} />
            <p className="text-xs text-red-600">{form.formState.errors.amount?.message}</p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm">Notes</label>
            <input className="w-full rounded-lg border px-3 py-2" placeholder="optional" {...form.register("notes")} />
          </div>
        </div>

        <button className="mt-2 w-full sm:w-auto rounded-lg bg-black text-white px-4 py-2 disabled:opacity-60" disabled={addEntry.isPending} type="submit">
          {addEntry.isPending ? "Saving…" : "Save Entry"}
        </button>

        {addEntry.isError && <p className="text-sm text-red-600 mt-2">{(addEntry.error as any).message}</p>}
      </form>

      {/* Today summary */}
      <div className="mt-5 grid sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Today Incoming</div>
          <div className="text-lg font-semibold">{inr(today?.incoming ?? 0)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Today Outgoing</div>
          <div className="text-lg font-semibold">{inr(today?.outgoing ?? 0)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Today Net</div>
          <div className="text-lg font-semibold">{inr(today?.net ?? 0)}</div>
        </div>
      </div>

      {/* Recent entries */}
      <div className="mt-5 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="font-medium mb-2">Recent entries</h2>
        {!recent?.length && <p className="text-sm text-gray-600">No entries yet.</p>}
        <ul className="divide-y">
          {recent?.map(r => (
            <li key={r.id} className="py-2 flex items-center justify-between">
              <div>
                <div className="text-sm">{r.ts} • {r.kind}</div>
                <div className="text-xs text-gray-600">{r.notes ?? "—"}</div>
              </div>
              <div className={`font-semibold ${r.kind==="INCOMING" ? "text-green-700" : "text-red-700"}`}>
                {inr(r.amount)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
