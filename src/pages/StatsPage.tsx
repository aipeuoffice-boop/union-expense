import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"
import { inr } from "../lib/format"
import {
		ResponsiveContainer,
		LineChart,
		Line,
		XAxis,
		YAxis,
		Tooltip,
		PieChart,
	Pie,
	Cell,
	BarChart,
	Bar,
} from "recharts"

type Division = { id: string; name: string }

type MaybeObj<T> = T | T[] | null

type Row = {
	ts: string
	kind: "INCOMING" | "OUTGOING"
	amount: number
	notes: string | null
	division: MaybeObj<{ name: string }>
	category: MaybeObj<{ name: string }>
}

async function fetchDivisions(): Promise<Division[]> {
	const { data, error } = await supabase.from("divisions").select("id,name").order("name")
	if (error) throw error
	return data ?? []
}

async function fetchRows(from: string, to: string, divisionId?: string, kind?: string) {
	let q = supabase
		.from("journal")
		.select("ts, kind, amount, notes, division:divisions(name), category:categories(name)")
		.gte("ts", from)
		.lte("ts", to)
		.order("ts", { ascending: false })
		.order("created_at", { ascending: false })

	if (divisionId) q = q.eq("division_id", divisionId)
	if (kind && kind !== "ALL") q = q.eq("kind", kind)

	const { data, error } = await q
	if (error) throw error
	return (data ?? []) as unknown as Row[]
}

function firstName(v: MaybeObj<{ name: string }>, fallback = "—") {
	if (!v) return fallback
	if (Array.isArray(v)) return v[0]?.name ?? fallback
	return v.name ?? fallback
}

const COLORS = ["#4f46e5", "#06b6d4", "#f97316", "#ef4444", "#10b981", "#a78bfa", "#f59e0b"]

export default function StatsPage() {
	// Default to last 6 months
	const now = new Date()
	const toY = now.getFullYear()
	const toM = String(now.getMonth() + 1).padStart(2, "0")
	const toD = String(now.getDate()).padStart(2, "0")
	const today = `${toY}-${toM}-${toD}`

	const past = new Date(now.getFullYear(), now.getMonth() - 5, 1)
	const fromY = past.getFullYear()
	const fromM = String(past.getMonth() + 1).padStart(2, "0")
	const from = `${fromY}-${fromM}-01`

	const [fromDate, setFromDate] = useState(from)
	const [toDate, setToDate] = useState(today)
	const [divisionId, setDivisionId] = useState<string>("")
	const [kind, setKind] = useState<string>("ALL")

	const { data: divisions } = useQuery({ queryKey: ["divisions"], queryFn: fetchDivisions })

	const { data: rows, isLoading, refetch } = useQuery({
		queryKey: ["stats-rows", fromDate, toDate, divisionId, kind],
		queryFn: () => fetchRows(fromDate, toDate, divisionId, kind),
	})

	useEffect(() => {
		refetch()
	}, [fromDate, toDate, divisionId, kind, refetch])

	const monthly = useMemo(() => {
		// Group by YYYY-MM and sum incoming/outgoing
		const map = new Map<string, { month: string; income: number; expense: number }>()
		const rowsArr = rows ?? []
		for (const r of rowsArr) {
			const month = r.ts.slice(0, 7)
			if (!map.has(month)) map.set(month, { month, income: 0, expense: 0 })
			const cur = map.get(month)!
			if (r.kind === "INCOMING") cur.income += Number(r.amount)
			else cur.expense += Number(r.amount)
		}
		// Build sorted array across range (ensure months with 0s included)
		const start = new Date(fromDate)
		const end = new Date(toDate)
		const out: Array<{ month: string; income: number; expense: number }> = []
		const d = new Date(start.getFullYear(), start.getMonth(), 1)
		while (d <= end) {
			const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
			const v = map.get(m) ?? { month: m, income: 0, expense: 0 }
			out.push(v)
			d.setMonth(d.getMonth() + 1)
		}
		return out
	}, [rows, fromDate, toDate])

	const byCategory = useMemo(() => {
		const map = new Map<string, number>()
		for (const r of rows ?? []) {
			const cat = firstName(r.category, "Uncategorized")
			const val = map.get(cat) ?? 0
			// treat OUTGOING as positive for pie of expenses; include only OUTGOING by default
			const amt = r.kind === "OUTGOING" ? Number(r.amount) : 0
			map.set(cat, val + amt)
		}
		const arr = Array.from(map.entries()).map(([name, value]) => ({ name, value }))
		// sort desc and take top 8
		arr.sort((a, b) => b.value - a.value)
		return arr
	}, [rows])

	const byDivision = useMemo(() => {
		const map = new Map<string, number>()
		for (const r of rows ?? []) {
			const div = firstName(r.division, "No division")
			const val = map.get(div) ?? 0
			// use net (INCOMING positive, OUTGOING negative)
			const amt = r.kind === "INCOMING" ? Number(r.amount) : -Number(r.amount)
			map.set(div, val + amt)
		}
		const arr = Array.from(map.entries()).map(([division, value]) => ({ division, value }))
		arr.sort((a, b) => b.value - a.value)
		return arr
	}, [rows])

	const totals = useMemo(() => {
		const inc = (rows ?? []).filter((r) => r.kind === "INCOMING").reduce((s, r) => s + Number(r.amount), 0)
		const out = (rows ?? []).filter((r) => r.kind === "OUTGOING").reduce((s, r) => s + Number(r.amount), 0)
		return { inc, out, net: inc - out }
	}, [rows])

	return (
		<div className="container">
			<h1 className="h1">Statistics</h1>
			<p className="small mb-4">Visualize income, expenses and breakdowns across time.</p>

			<div className="card p-4 space-y-4">
				<div className="grid sm:grid-cols-5 gap-3">
					<div>
						<label className="text-sm">From</label>
						<input type="date" className="input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
					</div>
					<div>
						<label className="text-sm">To</label>
						<input type="date" className="input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
					</div>
					<div className="sm:col-span-2">
						<label className="text-sm">Division</label>
						<select className="select" value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
							<option value="">All divisions</option>
							{divisions?.map((d) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="text-sm">Kind</label>
						<select className="select" value={kind} onChange={(e) => setKind(e.target.value)}>
							<option value="ALL">All</option>
							<option value="INCOMING">Income</option>
							<option value="OUTGOING">Expenses</option>
						</select>
					</div>
				</div>

				<div className="grid sm:grid-cols-3 gap-3">
					<div className="card p-4">
						<div className="text-xs text-gray-600">Income</div>
						<div className="text-lg font-semibold text-green-700">{inr(totals.inc)}</div>
					</div>
					<div className="card p-4">
						<div className="text-xs text-gray-600">Expenses</div>
						<div className="text-lg font-semibold text-red-700">{inr(totals.out)}</div>
					</div>
					<div className="card p-4">
						<div className="text-xs text-gray-600">Net</div>
						<div className="text-lg font-semibold">{inr(totals.net)}</div>
					</div>
				</div>

				<div className="grid lg:grid-cols-3 gap-4">
					<div className="card p-4 col-span-2">
						<h2 className="mb-2 text-sm font-medium">Monthly income vs expenses</h2>
						<div style={{ width: "100%", height: 280 }}>
														<ResponsiveContainer>
															<LineChart data={monthly}>
																<XAxis dataKey="month" />
																<YAxis />
																<Tooltip formatter={(v: number) => inr(Number(v))} />
																<Line type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} dot={false} />
																<Line type="monotone" dataKey="expense" name="Expenses" stroke="#ef4444" strokeWidth={2} dot={false} />
															</LineChart>
														</ResponsiveContainer>
						</div>
					</div>

					<div className="card p-4">
						<h2 className="mb-2 text-sm font-medium">Expenses by category</h2>
						<div style={{ width: "100%", height: 280 }}>
							<ResponsiveContainer>
								<PieChart>
														<Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={90} label>
															{byCategory.map((_, index) => (
																<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
															))}
														</Pie>
									<Tooltip formatter={(v: number) => inr(Number(v))} />
								</PieChart>
							</ResponsiveContainer>
						</div>
					</div>
				</div>

				<div className="card p-4">
					<h2 className="mb-2 text-sm font-medium">Net by division</h2>
					<div style={{ width: "100%", height: 300 }}>
						<ResponsiveContainer>
							<BarChart data={byDivision} layout="vertical">
								<XAxis type="number" />
								<YAxis dataKey="division" type="category" width={160} />
								<Tooltip formatter={(v: number) => inr(Number(v))} />
								<Bar dataKey="value" name="Net" fill="#4f46e5">
									{byDivision.map((_, i) => (
										<Cell key={`b-${i}`} fill={COLORS[i % COLORS.length]} />
									))}
								</Bar>
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>

				<div className="text-sm text-gray-500">{isLoading ? "Loading data…" : `Showing ${rows?.length ?? 0} journal rows`}</div>
			</div>
		</div>
	)
}
