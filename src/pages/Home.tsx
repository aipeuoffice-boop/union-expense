
import { useQuery } from "@tanstack/react-query"
import { supabase } from "../lib/supabase"

async function fetchBalance() {
  // v_balance aggregates visible rows; RLS on base tables applies.
  const { data, error } = await supabase
    .from("v_balance")
    .select("balance")
    .maybeSingle()
  if (error) throw error
  return data?.balance ?? 0
}

export default function Home() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["balance"],
    queryFn: fetchBalance
  })

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold">Union Expense Tracker</h1>
        <p className="text-sm text-gray-600 mt-1">Connected to Supabase ✓</p>

        <div className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          {isLoading && <p>Loading balance…</p>}
          {error && (
            <p className="text-red-600">
              {((error as unknown) as Error).message ?? "Failed to load balance"}
            </p>
          )}
          {!isLoading && !error && (
            <>
              <p className="text-gray-800">
                Current balance: <span className="font-semibold">₹{Number(data).toLocaleString("en-IN")}</span>
              </p>
              <button
                className="mt-4 rounded-lg border px-3 py-2"
                onClick={()=>refetch()}
              >
                Refresh
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
