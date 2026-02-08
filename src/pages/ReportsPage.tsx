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
function parseISODateSafe(s: string) {
  const [yy, mm, dd] = (s || "").split("-").map(Number)
  if (!yy || !mm || !dd) return new Date(0)
  return new Date(yy, mm - 1, dd)
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
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
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
                  <input type="checkbox" checked={selected.length === 0} onChange={selectAll} />
                  <span>All</span>
                </label>
              )}

              {filtered.map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 py-2">
                  <input type="checkbox" checked={selected.includes(opt.id)} onChange={() => toggle(opt.id)} />
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

  // NEW: Flag
  // OFF => current behavior (single chronological ledger; one side blank per row)
  // ON  => "two-sided aligned" (income list left, expense list right; zipped by index)
  const [alignTwoSidedRows, setAlignTwoSidedRows] = useState<boolean>(false)

  // Independent filters — multi-select
  const [divisionIds, setDivisionIds] = useState<string[]>([])
  const [personIds, setPersonIds] = useState<string[]>([])
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [areaValues, setAreaValues] = useState<string[]>([])

  // Toggles
  const [includeArea, setIncludeArea] = useState<boolean>(false)
  const [includeTagged, setIncludeTagged] = useState<boolean>(false)
  const [includeKind, setIncludeKind] = useState<boolean>(false)
  const [includeCumulative, setIncludeCumulative] = useState<boolean>(true)

  const { data: divisions } = useQuery({ queryKey: ["divisions"], queryFn: fetchDivisions })
  const { data: people } = useQuery({ queryKey: ["persons"], queryFn: fetchPeople })
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: fetchGroups })
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: fetchCategories })

  // Effective division filter = selected divisions ∪ divisions belonging to selected areas
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

  // Distinct Areas
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

  // Chips
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
    }))

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
      }
      if (includeCumulative) row.Balance = running.toFixed(2)
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
    const headerBand = [255, 214, 51] as [number, number, number]
    const ink = "#111111"
    const white = [255, 255, 255] as [number, number, number]
    const black = [0, 0, 0] as [number, number, number]

    const drawHeader = async (doc: jsPDF, pageW: number, marginX: number) => {
      const headerH = 66
      doc.setFillColor(headerBand[0], headerBand[1], headerBand[2])
      doc.rect(0, 0, pageW, headerH, "F")

      let logoW = 0
      try {
        const logoUrl = new URL("../assets/aipeu-logo.png", import.meta.url).href
        let resp = await fetch(logoUrl)
        if (!resp.ok) resp = await fetch("/aipeu-logo.png")
        if (resp.ok) {
          const blob = await resp.blob()
          const reader = new FileReader()
          await new Promise((resolve) => {
            reader.onloadend = resolve
            reader.readAsDataURL(blob)
          })
          const dataUrl = reader.result as string
          const mime = blob.type || "image/png"
          const imgFmt: "PNG" | "JPEG" = mime.includes("jpeg") || mime.includes("jpg") ? "JPEG" : "PNG"
          const logoH = headerH - 18
          logoW = Math.min(logoH * 0.9, 64)
          const logoX = Math.max(2, marginX - 18)
          const logoY = 8
          doc.addImage(dataUrl, imgFmt, logoX, logoY, logoW, logoH)
        }
      } catch (err) {
        console.debug("Logo not found or failed to load", err)
      }

      doc.setTextColor(postalRed)
      doc.setFontSize(19)
      doc.setFont("helvetica", "bold")
      const centerX = pageW / 2 + (logoW ? logoW / 2 + 8 : 0)
      doc.text("All India Postal Employees Union — Postman & MTS", centerX, headerH / 2 - 12, {
        align: "center",
        baseline: "middle",
      })
      doc.setFontSize(12)
      doc.text("Andhra Pradesh Circle • Srikalahasti", centerX, headerH / 2 + 6, {
        align: "center",
        baseline: "middle",
      })
      return headerH
    }

    const drawFooter = (doc: jsPDF, pageW: number, pageH: number) => {
      const bandH = 28
      const bandY = pageH - bandH
      doc.setFillColor(headerBand[0], headerBand[1], headerBand[2])
      doc.rect(0, bandY, pageW, bandH, "F")
      doc.setTextColor(postalRed)
      doc.setFontSize(8)
      const pageStr = `Page ${doc.getNumberOfPages()}`
      const genStr = `Generated: ${new Date().toLocaleString()}`
      doc.text(`${pageStr}  •  ${genStr}`, pageW / 2, bandY + 15, { align: "center", baseline: "middle" })
      doc.setTextColor(ink)
    }

    // Build base normalized items
    const base = (rows ?? []).map((r) => {
      const division = firstName(r.division, "—")
      const category = firstName(r.category, "—")
      const amt = Number(r.amount) || 0
      return {
        ts: r.ts,
        tsDate: parseISODateSafe(r.ts),
        kind: r.kind,
        division,
        category,
        incoming: r.kind === "INCOMING" ? amt : 0,
        expense: r.kind === "OUTGOING" ? amt : 0,
      }
    })

    // Prepare ledger rows based on the new flag:
    // - OFF => chronological ledger, one side filled per row (current behavior)
    // - ON  => income list left + expense list right, zipped by index (minimizes "empty rows")
    type TwoSideRow = {
      inc?: typeof base[number]
      exp?: typeof base[number]
      running: number
    }

    const buildTwoSideRows = (): TwoSideRow[] => {
      if (!alignTwoSidedRows) {
        const chronological = [...base].sort((a, b) => a.tsDate.getTime() - b.tsDate.getTime())
        let run = 0
        return chronological.map((x) => {
          run += (x.incoming || 0) - (x.expense || 0)
          return { inc: x.kind === "INCOMING" ? x : undefined, exp: x.kind === "OUTGOING" ? x : undefined, running: run }
        })
      }

      const incList = base.filter(x => x.kind === "INCOMING").sort((a, b) => a.tsDate.getTime() - b.tsDate.getTime())
      const expList = base.filter(x => x.kind === "OUTGOING").sort((a, b) => a.tsDate.getTime() - b.tsDate.getTime())
      const n = Math.max(incList.length, expList.length)

      let run = 0
      const out: TwoSideRow[] = []
      for (let i = 0; i < n; i++) {
        const inc = incList[i]
        const exp = expList[i]
        // Apply income first, then expense for same row (balance-sheet style)
        if (inc) run += inc.incoming
        if (exp) run -= exp.expense
        out.push({ inc, exp, running: run })
      }
      return out
    }

    const twoSide = buildTwoSideRows()

    // Headers with TWO partition columns (Income | Expense | Balance)
    const headers = (() => {
      const left = ["Date", "Division", "Category", "Incoming"]
      const sep1 = ["|"]
      const right = ["Date", "Division", "Category", "Expense"]
      const sep2 = includeCumulative ? ["|"] : []
      const bal = includeCumulative ? ["Balance"] : []
      return [...left, ...sep1, ...right, ...sep2, ...bal]
    })()

    const widthMap: Record<string, number> = {
      Date: 62,
      Division: 102,
      Category: 102,
      Incoming: 74,
      Expense: 74,
      Balance: 90,
      "|": 14,
    }
    const baseCols = headers.map(h => widthMap[h] ?? 70)

    // Choose orientation if needed
    const marginX = 32
    let orientation: "portrait" | "landscape" = "portrait"
    {
      const probe = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" })
      const pageW = probe.internal.pageSize.getWidth()
      const innerW = pageW - marginX * 2
      const totalW = baseCols.reduce((a, b) => a + b, 0)
      if (totalW > innerW) orientation = "landscape"
    }

    const doc = new jsPDF({ unit: "pt", format: "a4", orientation })
    doc.setFont("helvetica", "normal")
    doc.setLineHeightFactor(1.2)

    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const headerH = await drawHeader(doc, pageW, marginX)

    // Date range
    let y = headerH + 18
    doc.setTextColor(ink)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text(niceRange(from, to), pageW / 2, y, { align: "center" })
    doc.setFont("helvetica", "normal")
    y += 14

    // Chips
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

    // Title
    doc.setTextColor(ink)
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.text(reportTitle, pageW / 2, y + 6, { align: "center" })
    doc.setFont("helvetica", "normal")
    y += 20

    // Stat cards
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

    // MORE SPACE so the Income/Expense/Balance labels do NOT overlap cards
    const tableStartY = cardTop + cardH + 30

    const tableMargin = { left: marginX, right: marginX }
    const innerW = pageW - tableMargin.left - tableMargin.right

    // Scale columns to fit inner width (keep partitions fixed)
    const totalW = baseCols.reduce((a, b) => a + b, 0)
    const partIdxs = headers.map((h, i) => (h === "|" ? i : -1)).filter((i) => i >= 0)
    const partSum = partIdxs.reduce((s, i) => s + baseCols[i], 0)
    const restTotal = totalW - partSum
    const restInner = innerW - partSum
    const factor = restTotal > 0 ? restInner / restTotal : 1
    const colWidths = baseCols.map((w, i) => (headers[i] === "|" ? w : Math.max(44, w * factor)))

    // Helpers to compute centers for section labels
    const idxSep1 = headers.indexOf("|")
    const idxSep2 = includeCumulative ? headers.lastIndexOf("|") : -1
    const xStart = tableMargin.left
    const sumW = (fromIdx: number, toIdxInclusive: number) => {
      let s = 0
      for (let i = fromIdx; i <= toIdxInclusive; i++) s += colWidths[i] ?? 0
      return s
    }
    const xOf = (colIndex: number) => xStart + sumW(0, colIndex - 1)

    const incomeCenter = (() => {
      const x1 = xOf(0)
      const x2 = xOf(3) + colWidths[3]
      return (x1 + x2) / 2
    })()
    const expenseCenter = (() => {
      const startCol = idxSep1 + 1
      const endCol = startCol + 3
      const x1 = xOf(startCol)
      const x2 = xOf(endCol) + colWidths[endCol]
      return (x1 + x2) / 2
    })()
    const balanceCenter = includeCumulative
      ? (() => {
          const balCol = headers.indexOf("Balance")
          const x1 = xOf(balCol)
          const x2 = x1 + colWidths[balCol]
          return (x1 + x2) / 2
        })()
      : 0

    // Section labels: move them DOWN (closer to the table) so they never overlap cards
    const sectionLabelY = tableStartY - 8
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor("#0f172a")
    doc.text("INCOME", incomeCenter, sectionLabelY, { align: "center" })
    doc.text("EXPENSE", expenseCenter, sectionLabelY, { align: "center" })
    if (includeCumulative) doc.text("BALANCE", balanceCenter, sectionLabelY, { align: "center" })
    doc.setFont("helvetica", "normal")
    doc.setTextColor(ink)

    // Body: build single table row with 2 partitions + balance
    // IMPORTANT:
    // - If alignTwoSidedRows is OFF => some fields blank (current behavior)
    // - If alignTwoSidedRows is ON  => left side uses income row i, right side uses expense row i
    //   (no “empty rows”; if one side runs out, we show "—" instead of blank)
    const dash = "—"
    const body = twoSide.map((r) => {
      const inc = r.inc
      const exp = r.exp

      const leftDate = inc ? inc.ts : (alignTwoSidedRows ? dash : "")
      const leftDiv = inc ? inc.division : (alignTwoSidedRows ? dash : "")
      const leftCat = inc ? inc.category : (alignTwoSidedRows ? dash : "")
      const leftAmt = inc ? formatAmount(inc.incoming) : (alignTwoSidedRows ? dash : "")

      const rightDate = exp ? exp.ts : (alignTwoSidedRows ? dash : "")
      const rightDiv = exp ? exp.division : (alignTwoSidedRows ? dash : "")
      const rightCat = exp ? exp.category : (alignTwoSidedRows ? dash : "")
      const rightAmt = exp ? formatAmount(exp.expense) : (alignTwoSidedRows ? dash : "")

      const rowArr: (string | number)[] = [
        leftDate,
        leftDiv,
        leftCat,
        leftAmt,
        "", // SEP1
        rightDate,
        rightDiv,
        rightCat,
        rightAmt,
      ]
      if (includeCumulative) {
        rowArr.push("") // SEP2
        rowArr.push(formatAmount(r.running))
      }
      return rowArr
    })

    const isPartition = (h: string) => h === "|"

    autoTable(doc, {
      startY: tableStartY,
      head: [headers.map(h => (h === "|" ? "" : h))],
      body,
      theme: "grid",
      margin: tableMargin,
      tableWidth: innerW,
      styles: {
        fontSize: orientation === "landscape" ? 8 : 9,
        cellPadding: 4,
        lineColor: black,
        textColor: 34,
        overflow: "linebreak",
        valign: "middle",
        halign: "left",
      },
      headStyles: {
        fillColor: [192, 22, 34],
        textColor: [255, 255, 255],
        lineColor: black,
        fontStyle: "bold",
        halign: "left",
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: colWidths.reduce((acc: Record<number, any>, w, i) => {
        const h = headers[i] ?? ""
        const isNumeric = h === "Incoming" || h === "Expense" || h === "Balance"
        acc[i] = {
          cellWidth: w,
          valign: "top",
          halign: isNumeric ? "right" : "left",
          overflow: isNumeric ? "visible" : "linebreak",
        }
        if (isPartition(h)) {
          acc[i].halign = "center"
          acc[i].overflow = "visible"
        }
        return acc
      }, {}),
      didParseCell: (data: any) => {
        const col = data.column.index
        const h = headers[col] ?? ""

        // Partition columns: WHITE background, keep LEFT/RIGHT borders, remove TOP/BOTTOM borders ALWAYS
        if (isPartition(h)) {
          data.cell.text = [""] // no text
          data.cell.styles.fillColor = white
          data.cell.styles.lineColor = black
          data.cell.styles.cellPadding = 0

          // Remove top & bottom borders for the entire column (header/body/totals)
          data.cell.styles.lineWidth = { top: 0, right: 0.9, bottom: 0, left: 0.9 }
        }

        // Numeric columns: align right
        if (h === "Incoming" || h === "Expense" || h === "Balance") {
          data.cell.styles.overflow = "visible"
          data.cell.styles.halign = "right"
        }
      },
      didDrawPage: () => drawFooter(doc, pageW, pageH),
      pageBreak: "auto",
      tableLineWidth: 0.5,
      tableLineColor: black,
    })

    // Totals row aligned with columns
    const endY = (doc as any).lastAutoTable?.finalY ?? tableStartY
    const totalsStartY = endY + 8

    const totalsRow: (string | number)[] = headers.map((h, i) => {
      if (i === 0) return "Totals"
      if (h === "Incoming") return formatAmount(totals.inc)
      if (h === "Expense") return formatAmount(totals.out)
      if (h === "Balance") return formatAmount(totals.net)
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
        fontSize: orientation === "landscape" ? 8 : 9,
        cellPadding: 4,
        lineColor: black,
        textColor: 34,
        overflow: "visible",
        valign: "middle",
      },
      columnStyles: colWidths.reduce((acc: Record<number, any>, w, i) => {
        const h = headers[i] ?? ""
        const isNumeric = h === "Incoming" || h === "Expense" || h === "Balance"
        acc[i] = { cellWidth: w, halign: isNumeric ? "right" : "left", valign: "middle" }

        if (h === "Incoming") {
          acc[i].fontStyle = "bold"
          acc[i].textColor = [6, 95, 70]
        }
        if (h === "Expense") {
          acc[i].fontStyle = "bold"
          acc[i].textColor = [153, 27, 27]
        }
        if (h === "Balance") {
          acc[i].fontStyle = "bold"
          acc[i].textColor = [30, 64, 175]
        }
        return acc
      }, {}),
      didParseCell: (data: any) => {
        const h = headers[data.column.index] ?? ""
        if (isPartition(h)) {
          data.cell.text = [""]
          data.cell.styles.fillColor = white
          data.cell.styles.lineColor = black
          data.cell.styles.cellPadding = 0
          data.cell.styles.lineWidth = { top: 0, right: 0.9, bottom: 0, left: 0.9 }
        }
      },
      didDrawPage: () => drawFooter(doc, pageW, pageH),
      pageBreak: "auto",
      tableLineWidth: 0.5,
      tableLineColor: black,
    })

    // Signatures
    const afterTotalsY = (doc as any).lastAutoTable?.finalY ?? totalsStartY
    const sigY = Math.min(afterTotalsY + 28, pageH - 80)
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
    if (previewUrl) {
      try { URL.revokeObjectURL(previewUrl) } catch (err) { console.debug("Failed to revoke preview URL", err) }
    }
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

  // ========================== UI (same partition rules) ==========================
  const uiHeaders = useMemo(() => {
    const left = ["Date", "Division", "Category", "Incoming"]
    const sep1 = ["|"]
    const right = ["Date", "Division", "Category", "Expense"]
    const sep2 = includeCumulative ? ["|"] : []
    const bal = includeCumulative ? ["Balance"] : []
    return [...left, ...sep1, ...right, ...sep2, ...bal]
  }, [includeCumulative])

  const uiWidthMap: Record<string, string> = {
    Date: "110px",
    Division: "160px",
    Category: "160px",
    Incoming: "110px",
    Expense: "110px",
    Balance: "120px",
    "|": "16px",
  }

  const uiTwoSide = useMemo(() => {
    const base = (rows ?? []).map((r) => {
      const division = firstName(r.division, "—")
      const category = firstName(r.category, "—")
      const amt = Number(r.amount) || 0
      return {
        ts: r.ts,
        tsDate: parseISODateSafe(r.ts),
        kind: r.kind,
        division,
        category,
        incoming: r.kind === "INCOMING" ? amt : 0,
        expense: r.kind === "OUTGOING" ? amt : 0,
      }
    })

    if (!alignTwoSidedRows) {
      const chronological = [...base].sort((a, b) => a.tsDate.getTime() - b.tsDate.getTime())
      let run = 0
      return chronological.map((x) => {
        run += (x.incoming || 0) - (x.expense || 0)
        return {
          inc: x.kind === "INCOMING" ? x : undefined,
          exp: x.kind === "OUTGOING" ? x : undefined,
          balance: includeCumulative ? inr(run) : "",
        }
      })
    }

    const incList = base.filter(x => x.kind === "INCOMING").sort((a, b) => a.tsDate.getTime() - b.tsDate.getTime())
    const expList = base.filter(x => x.kind === "OUTGOING").sort((a, b) => a.tsDate.getTime() - b.tsDate.getTime())
    const n = Math.max(incList.length, expList.length)

    let run = 0
    const out: any[] = []
    for (let i = 0; i < n; i++) {
      const inc = incList[i]
      const exp = expList[i]
      if (inc) run += inc.incoming
      if (exp) run -= exp.expense
      out.push({ inc, exp, balance: includeCumulative ? inr(run) : "" })
    }
    return out
  }, [rows, alignTwoSidedRows, includeCumulative])

  return (
    <div className="container">
      <h1 className="h1">Advanced Reports</h1>
      <p className="small mb-4">
        Filter by <strong>date</strong>, <strong>kind</strong>, <strong>division</strong>, <strong>area</strong>, <strong>person</strong>, <strong>group</strong>,{" "}
        <strong>category</strong> — choose multiple values — then export a professional PDF or CSV.
      </p>

      <div className="card p-4 space-y-4">
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
              <input type="checkbox" checked={alignTwoSidedRows} onChange={(e) => setAlignTwoSidedRows(e.target.checked)} />
              Align Income + Expense into non-empty rows (two-sided)
            </label>

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
              Show running balance (Balance)
            </label>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <MultiPicker label="Areas (multi)" options={areaOpts} selected={areaValues} onChange={setAreaValues} />
          <MultiPicker label="Divisions (multi)" options={divisionOpts} selected={divisionIds} onChange={setDivisionIds} />
          <MultiPicker label="Persons (multi)" options={personOpts} selected={personIds} onChange={setPersonIds} />
          <MultiPicker label="Groups (multi)" options={groupOpts} selected={groupIds} onChange={setGroupIds} />
          <MultiPicker label="Categories (multi)" options={categoryOpts} selected={categoryIds} onChange={setCategoryIds} />
        </div>

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
                {uiHeaders.map((h, idx) => {
                  const isSep = h === "|"
                  const isNum = h === "Incoming" || h === "Expense" || h === "Balance"
                  return (
                    <th
                      key={`${h}-${idx}`}
                      className="py-2 pr-3 bg-red-700 text-white"
                      style={{
                        width: uiWidthMap[h] ?? "120px",
                        textAlign: isNum ? "right" : "left",
                        // Partition columns: keep left/right border, remove top/bottom always (even header)
                        borderLeft: "1px solid #000",
                        borderRight: "1px solid #000",
                        borderTop: isSep ? "none" : "1px solid #000",
                        borderBottom: isSep ? "none" : "1px solid #000",
                        background: isSep ? "#fff" : undefined,
                        color: isSep ? "#111" : undefined,
                      }}
                    >
                      {isSep ? "" : h}
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={uiHeaders.length} className="py-3 text-gray-500" style={{ border: "1px solid #000" }}>
                    Loading…
                  </td>
                </tr>
              )}

              {!isLoading && uiTwoSide.length === 0 && (
                <tr>
                  <td colSpan={uiHeaders.length} className="py-3 text-gray-500" style={{ border: "1px solid #000" }}>
                    No entries.
                  </td>
                </tr>
              )}

              {!isLoading && uiTwoSide.map((r, i) => {
                const inc = r.inc
                const exp = r.exp
                const dash = "—"

                return (
                  <tr key={i}>
                    {uiHeaders.map((h, idx) => {
                      const isSep = h === "|"
                      const isNum = h === "Incoming" || h === "Expense" || h === "Balance"

                      const style: React.CSSProperties = isSep
                        ? {
                            padding: 0,
                            background: "#fff",
                            borderLeft: "1px solid #000",
                            borderRight: "1px solid #000",
                            borderTop: "none",
                            borderBottom: "none",
                            width: uiWidthMap["|"],
                          }
                        : {
                            border: "1px solid #000",
                            padding: "8px",
                            whiteSpace: (h === "Incoming" || h === "Expense" || h === "Balance" || h === "Date") ? "nowrap" : "normal",
                            textAlign: isNum ? "right" : "left",
                            fontWeight: isNum ? 600 : 400,
                          }

                      // Column layout:
                      // 0..3 income, 4 sep1, 5..8 expense, 9 sep2 (if cumulative), 10 balance
                      if (!includeCumulative) {
                        if (idx === 0) return <td key={idx} style={style}>{inc ? inc.ts : (alignTwoSidedRows ? dash : "")}</td>
                        if (idx === 1) return <td key={idx} style={style}>{inc ? inc.division : (alignTwoSidedRows ? dash : "")}</td>
                        if (idx === 2) return <td key={idx} style={style}>{inc ? inc.category : (alignTwoSidedRows ? dash : "")}</td>
                        if (idx === 3) return <td key={idx} style={style}>{inc ? inr(inc.incoming) : (alignTwoSidedRows ? dash : "")}</td>
                        if (idx === 4) return <td key={idx} style={style} />
                        if (idx === 5) return <td key={idx} style={style}>{exp ? exp.ts : (alignTwoSidedRows ? dash : "")}</td>
                        if (idx === 6) return <td key={idx} style={style}>{exp ? exp.division : (alignTwoSidedRows ? dash : "")}</td>
                        if (idx === 7) return <td key={idx} style={style}>{exp ? exp.category : (alignTwoSidedRows ? dash : "")}</td>
                        if (idx === 8) return <td key={idx} style={style}>{exp ? inr(exp.expense) : (alignTwoSidedRows ? dash : "")}</td>
                        return <td key={idx} style={style} />
                      }

                      if (idx === 0) return <td key={idx} style={style}>{inc ? inc.ts : (alignTwoSidedRows ? dash : "")}</td>
                      if (idx === 1) return <td key={idx} style={style}>{inc ? inc.division : (alignTwoSidedRows ? dash : "")}</td>
                      if (idx === 2) return <td key={idx} style={style}>{inc ? inc.category : (alignTwoSidedRows ? dash : "")}</td>
                      if (idx === 3) return <td key={idx} style={style}>{inc ? inr(inc.incoming) : (alignTwoSidedRows ? dash : "")}</td>
                      if (idx === 4) return <td key={idx} style={style} />
                      if (idx === 5) return <td key={idx} style={style}>{exp ? exp.ts : (alignTwoSidedRows ? dash : "")}</td>
                      if (idx === 6) return <td key={idx} style={style}>{exp ? exp.division : (alignTwoSidedRows ? dash : "")}</td>
                      if (idx === 7) return <td key={idx} style={style}>{exp ? exp.category : (alignTwoSidedRows ? dash : "")}</td>
                      if (idx === 8) return <td key={idx} style={style}>{exp ? inr(exp.expense) : (alignTwoSidedRows ? dash : "")}</td>
                      if (idx === 9) return <td key={idx} style={style} />
                      if (idx === 10) return <td key={idx} style={style}>{r.balance}</td>
                      return <td key={idx} style={style} />
                    })}
                  </tr>
                )
              })}

              {/* Totals row */}
              {!isLoading && uiTwoSide.length > 0 && (
                <tr>
                  {uiHeaders.map((h, idx) => {
                    const isSep = h === "|"
                    const isNum = h === "Incoming" || h === "Expense" || h === "Balance"
                    const style: React.CSSProperties = isSep
                      ? {
                          padding: 0,
                          background: "#fff",
                          borderLeft: "1px solid #000",
                          borderRight: "1px solid #000",
                          borderTop: "none",
                          borderBottom: "none",
                          width: uiWidthMap["|"],
                        }
                      : {
                          border: "1px solid #000",
                          padding: "8px",
                          fontWeight: 700,
                          textAlign: isNum ? "right" : "left",
                          whiteSpace: isNum ? "nowrap" : "normal",
                        }

                    if (idx === 0) return <td key={idx} style={style}>Totals</td>
                    if (h === "Incoming") return <td key={idx} style={{ ...style, color: "#065f46" }}>{inr(totals.inc)}</td>
                    if (h === "Expense") return <td key={idx} style={{ ...style, color: "#991b1b" }}>{inr(totals.out)}</td>
                    if (h === "Balance") return <td key={idx} style={{ ...style, color: "#1e40af" }}>{inr(totals.net)}</td>
                    return <td key={idx} style={style} />
                  })}
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
