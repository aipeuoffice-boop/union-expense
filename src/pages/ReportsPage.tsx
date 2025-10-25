// src/pages/ReportsPage.tsx
import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"
import { inr, kindLabel } from "../lib/format"
import Papa from "papaparse"
import { jsPDF } from "jspdf"
import autoTable from "jspdf-autotable"

// ---------- Types ----------
type Division = { id: string; name: string; area?: string | null }
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
  division: MaybeObj<{ name: string; area?: string | null }>
  category: MaybeObj<{ name: string }>
  person: MaybeObj<{ full_name: string }>
  group: MaybeObj<{ name: string }>
}

// ---------- Data fetchers ----------
async function fetchDivisions(): Promise<Division[]> {
  const { data, error } = await supabase.from("divisions").select("id,name,area").order("name")
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

// ---------- Small helpers ----------
const nfINR = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function formatAmount(n: number) {
  return nfINR.format(n)
}
function niceRange(from: string, to: string) {
  const d = (s: string) => {
    const [yy, mm, dd] = s.split("-").map(Number)
    return new Date(yy, (mm ?? 1) - 1, dd ?? 1)
  }
  const f = d(from)
  const t = d(to)
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" }
  return `${f.toLocaleDateString("en-GB", opts)} \u2013 ${t.toLocaleDateString("en-GB", opts)}`
}
/** Clip a multi-line string to `maxLines` with ellipsis that fits the `width`. */
function clipTextLines(doc: jsPDF, text: string, width: number, maxLines: number) {
  const lines = (doc.splitTextToSize(text || "", width) as string[]) || [""]
  if (lines.length <= maxLines) return lines
  let last = lines[maxLines - 1]
  while (doc.getTextWidth(last + "…") > width && last.length) last = last.slice(0, -1)
  return [...lines.slice(0, maxLines - 1), last + "…"]
}

// ---------- Mobile-friendly MultiPicker ----------
type Option = { id: string; label: string }
function MultiPicker({
  label,
  options,
  selected,
  onChange,
  placeholder = "Choose…",
  showAllOption = true,
}: {
  label: string
  options: Option[]
  selected: string[]
  onChange: (ids: string[]) => void
  placeholder?: string
  showAllOption?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const selectedLabels = useMemo(
    () => options.filter(o => selected.includes(o.id)).map(o => o.label),
    [options, selected]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(o => o.label.toLowerCase().includes(q))
  }, [options, query])

  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter(x => x !== id))
    else onChange([...selected, id])
  }
  function selectAll() {
    // Represent "All" as empty selection (means no filter)
    onChange([])
    setOpen(false)
  }
  function applyAndClose() {
    setOpen(false)
  }

  return (
    <div className="w-full">
      <label className="text-sm block mb-1">{label}</label>
      <button
        type="button"
        className="w-full border rounded-md px-3 py-2 text-left bg-white"
        onClick={() => setOpen(true)}
      >
        {selected.length === 0
          ? (showAllOption ? "All" : placeholder)
          : selectedLabels.slice(0, 2).join(", ") + (selected.length > 2 ? ` +${selected.length - 2}` : "")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          {/* Sheet */}
          <div className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl shadow-2xl p-4 max-h-[75vh] overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="font-medium">{label}</div>
              <button className="text-sm text-gray-600" onClick={() => setOpen(false)}>Close</button>
            </div>

            <div className="mb-2">
              <input
                className="w-full border rounded-md px-3 py-2"
                placeholder="Search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="overflow-auto" style={{ maxHeight: "50vh" }}>
              {showAllOption && (
                <label className="flex items-center gap-2 py-2 border-b">
                  <input
                    type="checkbox"
                    checked={selected.length === 0}
                    onChange={selectAll}
                  />
                  <span>All</span>
                </label>
              )}

              {filtered.map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 py-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.id)}
                    onChange={() => toggle(opt.id)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
              {filtered.length === 0 && <div className="text-sm text-gray-500 py-4">No results</div>}
            </div>

            <div className="pt-3 flex justify-end gap-2">
              <button className="btn btn-outline" onClick={selectAll}>All</button>
              <button className="btn btn-primary" onClick={applyAndClose}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================== Component ==============================
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

  // Independent filters — multi-select
  const [divisionIds, setDivisionIds] = useState<string[]>([])
  const [personIds, setPersonIds] = useState<string[]>([])
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [areaValues, setAreaValues] = useState<string[]>([]) // Area (multi)

  // Toggles
  const [includeNotes, setIncludeNotes] = useState<boolean>(true)
  const [includeArea, setIncludeArea] = useState<boolean>(false) // Show Area column + sort

  const { data: divisions } = useQuery({ queryKey: ["divisions"], queryFn: fetchDivisions })
  const { data: people } = useQuery({ queryKey: ["persons"], queryFn: fetchPeople })
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: fetchGroups })
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories })

  // Build the effective division filter = selected divisions ∪ divisions that belong to selected areas
  const effectiveDivisionIds = useMemo(() => {
    const ids = new Set<string>(divisionIds)
    if (areaValues.length && divisions?.length) {
      divisions.forEach((d) => {
        const a = (d.area || "").trim()
        if (a && areaValues.includes(a)) ids.add(d.id)
      })
    }
    return Array.from(ids)
  }, [divisionIds, areaValues, divisions])

  // Distinct Areas for the new area multi-select
  const areaOptions = useMemo(() => {
    const set = new Set<string>()
    divisions?.forEach((d) => {
      const a = (d.area || "").trim()
      if (a) set.add(a)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [divisions])

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["report", from, to, kind, effectiveDivisionIds, personIds, groupIds, categoryIds],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("journal")
        .select(
          "ts, kind, amount, notes, division:divisions(name,area), category:categories(name), person:persons(full_name), group:groups(name)"
        )
        .gte("ts", from)
        .lte("ts", to)
        .order("ts", { ascending: false })
        .order("created_at", { ascending: false })

      if (kind !== "ALL") q = q.eq("kind", kind)
      if (effectiveDivisionIds.length) q = q.in("division_id", effectiveDivisionIds)
      if (categoryIds.length) q = q.in("category_id", categoryIds)

      // Persons & Groups can both be selected; include entries that match either
      if (personIds.length && groupIds.length) {
        const inList = (ids: string[]) => `in.(${ids.join(",")})`
        q = q.or(`person_id.${inList(personIds)},group_id.${inList(groupIds)}`)
      } else if (personIds.length) {
        q = q.in("person_id", personIds)
      } else if (groupIds.length) {
        q = q.in("group_id", groupIds)
      }

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as Row[]
    },
  })

  useEffect(() => {
    refetch()
  }, [from, to, kind, effectiveDivisionIds, personIds, groupIds, categoryIds, refetch])

  // Chips (filters summary)
  const chips = useMemo(() => {
    const list: string[] = []
    if (kind !== "ALL") list.push(kindLabel(kind))
    if (divisionIds.length) {
      const names = divisionIds
        .map((id) => divisions?.find((d) => d.id === id)?.name)
        .filter(Boolean)
        .join(", ")
      if (names) list.push(`Division: ${names}`)
    }
    if (areaValues.length) list.push(`Area: ${areaValues.join(", ")}`)
    if (personIds.length) {
      const names = personIds
        .map((id) => people?.find((p) => p.id === id)?.full_name)
        .filter(Boolean)
        .join(", ")
      if (names) list.push(`Person: ${names}`)
    }
    if (groupIds.length) {
      const names = groupIds
        .map((id) => groups?.find((g) => g.id === id)?.name)
        .filter(Boolean)
        .join(", ")
      if (names) list.push(`Group: ${names}`)
    }
    if (categoryIds.length) {
      const names = categoryIds
        .map((id) => categories?.find((c) => c.id === id)?.name)
        .filter(Boolean)
        .join(", ")
      if (names) list.push(`Category: ${names}`)
    }
    if (includeArea) list.push("Categorized by Area")
    if (!includeNotes) list.push("Notes: Hidden")
    return list
  }, [kind, divisionIds, areaValues, personIds, groupIds, categoryIds, divisions, people, groups, categories, includeArea, includeNotes])

  // Title
  const reportTitle = useMemo(() => {
    const parts: string[] = []
    if (divisionIds.length || areaValues.length) parts.push("Division/Area")
    if (personIds.length) parts.push("Person")
    if (groupIds.length) parts.push("Group")
    if (categoryIds.length) parts.push("Category")
    return (parts.length ? parts.join(" + ") : "Consolidated") + " Statement"
  }, [divisionIds, areaValues, personIds, groupIds, categoryIds])

  const totals = useMemo(() => {
    const inc = (rows ?? []).filter((r) => r.kind === "INCOMING").reduce((s, r) => s + Number(r.amount), 0)
    const out = (rows ?? []).filter((r) => r.kind === "OUTGOING").reduce((s, r) => s + Number(r.amount), 0)
    return { inc, out, net: inc - out, count: rows?.length ?? 0 }
  }, [rows])

  // CSV export
  async function downloadCSV() {
    const csvRows = (rows ?? []).map((r) => ({
      Date: r.ts,
      Kind: kindLabel(r.kind),
      Division: firstName(r.division, ""),
      Area: (Array.isArray(r.division) ? r.division[0]?.area : (r.division as any)?.area) ?? "",
      Person: firstPerson(r.person, ""),
      Group: firstName(r.group as any, ""),
      Category: firstName(r.category, ""),
      Amount: Number(r.amount).toFixed(2),
      Notes: r.notes ?? "",
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

  // ========================== PDF builder ==========================
  function buildDoc() {
    const postalRed = "#C01622"
    const ink = "#111111"

    const doc = new jsPDF({ unit: "pt", format: "a4" })
    doc.setFont("helvetica", "normal")
    doc.setLineHeightFactor(1.2)

    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const marginX = 40

    // ==== HEADER band ====
    const headerH = 66
    doc.setFillColor(postalRed)
    doc.rect(0, 0, pageW, headerH, "F")
    doc.setTextColor("#FFFFFF")
    doc.setFontSize(19)
    doc.setFont("helvetica", "bold")
    doc.text("All India Postal Employees Union — Postman & MTS", pageW / 2, 26, { align: "center", baseline: "middle" })
    doc.setFontSize(12)
    doc.text("Andhra Pradesh Circle • Srikalahasti", pageW / 2, 44, { align: "center", baseline: "middle" })

    // ==== Date range (centered) ====
    let y = headerH + 18
    doc.setTextColor(ink)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text(niceRange(from, to), pageW / 2, y, { align: "center" })
    doc.setFont("helvetica", "normal")
    y += 14

    // ==== Filter chips ====
    let chipX = marginX
    let chipY = y
    const chipPadX = 8
    const chipH = 18
    const chipRadius = 6
    doc.setFontSize(9)
    chips.forEach((txt) => {
      const textW = doc.getTextWidth(txt)
      const chipW = textW + chipPadX * 2
      if (chipX + chipW > pageW - marginX) {
        chipX = marginX
        chipY += chipH + 6
      }
      doc.setDrawColor(220)
      doc.setFillColor(249, 255, 46)
      doc.roundedRect(chipX, chipY, chipW, chipH, chipRadius, chipRadius, "FD")
      doc.setTextColor(ink)
      doc.text(txt, chipX + chipPadX, chipY + chipH / 2, { baseline: "middle" })
      chipX += chipW + 6
    })
    y = chips.length ? chipY + chipH + 8 : y + 6

    // ==== Title centered ====
    doc.setTextColor(ink)
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.text(reportTitle, pageW / 2, y + 6, { align: "center" })
    doc.setFont("helvetica", "normal")
    y += 20

    // ==== Stat cards (simple / elegant) ====
    const cardTop = y
    const cols = 3
    const gap = 12
    const cardW = (pageW - marginX * 2 - gap * (cols - 1)) / cols
    const cardH = 50
    const cards: { label: string; value: string }[] = [
      { label: "Total Income", value: formatAmount(totals.inc) },
      { label: "Total Expense", value: formatAmount(totals.out) },
      { label: "Net", value: formatAmount(totals.net) },
    ]
    cards.forEach((c, i) => {
      const x = marginX + i * (cardW + gap)
      doc.setDrawColor(230)
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(x, cardTop, cardW, cardH, 8, 8, "FD")
      const [r, g, b] = i === 0 ? [34, 197, 94] : i === 1 ? [239, 68, 68] : [245, 158, 11]
      doc.setFillColor(r, g, b)
      doc.rect(x, cardTop, cardW, 4, "F")
      doc.setFontSize(9)
      doc.setTextColor("#6b7280")
      doc.text(c.label, x + 12, cardTop + 18)
      doc.setFontSize(13)
      doc.setTextColor(ink)
      const t = c.value
      const tx = x + cardW - 12 - doc.getTextWidth(t)
      doc.text(t, Math.max(x + 12, tx), cardTop + 36)
    })

    // ==== TABLE ====
    const tableStartY = cardTop + cardH + 16

    let bodyRaw = (rows ?? []).map((r) => {
      const tagged = firstPerson(r.person, "") || firstName(r.group as any, "") || "—"
      const area = (Array.isArray(r.division) ? r.division[0]?.area : (r.division as any)?.area) ?? "—"
      return {
        date: r.ts,
        kind: kindLabel(r.kind),
        division: firstName(r.division, "—"),
        area,
        tagged,
        category: firstName(r.category, "—"),
        amount: formatAmount(Number(r.amount) || 0),
        notes: r.notes ?? "—",
      }
    })

    if (includeArea) {
      bodyRaw = bodyRaw.sort((a, b) => a.area.localeCompare(b.area, undefined, { sensitivity: "accent" }))
    }

    const tableMargin = { left: marginX, right: marginX }
    const innerW = pageW - tableMargin.left - tableMargin.right

    const headers = ["Date", "Kind", "Division", ...(includeArea ? ["Area"] : []), "Tagged To", "Category", "Amount", ...(includeNotes ? ["Notes"] : [])]

    const baseCols: number[] = includeArea
      ? includeNotes
        ? [70, 60, 112, 80, 92, 100, 68, 110]
        : [78, 66, 132, 88, 108, 112, 76]
      : includeNotes
        ? [74, 62, 120, 92, 102, 70, 120]
        : [84, 68, 138, 108, 116, 86]

    const amountIdx = headers.indexOf("Amount")
    const totalW = baseCols.reduce((a, b) => a + b, 0)
    let colWidths = [...baseCols]
    if (totalW > innerW) {
      const fixedSum = colWidths[amountIdx]
      const scalableIdx = colWidths.map((_, i) => i).filter((i) => i !== amountIdx)
      const scalableSum = scalableIdx.reduce((s, i) => s + colWidths[i], 0)
      const factor = (innerW - fixedSum) / scalableSum
      colWidths = colWidths.map((w, i) => (i === amountIdx ? w : Math.max(50, w * factor)))
    }

    const body = bodyRaw.map((r) => {
      const arr: (string | number)[] = [r.date, r.kind, r.division]
      if (includeArea) arr.push(r.area)
      arr.push(r.tagged, r.category, r.amount)
      if (includeNotes) arr.push(r.notes)
      return arr
    })

    const notesIndex = includeNotes ? headers.length - 1 : -1
    const MAX_NOTE_LINES = 3
    const noteWrapWidth = includeNotes ? colWidths[notesIndex] - 8 : 0

    autoTable(doc, {
      startY: tableStartY,
      head: [headers],
      body,
      theme: "striped",
      margin: tableMargin,
      tableWidth: innerW,
      styles: {
        fontSize: 9,
        cellPadding: 4,
        lineColor: 230,
        textColor: 34,
        overflow: "linebreak",
        valign: "middle",
        halign: "left",
      },
      headStyles: {
        fillColor: [255, 204, 0],
        textColor: 17,
        lineColor: 230,
        fontStyle: "bold",
        halign: "left",
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: colWidths.reduce((acc: any, w, i) => {
        acc[i] = { cellWidth: w, valign: "top", halign: "left" }
        return acc
      }, {}),
      didParseCell: (data: any) => {
        if (includeNotes && data.section === "body" && data.column.index === notesIndex) {
          const raw = (data.cell.raw ?? "").toString()
          data.cell.text = clipTextLines(doc, raw, noteWrapWidth, MAX_NOTE_LINES) as any
        }
      },
      didDrawPage: () => {
        // Footer band (centered text)
        const bandH = 40
        const bandY = pageH - bandH
        doc.setFillColor("#C01622")
        doc.rect(0, bandY, pageW, bandH, "F")
        doc.setTextColor("#FFFFFF")
        doc.setFontSize(9)
        const pageStr = `Page ${doc.getNumberOfPages()}`
        const genStr = `Generated: ${new Date().toLocaleString()}`
        doc.text(`${pageStr}  •  ${genStr}`, pageW / 2, bandY + 24, { align: "center", baseline: "middle" })
        doc.setTextColor(ink)
      },
      pageBreak: "auto",
      tableLineWidth: 0.1,
    })

    // Signatures
    const endY = (doc as any).lastAutoTable?.finalY ?? tableStartY
    const sigY = Math.min(endY + 28, pageH - 80)
    doc.setFontSize(10)
    doc.setTextColor(ink)
    doc.text("Prepared by:", marginX, sigY)
    doc.line(marginX, sigY + 24, marginX + 180, sigY + 24)
    doc.text("Approved by:", pageW - marginX - 200, sigY)
    doc.line(pageW - marginX - 200, sigY + 24, pageW - marginX, sigY + 24)

    return doc
  }

  // Preview / Open / Download
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

  // ---------- Options for pickers ----------
  const areaOpts: Option[] = areaOptions.map(a => ({ id: a, label: a }))
  const divisionOpts: Option[] = (divisions ?? []).map(d => ({ id: d.id, label: d.area ? `${d.name} — ${d.area}` : d.name }))
  const personOpts: Option[] = (people ?? []).map(p => ({ id: p.id, label: p.full_name }))
  const groupOpts: Option[] = (groups ?? []).map(g => ({ id: g.id, label: g.name }))
  const categoryOpts: Option[] = (categories ?? []).map(c => ({ id: c.id, label: `${c.name} (${c.kind.toLowerCase()})` }))

  // ========================== UI ==========================
  return (
    <div className="container">
      <h1 className="h1">Advanced Reports</h1>
      <p className="small mb-4">
        Filter by <strong>date</strong>, <strong>kind</strong>, <strong>division</strong>, <strong>area</strong>, <strong>person</strong>, <strong>group</strong>,{" "}
        <strong>category</strong> — choose multiple values — then export a professional PDF or CSV.
      </p>

      <div className="card p-4 space-y-4">
        {/* Basic filters + toggles */}
        <div className="grid sm:grid-cols-6 gap-3">
          <div>
            <label className="text-sm">From</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">To</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Kind</label>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="INCOMING">Income</option>
              <option value="OUTGOING">Expense</option>
            </select>
          </div>

          <div className="sm:col-span-3 flex flex-wrap gap-4 items-end">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeArea} onChange={(e) => setIncludeArea(e.target.checked)} />
              Categorize by Area (Division)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
              Include “Notes” in PDF
            </label>
          </div>
        </div>

        {/* Mobile-friendly multi pickers */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MultiPicker label="Areas (multi)" options={areaOpts} selected={areaValues} onChange={setAreaValues} />
          <MultiPicker label="Divisions (multi)" options={divisionOpts} selected={divisionIds} onChange={setDivisionIds} />
          <MultiPicker label="Persons (multi)" options={personOpts} selected={personIds} onChange={setPersonIds} />
          <MultiPicker label="Groups (multi)" options={groupOpts} selected={groupIds} onChange={setGroupIds} />
          <MultiPicker label="Categories (multi)" options={categoryOpts} selected={categoryIds} onChange={setCategoryIds} />
        </div>

        {/* Totals strip (simple / elegant) */}
        <div className="grid sm:grid-cols-3 gap-3 pt-2">
          {[
            { label: "Total Income", value: inr(totals.inc), extra: "text-green-700" },
            { label: "Total Expense", value: inr(totals.out), extra: "text-red-700" },
            { label: "Net", value: inr(totals.net), extra: "" },
          ].map((c, i) => (
            <div key={i} className="rounded-xl border border-gray-200 p-4 shadow-sm bg-white">
              <div className="text-xs text-gray-500">{c.label}</div>
              <div className={`text-lg font-semibold ${c.extra}`}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Table (onscreen) */}
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Division</th>
                {includeArea && <th className="py-2 pr-3">Area</th>}
                <th className="py-2 pr-3">Tagged To</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Amount</th>
                {includeNotes && <th className="py-2 pr-3">Notes</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={includeArea ? (includeNotes ? 8 : 7) : (includeNotes ? 7 : 6)} className="py-3 text-gray-500">Loading…</td>
                </tr>
              )}
              {!isLoading && (rows ?? []).length === 0 && (
                <tr>
                  <td colSpan={includeArea ? (includeNotes ? 8 : 7) : (includeNotes ? 7 : 6)} className="py-3 text-gray-500">No entries.</td>
                </tr>
              )}
              {(rows ?? []).map((r, i) => {
                const tagged = firstPerson(r.person, "") || firstName(r.group as any, "") || "—"
                const area = (Array.isArray(r.division) ? r.division[0]?.area : (r.division as any)?.area) ?? "—"
                return (
                  <tr key={i} className="border-b">
                    <td className="py-2 pr-3">{r.ts}</td>
                    <td className="py-2 pr-3">{kindLabel(r.kind)}</td>
                    <td className="py-2 pr-3">{firstName(r.division)}</td>
                    {includeArea && <td className="py-2 pr-3">{area}</td>}
                    <td className="py-2 pr-3">{tagged}</td>
                    <td className="py-2 pr-3">{firstName(r.category)}</td>
                    <td className="py-2 pr-3 font-medium">{inr(r.amount)}</td>
                    {includeNotes && <td className="py-2 pr-3">{r.notes ?? "—"}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-3">
          <button className="btn btn-outline" onClick={downloadCSV}>Download CSV</button>
          <button className="btn" onClick={handlePreview}>Preview PDF (in page)</button>
          <button className="btn btn-outline" onClick={handleOpen}>Open PDF</button>
          <button className="btn btn-primary" onClick={handleDownload}>Download PDF</button>

          <button
            className="btn btn-outline ml-auto"
            onClick={() => {
              setDivisionIds([]); setAreaValues([]); setPersonIds([]); setGroupIds([]); setCategoryIds([]); setKind("ALL")
            }}
          >
            Reset filters
          </button>
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
