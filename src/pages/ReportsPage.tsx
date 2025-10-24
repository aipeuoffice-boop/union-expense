// src/pages/ReportsPage.tsx
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"
import { inr, kindLabel } from "../lib/format"
import Papa from "papaparse"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

// ---------- Types ----------
type Division = { id: string; name: string }
type Person = { id: string; full_name: string }
type Group = { id: string; name: string }
type Category = { id: string; name: string; kind: "INCOMING" | "OUTGOING" }

type MaybeObj<T> = T | T[] | null
const firstName = (v: MaybeObj<{ name: string }>, fallback = "—") =>
  !v ? fallback : Array.isArray(v) ? v[0]?.name ?? fallback : v.name ?? fallback
const firstPerson = (v: MaybeObj<{ full_name: string }>, fallback = "—") =>
  !v ? fallback : Array.isArray(v) ? v[0]?.full_name ?? fallback : (v as any).full_name ?? fallback

type Row = {
  ts: string
  kind: "INCOMING" | "OUTGOING"
  amount: number
  notes: string | null
  division: MaybeObj<{ name: string }>
  category: MaybeObj<{ name: string }>
  person: MaybeObj<{ full_name: string }>
  group: MaybeObj<{ name: string }>
}

// ---------- Data fetchers ----------
async function fetchDivisions(): Promise<Division[]> {
  const { data, error } = await supabase.from("divisions").select("id,name").order("name")
  if (error) throw error
  return data ?? []
}
async function fetchPeople(): Promise<Person[]> {
  const { data, error } = await supabase.from("persons").select("id,full_name").order("full_name")
  if (error) throw error
  return data ?? []
}
async function fetchGroups(): Promise<Group[]> {
  const { data, error } = await supabase.from("groups").select("id,name").order("name")
  if (error) throw error
  return data ?? []
}
async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase.from("categories").select("id,name,kind").order("name")
  if (error) throw error
  return data ?? []
}

export default function ReportsPage() {
  // Default range: current month
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, "0")
  const dd = String(now.getDate()).padStart(2, "0")
  const startOfMonth = `${yyyy}-${mm}-01`
  const today = `${yyyy}-${mm}-${dd}`

  const [from, setFrom] = useState(startOfMonth)
  const [to, setTo] = useState(today)
  const [kind, setKind] = useState<"ALL" | "INCOMING" | "OUTGOING">("ALL")

  // Independent filters (mix & match)
  const [divisionId, setDivisionId] = useState<string>("")
  const [personId, setPersonId] = useState<string>("")
  const [groupId, setGroupId] = useState<string>("")
  const [categoryId, setCategoryId] = useState<string>("")

  const { data: divisions } = useQuery({ queryKey: ["divisions"], queryFn: fetchDivisions })
  const { data: people } = useQuery({ queryKey: ["persons"], queryFn: fetchPeople })
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: fetchGroups })
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories })

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["report", from, to, kind, divisionId, personId, groupId, categoryId],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("journal")
        .select("ts, kind, amount, notes, division:divisions(name), category:categories(name), person:persons(full_name), group:groups(name)")
        .gte("ts", from)
        .lte("ts", to)
        .order("ts", { ascending: false })
        .order("created_at", { ascending: false })

      if (kind !== "ALL") q = q.eq("kind", kind)
      if (divisionId) q = q.eq("division_id", divisionId)
      if (categoryId) q = q.eq("category_id", categoryId)

      // If both person & group are chosen, use OR so entries tagged to either will appear
      if (personId && groupId) {
        q = q.or(`person_id.eq.${personId},group_id.eq.${groupId}`)
      } else if (personId) {
        q = q.eq("person_id", personId)
      } else if (groupId) {
        q = q.eq("group_id", groupId)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })

  useEffect(() => {
    refetch()
  }, [from, to, kind, divisionId, personId, groupId, categoryId, refetch])

  // Chips for PDF header
  const chips = useMemo(() => {
    const list: string[] = [`${from} to ${to}`]
    if (kind !== "ALL") list.push(kindLabel(kind))
    if (divisionId) {
      const name = divisions?.find(d => d.id === divisionId)?.name
      if (name) list.push(`Division: ${name}`)
    }
    if (personId) {
      const name = people?.find(p => p.id === personId)?.full_name
      if (name) list.push(`Person: ${name}`)
    }
    if (groupId) {
      const name = groups?.find(g => g.id === groupId)?.name
      if (name) list.push(`Group: ${name}`)
    }
    if (categoryId) {
      const name = categories?.find(c => c.id === categoryId)?.name
      if (name) list.push(`Category: ${name}`)
    }
    return list
  }, [from, to, kind, divisionId, personId, groupId, categoryId, divisions, people, groups, categories])

  // Title depends on filters (but not exclusive)
  const reportTitle = useMemo(() => {
    const parts: string[] = []
    if (divisionId) parts.push("Division")
    if (personId) parts.push("Person")
    if (groupId) parts.push("Group")
    if (categoryId) parts.push("Category")
    return (parts.length ? parts.join(" + ") : "Consolidated") + " Statement"
  }, [divisionId, personId, groupId, categoryId])

  const totals = useMemo(() => {
    const inc = (rows ?? []).filter(r => r.kind === "INCOMING").reduce((s, r) => s + Number(r.amount), 0)
    const out = (rows ?? []).filter(r => r.kind === "OUTGOING").reduce((s, r) => s + Number(r.amount), 0)
    return { inc, out, net: inc - out, count: rows?.length ?? 0 }
  }, [rows])

  // CSV export
  async function downloadCSV() {
    const csvRows = (rows ?? []).map(r => ({
      Date: r.ts,
      Kind: kindLabel(r.kind),
      Division: firstName(r.division, ""),
      Person: firstPerson(r.person, ""),
      Group: firstName(r.group as any, ""),
      Category: firstName(r.category, ""),
      Amount: Number(r.amount).toFixed(2),
      Notes: r.notes ?? ""
    }))
    const csv = Papa.unparse(csvRows, { header: true })
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `statement_${from}_to_${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Build jsPDF document with tighter, cleaner spacing (no extra spaces)
  function buildDoc() {
    const postalRed = "#C01622"
    const doc = new jsPDF({ unit: "pt", format: "a4" })

    // Header: org name
    doc.setTextColor(postalRed)
    doc.setFontSize(14)
    doc.text("All India Postal Employees Union — Postman & MTS", 40, 40)
    doc.setTextColor("#222222")
    doc.setFontSize(11)
    doc.text("Andhra Pradesh Circle • Srikalahasti", 40, 58)

    // Chip row (date range, filters) — minimal padding, no spaced letters
    let chipX = 40
    const chipY = 78
    doc.setFontSize(9)
    chips.forEach((txt) => {
      const padX = 6
      const padY = 4
      const w = doc.getTextWidth(txt) + padX * 2
      const h = 16
      doc.setDrawColor(220)
      doc.setFillColor(245, 245, 245)
      doc.roundedRect(chipX, chipY - h + padY, w, h, 4, 4, "FD")
      doc.setTextColor("#333333")
      doc.text(txt, chipX + padX, chipY)
      chipX += w + 6
      const pageW = doc.internal.pageSize.getWidth()
      if (chipX + 80 > pageW - 40) {
        // move to next line of chips
        chipX = 40
      }
    })

    // Title
    doc.setTextColor("#111111")
    doc.setFontSize(16)
    doc.text(reportTitle, 40, 110)

    // Summary strip (compact)
    const cardY = 126
    const cardW = 180
    const gap = 12
    const cards: [string, string, string?][] = [
      ["Total Income", inr(totals.inc)],
      ["Total Expense", inr(totals.out)],
      ["Net", inr(totals.net)],
    ]
    cards.forEach((c, i) => {
      const x = 40 + i * (cardW + gap)
      doc.setDrawColor(234, 234, 234)
      doc.roundedRect(x, cardY, cardW, 44, 6, 6)
      doc.setFontSize(10)
      doc.setTextColor("#666")
      doc.text(c[0], x + 10, cardY + 16)
      doc.setFontSize(12)
      doc.setTextColor("#111")
      doc.text(c[1], x + 10, cardY + 34)
    })

    // Table body
    const body = (rows ?? []).map((r) => {
      const tagged = firstPerson(r.person, "") || firstName(r.group as any, "") || "—"
      return [
        r.ts,
        kindLabel(r.kind),
        firstName(r.division, "—"),
        tagged,
        firstName(r.category, "—"),
        Number(r.amount).toFixed(2),
        r.notes ?? "—",
      ]
    })

    autoTable(doc, {
      startY: cardY + 64,
      head: [["Date", "Kind", "Division", "Tagged To", "Category", "Amount (₹)", "Notes"]],
      body,
      styles: { fontSize: 9, cellPadding: 3, lineColor: 230, textColor: 34 },
      headStyles: { fillColor: [255, 204, 0], textColor: 17, lineColor: 230 },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      theme: "striped",
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        // footer
        doc.setFontSize(8)
        doc.setTextColor("#444")
        const footerY = doc.internal.pageSize.getHeight() - 20
        doc.text(`Generated: ${new Date().toLocaleString()}`, 40, footerY)
        const pageStr = `Page ${doc.getNumberOfPages()}`
        const pageW = doc.getTextWidth(pageStr)
        doc.text(pageStr, doc.internal.pageSize.getWidth() - 40 - pageW, footerY)
      },
      columnStyles: {
        0: { cellWidth: 64 },
        1: { cellWidth: 56 },
        2: { cellWidth: 90 },
        3: { cellWidth: 100 },
        4: { cellWidth: 90 },
        5: { cellWidth: 80, halign: "right" },
        6: { cellWidth: "auto" },
      },
    })

    const endY = (doc as any).lastAutoTable?.finalY ?? 720
    doc.setFontSize(10)
    doc.setTextColor("#111")
    doc.text("Prepared by:", 40, endY + 28)
    doc.line(40, endY + 52, 220, endY + 52)
    doc.text("Approved by:", 360, endY + 28)
    doc.line(360, endY + 52, 540, endY + 52)

    return doc
  }

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  function handlePreview() {
    const doc = buildDoc()
    if (previewUrl) { try { URL.revokeObjectURL(previewUrl) } catch {} }
    const blob = doc.output("blob")
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
  }

  function handleOpen() {
    const doc = buildDoc()
    window.open(URL.createObjectURL(doc.output("blob")))
  }

  function handleDownload() {
    const doc = buildDoc()
    doc.save(`statement_${from}_to_${to}.pdf`)
  }

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  return (
    <div className="container">
      <h1 className="h1">Advanced Reports</h1>
      <p className="small mb-4">Filter by date, kind, division, person, group, category — then export a professional PDF or CSV.</p>

      <div className="card p-4 space-y-3">
        {/* Filters */}
        <div className="grid sm:grid-cols-6 gap-3">
          <div>
            <label className="text-sm">From</label>
            <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">To</label>
            <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Kind</label>
            <select className="select" value={kind} onChange={e => setKind(e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="INCOMING">Income</option>
              <option value="OUTGOING">Expense</option>
            </select>
          </div>

          <div>
            <label className="text-sm">Division</label>
            <select className="select" value={divisionId} onChange={e => setDivisionId(e.target.value)}>
              <option value="">All</option>
              {divisions?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm">Person</label>
            <select className="select" value={personId} onChange={e => setPersonId(e.target.value)}>
              <option value="">All</option>
              {people?.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm">Group</label>
            <select className="select" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">All</option>
              {groups?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="text-sm">Category</label>
            <select className="select" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">All</option>
              {categories?.map(c => <option key={c.id} value={c.id}>{c.name} ({c.kind.toLowerCase()})</option>)}
            </select>
          </div>

          <div className="sm:col-span-3 flex items-end gap-2">
            <button
              className="btn btn-outline"
              onClick={() => {
                setDivisionId(""); setPersonId(""); setGroupId(""); setCategoryId(""); setKind("ALL")
              }}
            >
              Reset filters
            </button>
          </div>
        </div>

        {/* Totals strip */}
        <div className="grid sm:grid-cols-3 gap-3 pt-1">
          <div className="card p-4">
            <div className="text-xs text-gray-600">Total Income</div>
            <div className="text-lg font-semibold text-green-700">{inr(totals.inc)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-gray-600">Total Expense</div>
            <div className="text-lg font-semibold text-red-700">{inr(totals.out)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-gray-600">Net</div>
            <div className="text-lg font-semibold">{inr(totals.net)}</div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Division</th>
                <th className="py-2 pr-3">Tagged To</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="py-3 text-gray-500">Loading…</td></tr>}
              {!isLoading && (rows ?? []).length === 0 && <tr><td colSpan={7} className="py-3 text-gray-500">No entries.</td></tr>}
              {(rows ?? []).map((r, i) => {
                const tagged = firstPerson(r.person, "") || firstName(r.group as any, "") || "—"
                return (
                  <tr key={i} className="border-b">
                    <td className="py-2 pr-3">{r.ts}</td>
                    <td className="py-2 pr-3">{kindLabel(r.kind)}</td>
                    <td className="py-2 pr-3">{firstName(r.division)}</td>
                    <td className="py-2 pr-3">{tagged}</td>
                    <td className="py-2 pr-3">{firstName(r.category)}</td>
                    <td className="py-2 pr-3 font-medium">{inr(r.amount)}</td>
                    <td className="py-2 pr-3">{r.notes ?? "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-3">
          <button className="btn btn-outline" onClick={downloadCSV}>Download CSV</button>
          <button className="btn" onClick={handlePreview}>Preview PDF (in page)</button>
          <button className="btn btn-outline" onClick={handleOpen}>Open PDF</button>
          <button className="btn btn-primary" onClick={handleDownload}>Download PDF</button>
        </div>

        {/* Preview iframe */}
        {previewUrl && (
          <div className="mt-4">
            <div className="text-sm mb-2">PDF Preview</div>
            <iframe title="pdf-preview" src={previewUrl} className="w-full" style={{ minHeight: 640, border: "1px solid #e5e7eb" }} />
          </div>
        )}
      </div>
    </div>
  )
}
