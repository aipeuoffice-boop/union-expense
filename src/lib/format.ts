export const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n)

// Map stored kind values to friendly UI labels
export function kindLabel(kind: string | null | undefined) {
  if (!kind) return "—"
  if (kind === "INCOMING") return "Income"
  if (kind === "OUTGOING") return "Expenses"
  return String(kind)
}
