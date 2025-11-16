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
  // Default: only running balance shown; other optional columns unchecked by default
  const [includeNotes, setIncludeNotes] = useState<boolean>(false)
  const [includeArea, setIncludeArea] = useState<boolean>(false) // Show Area column + sort
  const [includeTagged, setIncludeTagged] = useState<boolean>(false) // Show Tagged To column
  const [includeKind, setIncludeKind] = useState<boolean>(false) // Show Kind column
  const [includeCumulative, setIncludeCumulative] = useState<boolean>(true) // Show running cumulative column (default checked)

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
  // Note: the chips are filter summaries (division, person, group, category) — do not show column toggles here.
    return list
  }, [kind, divisionIds, areaValues, personIds, groupIds, categoryIds, divisions, people, groups, categories])

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
    // Build CSV rows in displayed order; if cumulative requested, include running
    const list = (rows ?? []).map((r) => ({
      ts: r.ts,
      kind: kindLabel(r.kind),
      division: firstName(r.division, ""),
      area: (Array.isArray(r.division) ? r.division[0]?.area : (r.division as any)?.area) ?? "",
      person: firstPerson(r.person, ""),
      group: firstName(r.group as any, ""),
      category: firstName(r.category, ""),
      incomingNum: r.kind === "INCOMING" ? Number(r.amount) : 0,
      expenseNum: r.kind === "OUTGOING" ? Number(r.amount) : 0,
      notes: r.notes ?? "",
    }))

    if (includeArea) {
      list.sort((a, b) => (a.area || "").localeCompare(b.area || "", undefined, { sensitivity: "accent" }))
    }

    let running = 0
    const csvRows = list.map((r) => {
      running += (r.incomingNum || 0) - (r.expenseNum || 0)
      const row: any = {
        Date: r.ts,
        Kind: r.kind,
        Division: r.division,
        Area: r.area,
        Person: r.person,
        Group: r.group,
        Category: r.category,
        Incoming: r.incomingNum ? r.incomingNum.toFixed(2) : "",
        Expense: r.expenseNum ? r.expenseNum.toFixed(2) : "",
        Notes: r.notes,
      }
      if (includeCumulative) row.Running = running.toFixed(2)
      return row
    })
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
  async function buildDoc() {
  const postalRed = "#C01622"
  // Lightened table header colour so the red text/logo pop nicely on it
  // More vibrant, yellowish shade so red logo/text pop strongly on top
  const tableHeaderColour = [255, 214, 51]
    const ink = "#111111"

    const doc = new jsPDF({ unit: "pt", format: "a4" })
    doc.setFont("helvetica", "normal")
    doc.setLineHeightFactor(1.2)

    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const marginX = 40

  // ==== HEADER band ====
  const headerH = 66
  // Use the table header colour for the header band (swap)
  doc.setFillColor(tableHeaderColour[0], tableHeaderColour[1], tableHeaderColour[2])
    doc.rect(0, 0, pageW, headerH, "F")
  // Try to render a left-aligned logo from assets (optional). Place it inside the header band.
  let logoW = 0
  try {
      // Vite-resolved asset path; put your logo in src/assets/aipeu-logo.png
      const logoUrl = new URL("../assets/aipeu-logo.png", import.meta.url).href
  let resp = await fetch(logoUrl)
      if (!resp.ok) {
        // fallback — look for a public file (e.g. place `aipeu-logo.png` in the `public/` folder)
        resp = await fetch("/aipeu-logo.png")
      }
      if (resp.ok) {
        const blob = await resp.blob()
        const reader = new FileReader()
        // convert to data URL for jsPDF
        await new Promise((resolve) => {
          reader.onloadend = resolve
          reader.readAsDataURL(blob)
        })
  const dataUrl = reader.result as string
  // Pick jsPDF format from mime type
  const mime = blob.type || "image/png"
  const imgFmt: "PNG" | "JPEG" = mime.includes("jpeg") || mime.includes("jpg") ? "JPEG" : "PNG"
        // set logo width/height inside header band
  // Make logo smaller; cap at 64px for the emblem
  const logoH = headerH - 18
  logoW = Math.min(logoH * 0.9, 64)
  // Draw the logo without the white rounded background and position it left inside the band
  // no logoPad used when not drawing a white background; keep logoX / logoY for position only
  const logoX = Math.max(2, marginX - 18) // nudge left slightly more
  const logoY = 8
  // Now stamp the logo on top — using the image format from the blob
  doc.addImage(dataUrl, imgFmt, logoX, logoY, logoW, logoH)
      }
    } catch (err) {
      console.debug("Logo not found or failed to load", err)
    }
  // The header band is now yellow; use the red color for fonts to match the postal emblem
  doc.setTextColor(postalRed)
    doc.setFontSize(19)
    doc.setFont("helvetica", "bold")
    // If the logo exists, shift the centered header slightly to account for visual balance
    // (logoW/2 + padding) — we bias a bit to add more space between the logo and text
  const centerX = pageW / 2 + (logoW ? logoW / 2 + 8 : 0)
    // Primary title centered inside the header band
    doc.text("All India Postal Employees Union — Postman & MTS", centerX, headerH / 2 - 12, { align: "center", baseline: "middle" })
    doc.setFontSize(12)
    doc.text("Andhra Pradesh Circle • Srikalahasti", centerX, headerH / 2 + 6, { align: "center", baseline: "middle" })

    // No contact or officials lines — keep header compact with just logo & title

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
      const amt = Number(r.amount) || 0
      return {
        date: r.ts,
        kind: r.kind,
        kindLabel: kindLabel(r.kind),
        division: firstName(r.division, "—"),
        area,
        tagged,
        category: firstName(r.category, "—"),
        incomingNum: r.kind === "INCOMING" ? amt : 0,
        expenseNum: r.kind === "OUTGOING" ? amt : 0,
        incoming: r.kind === "INCOMING" ? formatAmount(amt) : "",
        expense: r.kind === "OUTGOING" ? formatAmount(amt) : "",
        notes: r.notes ?? "—",
        runningNum: 0,
        running: "",
      }
    })

    if (includeArea) {
      bodyRaw = bodyRaw.sort((a, b) => a.area.localeCompare(b.area, undefined, { sensitivity: "accent" }))
    }

    // Compute running cumulative (in order of bodyRaw) if requested
    if (includeCumulative) {
      let running = 0
      bodyRaw = bodyRaw.map((r) => {
        running += (r.incomingNum || 0) - (r.expenseNum || 0)
        return { ...r, runningNum: running, running: formatAmount(running) }
      })
    }

    const tableMargin = { left: marginX, right: marginX }
    const innerW = pageW - tableMargin.left - tableMargin.right

    // Build headers dynamically based on toggles
  const headers: string[] = []
  headers.push("Date")
  if (includeKind) headers.push("Kind")
  headers.push("Division")
  if (includeArea) headers.push("Area")
  if (includeTagged) headers.push("Tagged To")
  headers.push("Category", "Incoming", "Expense")
  if (includeCumulative) headers.push("Running")
  if (includeNotes) headers.push("Notes")

    // Width map for each header (sensible defaults)
    const widthMap: Record<string, number> = {
      Date: 70,
      Kind: 60,
      Division: 112,
      Area: 80,
      "Tagged To": 92,
      Category: 100,
  Incoming: 60,
  Expense: 60,
    Running: 60,
      Notes: 110,
    }

  const baseCols = headers.map((h) => widthMap[h] ?? 50)

    // Keep numeric columns (Incoming/Expense) fixed when scaling; scale other columns if overflow
    const totalW = baseCols.reduce((a, b) => a + b, 0)
  let colWidths = [...baseCols]
  // If content is wider than page, shrink non-numeric columns proportionally.
  if (totalW > innerW) {
      const incomingIdx = headers.indexOf("Incoming")
      const expenseIdx = headers.indexOf("Expense")
      const runningIdx = headers.indexOf("Running")
    const fixedIdxs = [incomingIdx, expenseIdx, runningIdx].filter((i) => i >= 0)
    const fixedSum = fixedIdxs.reduce((s, i) => s + colWidths[i], 0)
      const scalableIdx = colWidths.map((_, i) => i).filter((i) => !fixedIdxs.includes(i))
      const scalableSum = scalableIdx.reduce((s, i) => s + colWidths[i], 0)
  const factor = scalableSum > 0 ? (innerW - fixedSum) / scalableSum : 1
  colWidths = colWidths.map((w, i) => (fixedIdxs.includes(i) ? w : Math.max(50, w * factor)))
    } else if (totalW < innerW) {
      // If there's spare room, expand non-numeric columns to fill the page using the same proportion.
  const incomingIdx = headers.indexOf("Incoming")
  const expenseIdx = headers.indexOf("Expense")
  const runningIdx = headers.indexOf("Running")
  const fixedIdxs = [incomingIdx, expenseIdx, runningIdx].filter((i) => i >= 0)
  // do not modify fixed columns (Incoming/Expense) when expanding
      const scalableIdx = colWidths.map((_, i) => i).filter((i) => !fixedIdxs.includes(i))
      const scalableSum = scalableIdx.reduce((s, i) => s + colWidths[i], 0)
      const extra = innerW - totalW
      // If no scalable columns (unlikely), leave as is.
      if (scalableIdx.length > 0) {
        colWidths = colWidths.map((w, i) => {
          if (fixedIdxs.includes(i)) return w
          const share = scalableSum > 0 ? w / scalableSum : 1 / scalableIdx.length
          // Give more to Category/Notes (base widths already reflect this); clamp to a max.
          const newW = w + extra * share
          return Math.min(450, Math.max(50, newW))
        })
      }
    }

    const body = bodyRaw.map((r) => {
      const arr: (string | number)[] = [r.date]
      if (includeKind) arr.push(r.kindLabel)
      arr.push(r.division)
      if (includeArea) arr.push(r.area)
      if (includeTagged) arr.push(r.tagged)
      arr.push(r.category, r.incoming, r.expense)
      if (includeCumulative) arr.push(r.running ?? "")
      if (includeNotes) arr.push(r.notes)
      return arr
    })

  const notesIndex = includeNotes ? headers.indexOf("Notes") : -1
    const MAX_NOTE_LINES = 3
  const noteWrapWidth = includeNotes && notesIndex >= 0 ? Math.max(20, colWidths[notesIndex] - 8) : 0

  autoTable(doc, {
      startY: tableStartY,
      head: [headers],
      body,
      theme: "grid",
      margin: tableMargin,
      tableWidth: innerW,
      styles: {
        fontSize: 9,
        cellPadding: 4,
        lineColor: [0, 0, 0],
        textColor: 34,
        // Non-numeric fields should wrap to new lines; numeric columns will override to 'visible'
        overflow: "linebreak",
        valign: "middle",
        halign: "left",
      },
      headStyles: {
        // Table header now uses postal red with white text
        fillColor: [192, 22, 34], // postal red
        textColor: [255, 255, 255],
        lineColor: [0, 0, 0],
        fontStyle: "bold",
        halign: "left",
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: colWidths.reduce((acc: Record<number, any>, w, i) => {
        const header = headers[i] ?? ""
  // Numeric/date columns: prevent wrapping and right-align
  const isNumeric = header === "Incoming" || header === "Expense" || header === "Running"
  acc[i] = { cellWidth: w, valign: "top", halign: isNumeric ? "right" : "left", overflow: isNumeric ? "visible" : "linebreak" }
        return acc
      }, {}),
      didParseCell: (data: any) => {
        if (includeNotes && data.section === "body" && data.column.index === notesIndex) {
          const raw = (data.cell.raw ?? "").toString()
          data.cell.text = clipTextLines(doc, raw, noteWrapWidth, MAX_NOTE_LINES) as unknown as string[]
        }
      },
      didDrawPage: () => {
        // Footer band (centered text)
  const bandH = 28
        const bandY = pageH - bandH
  // Use the same light header colour for the footer so header/footer are consistent
  doc.setFillColor(tableHeaderColour[0], tableHeaderColour[1], tableHeaderColour[2])
        doc.rect(0, bandY, pageW, bandH, "F")
  // Footer text should be postalRed on a light background
  doc.setTextColor(postalRed)
        doc.setFontSize(8)
        const pageStr = `Page ${doc.getNumberOfPages()}`
        const genStr = `Generated: ${new Date().toLocaleString()}`
        doc.text(`${pageStr}  •  ${genStr}`, pageW / 2, bandY + 15, { align: "center", baseline: "middle" })
        doc.setTextColor(ink)
      },
      pageBreak: "auto",
      tableLineWidth: 0.5,
      tableLineColor: [0, 0, 0],
    })

    // Totals row: draw a separate one-row table aligned to the same columns so we can style totals easily
    const finalY = (doc as any).lastAutoTable?.finalY ?? tableStartY
    const totalsStartY = finalY + 8

    // Build totals row array aligned with headers
  const totalsRow: (string | number)[] = headers.map((h) => {
      if (h === "Date") return "Totals"
      if (h === "Incoming") return formatAmount(totals.inc)
      if (h === "Expense") return formatAmount(totals.out)
      if (h === "Running") return ""
      // other columns empty
      return ""
    })

  autoTable(doc, {
      startY: totalsStartY,
      head: [],
      body: [totalsRow],
      theme: "grid",
      margin: tableMargin,
      tableWidth: innerW,
      styles: {
        fontSize: 9,
        cellPadding: 4,
        lineColor: [0, 0, 0],
        textColor: 34,
        overflow: "visible",
        valign: "middle",
      },
      columnStyles: colWidths.reduce((acc: Record<number, any>, w, i) => {
        const header = headers[i] ?? ""
        acc[i] = { cellWidth: w, valign: "top", halign: header === "Incoming" || header === "Expense" || header === "Running" ? "right" : "left" }
        // Style income/expense columns in totals table
        if (header === "Incoming") { acc[i].fontStyle = "bold"; acc[i].textColor = [6, 95, 70]; }
        if (header === "Expense") { acc[i].fontStyle = "bold"; acc[i].textColor = [153, 27, 27]; }
        return acc
      }, {}),
      tableLineWidth: 0.5,
      tableLineColor: [0, 0, 0],
    })

    // Where should the balance appear? If running column is present, print under Running. Otherwise print under Expense with a label.
    const runningIdx = headers.indexOf("Running")
    const expenseIdx = headers.indexOf("Expense")
    const balanceRow: (string | number)[] = headers.map((_, i) => {
      if (includeCumulative && runningIdx >= 0 && i === runningIdx) return formatAmount(totals.net)
  if (!includeCumulative && expenseIdx >= 0 && i === expenseIdx) return formatAmount(totals.net)
      return ""
    })
    const balanceStartY = ((doc as any).lastAutoTable?.finalY ?? totalsStartY) + 8
    autoTable(doc, {
      startY: balanceStartY,
      head: [],
      body: [balanceRow],
      theme: "grid",
      margin: tableMargin,
      tableWidth: innerW,
      styles: {
        fontSize: 10,
        cellPadding: 4,
        lineColor: [0, 0, 0],
        textColor: 34,
        overflow: "visible",
        valign: "middle",
      },
      columnStyles: colWidths.reduce((acc: Record<number, any>, w, i) => {
        acc[i] = { cellWidth: w, valign: "top", halign: "left" }
        if ((includeCumulative && i === runningIdx) || (!includeCumulative && i === expenseIdx)) {
          acc[i].fontStyle = "bold"
          acc[i].textColor = [30, 64, 175]
          acc[i].halign = "right"
        }
        return acc
      }, {}),
      tableLineWidth: 0.5,
      tableLineColor: [0, 0, 0],
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
  async function handlePreview() {
    const doc = await buildDoc()
  if (previewUrl) { try { URL.revokeObjectURL(previewUrl) } catch (err) { console.debug('Failed to revoke preview URL', err) } }
    const blob = doc.output("blob")
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
  }
  async function handleOpen() {
    const doc = await buildDoc()
    window.open(URL.createObjectURL(doc.output("blob")))
  }
  async function handleDownload() {
    const doc = await buildDoc()
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
  // Build visible headers for UI (match PDF headers)
  const visibleHeaders: string[] = []
  visibleHeaders.push("Date")
  if (includeKind) visibleHeaders.push("Kind")
  visibleHeaders.push("Division")
  if (includeArea) visibleHeaders.push("Area")
  if (includeTagged) visibleHeaders.push("Tagged To")
  visibleHeaders.push("Category", "Incoming", "Expense")
  if (includeCumulative) visibleHeaders.push("Running")
  if (includeNotes) visibleHeaders.push("Notes")

  // Width map for UI columns (px)
  const uiWidthMap: Record<string, string> = {
    Date: "110px",
    Kind: "80px",
    Division: "160px",
    Area: "120px",
    "Tagged To": "140px",
    Category: "140px",
    Incoming: "100px",
    Expense: "100px",
    Running: "110px",
    Notes: "220px",
  }

  // Build UI rows with numeric fields and running cumulative when requested
  const uiRows = useMemo(() => {
    const list: any[] = (rows ?? []).map((r) => {
      const amt = Number(r.amount) || 0
      const tagged = firstPerson(r.person, "") || firstName(r.group as any, "") || "—"
      const area = (Array.isArray(r.division) ? r.division[0]?.area : (r.division as any)?.area) ?? "—"
      return {
        date: r.ts,
        kind: r.kind,
        kindLabel: kindLabel(r.kind),
        division: firstName(r.division, "—"),
        area,
        tagged,
        category: firstName(r.category, "—"),
        incomingNum: r.kind === "INCOMING" ? amt : 0,
        expenseNum: r.kind === "OUTGOING" ? amt : 0,
        incoming: r.kind === "INCOMING" ? inr(amt) : "",
        expense: r.kind === "OUTGOING" ? inr(amt) : "",
        notes: r.notes ?? "—",
      }
    })

    if (includeArea) {
      list.sort((a, b) => a.area.localeCompare(b.area, undefined, { sensitivity: "accent" }))
    }

    if (includeCumulative) {
      let running = 0
      for (let i = 0; i < list.length; i++) {
        running += (list[i].incomingNum || 0) - (list[i].expenseNum || 0)
        list[i].runningNum = running
        list[i].running = inr(running)
      }
    }

    return list
  }, [rows, includeArea, includeCumulative])

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
              <input type="checkbox" checked={includeTagged} onChange={(e) => setIncludeTagged(e.target.checked)} />
              Show “Tagged To” column
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeKind} onChange={(e) => setIncludeKind(e.target.checked)} />
              Show “Kind” column
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeCumulative} onChange={(e) => setIncludeCumulative(e.target.checked)} />
              Show running balance (cumulative)
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
          <table className="w-full text-sm" style={{ borderCollapse: "collapse", border: "1px solid #000" }}>
            <thead>
              <tr>
                {visibleHeaders.map((h) => (
                  <th key={h} className="py-2 pr-3 bg-red-700 text-white" style={{ border: "1px solid #000", textAlign: h === "Incoming" || h === "Expense" || h === "Running" ? "right" : "left", width: uiWidthMap[h] }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={visibleHeaders.length} className="py-3 text-gray-500" style={{ border: "1px solid #000" }}>Loading…</td>
                </tr>
              )}
              {!isLoading && uiRows.length === 0 && (
                <tr>
                  <td colSpan={visibleHeaders.length} className="py-3 text-gray-500" style={{ border: "1px solid #000" }}>No entries.</td>
                </tr>
              )}

              {uiRows.map((r, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e5e7eb" }}>
                  {visibleHeaders.map((h) => {
                    const nowrap = ["Date", "Kind", "Incoming", "Expense", "Running"].includes(h)
                    const style: React.CSSProperties = { border: "1px solid #000", padding: "8px" }
                    if (nowrap) style.whiteSpace = "nowrap"
                    if (h === "Incoming") return <td key={h} style={{ ...style, textAlign: "right", fontWeight: 600 }}>{r.incoming}</td>
                    if (h === "Expense") return <td key={h} style={{ ...style, textAlign: "right", fontWeight: 600 }}>{r.expense}</td>
                    if (h === "Running") return <td key={h} style={{ ...style, textAlign: "right", fontWeight: 600 }}>{r.running ?? ""}</td>
                    if (h === "Date") return <td key={h} style={style}>{r.date}</td>
                    if (h === "Kind") return <td key={h} style={style}>{r.kindLabel}</td>
                    if (h === "Division") return <td key={h} style={style}>{r.division}</td>
                    if (h === "Area") return <td key={h} style={style}>{r.area}</td>
                    if (h === "Tagged To") return <td key={h} style={style}>{r.tagged}</td>
                    if (h === "Category") return <td key={h} style={style}>{r.category}</td>
                    if (h === "Notes") return <td key={h} style={style}>{r.notes}</td>
                    return <td key={h} style={style}>{""}</td>
                  })}
                </tr>
              ))}

              {/* Totals row */}
              {uiRows.length > 0 && (
                <tr>
                  {(() => {
                    const incomingIdx = visibleHeaders.indexOf("Incoming")
                    const cells: any[] = []
                    const balance = totals.inc - totals.out
                    const runningIdx = visibleHeaders.indexOf("Running")
                    const expenseIdx = visibleHeaders.indexOf("Expense")
                    for (let j = 0; j < visibleHeaders.length; j++) {
                      // First cell: render Totals label spanning columns before Incoming
                      if (j === 0) {
                        const span = incomingIdx > 0 ? incomingIdx : 1
                        cells.push(
                          <td key="totals-label" colSpan={span} style={{ border: "1px solid #000", padding: "8px", fontWeight: 700 }}>
                            Totals
                          </td>
                        )
                        // skip the spanned columns
                        j = span - 1
                        continue
                      }

                      if (j === incomingIdx) {
                        cells.push(<td key="totals-inc" style={{ border: "1px solid #000", padding: "8px", textAlign: "right", fontWeight: 700, color: "#065f46" }}>{inr(totals.inc)}</td>)
                        continue
                      }

                      if (j === incomingIdx + 1) {
                        cells.push(<td key="totals-exp" style={{ border: "1px solid #000", padding: "8px", textAlign: "right", fontWeight: 700, color: "#991b1b" }}>{inr(totals.out)}</td>)
                        continue
                      }

                      // Running column placeholder
                      if (includeCumulative && j === incomingIdx + 2) {
                        cells.push(<td key="totals-running" style={{ border: "1px solid #000", padding: "8px" }} />)
                        continue
                      }

                      // If running column is visible, show balance there
                      if (includeCumulative && j === runningIdx) {
                        cells.push(<td key="totals-balance" style={{ border: "1px solid #000", padding: "8px", textAlign: "right", fontWeight: 700, color: "#1e40af" }}>{inr(balance)}</td>)
                        continue
                      }
                      // Otherwise, put the balance amount in the Expense column
                      if (!includeCumulative && j === expenseIdx) {
                        cells.push(<td key="totals-balance" style={{ border: "1px solid #000", padding: "8px", textAlign: "right", fontWeight: 700, color: "#1e40af" }}>{inr(balance)}</td>)
                        continue
                      }

                      // otherwise empty cell
                      cells.push(<td key={`totals-empty-${j}`} style={{ border: "1px solid #000", padding: "8px" }} />)
                    }
                    return cells
                  })()}
                </tr>
              )}

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
