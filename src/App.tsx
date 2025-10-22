import { Routes, Route, NavLink, Navigate } from "react-router-dom"
import { useAuth } from "./auth"
import Login from "./pages/Login"
import Home from "./pages/Home"
import DivisionsPage from "./pages/DivisionsPage"
import CategoriesPage from "./pages/CategoriesPage"
import JournalPage from "./pages/JournalPage"
import StandardExpensesPage from "./pages/StandardExpensesPage"
import ReportsPage from "./pages/ReportsPage"
import ExportPage from "./pages/ExportPage"

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-gray-600">Checking session…</div>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="font-semibold">Union Expense Tracker</div>
        <div className="text-sm">
          {user ? <button className="underline" onClick={signOut}>Sign out</button> : null}
        </div>
      </div>

      {user && (
        <nav className="px-4 py-2 border-b bg-white">
          <ul className="flex gap-3 text-sm">
            <li><NavLink to="/" end className={({isActive}) => isActive ? "font-semibold" : ""}>Home</NavLink></li>
            <li><NavLink to="/journal" className={({isActive}) => isActive ? "font-semibold" : ""}>Add Entry</NavLink></li>
            <li><NavLink to="/divisions" className={({isActive}) => isActive ? "font-semibold" : ""}>Divisions</NavLink></li>
            <li><NavLink to="/categories" className={({isActive}) => isActive ? "font-semibold" : ""}>Categories</NavLink></li>
            <li><NavLink to="/standard" className={({isActive}) => isActive ? "font-semibold" : ""}>Standard</NavLink></li>
            <li><NavLink to="/reports" className={({isActive}) => isActive ? "font-semibold" : ""}>Reports</NavLink></li>
            <li><NavLink to="/export" className={({isActive}) => isActive ? "font-semibold" : ""}>Export</NavLink></li>
          </ul>
        </nav>
      )}

      <div className="p-4">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><Home /></Protected>} />
          <Route path="/journal" element={<Protected><JournalPage /></Protected>} />
          <Route path="/divisions" element={<Protected><DivisionsPage /></Protected>} />
          <Route path="/categories" element={<Protected><CategoriesPage /></Protected>} />
          <Route path="/standard" element={<Protected><StandardExpensesPage /></Protected>} />
          <Route path="/reports" element={<Protected><ReportsPage /></Protected>} />
          <Route path="/export" element={<Protected><ExportPage /></Protected>} />
          <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
        </Routes>
      </div>
    </div>
  )
}
