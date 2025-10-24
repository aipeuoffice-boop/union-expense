import { Routes, Route, NavLink, Navigate } from "react-router-dom"
import { useAuth } from "./auth"

import Login from "./pages/Login"
import Home from "./pages/Home"
import DivisionsPage from "./pages/DivisionsPage"
import CategoriesPage from "./pages/CategoriesPage"
import JournalPage from "./pages/JournalPage"
// ...existing code...
import ReportsPage from "./pages/ReportsPage"
import ExportPage from "./pages/ExportPage"
import StatsPage from "./pages/StatsPage"

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-gray-600">
        Checking session…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-postal-sheet text-postal-ink">
      {/* Branded header */}
      <div className="bg-white border-b">
        <div className="container flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            {/* Simple color mark (can replace with logo image later) */}
            <div
              className="h-8 w-8 rounded-lg"
              style={{
                background:
                  "conic-gradient(from 220deg at 50% 50%, #FFCC00 0% 60%, #C01622 60% 100%)",
              }}
              aria-hidden
            />
            <div>
              <div className="font-bold text-postal-red">
                All India Postal Employees Union — Postman &amp; MTS
              </div>
              <div className="text-xs text-gray-600">
                Andhra Pradesh Circle • Srikalahasti
              </div>
            </div>
          </div>

          <div className="text-sm">
            {user ? (
              <button className="underline" onClick={signOut}>
                Sign out
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Themed nav */}
      {user && (
        <nav className="bg-postal-red text-white">
          <div className="container">
            <ul className="flex flex-wrap gap-3 py-2 text-sm">
              <li>
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    isActive ? "font-semibold underline" : ""
                  }
                >
                  Home
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/journal"
                  className={({ isActive }) =>
                    isActive ? "font-semibold underline" : ""
                  }
                >
                  Add Entry
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/divisions"
                  className={({ isActive }) =>
                    isActive ? "font-semibold underline" : ""
                  }
                >
                  Divisions
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/categories"
                  className={({ isActive }) =>
                    isActive ? "font-semibold underline" : ""
                  }
                >
                  Categories
                </NavLink>
              </li>
              <li>
                {/* Removed Standard Expenses nav link */}
              </li>
              <li>
                <NavLink
                  to="/reports"
                  className={({ isActive }) =>
                    isActive ? "font-semibold underline" : ""
                  }
                >
                  Reports
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/stats"
                  className={({ isActive }) =>
                    isActive ? "font-semibold underline" : ""
                  }
                >
                  Statistics
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/export"
                  className={({ isActive }) =>
                    isActive ? "font-semibold underline" : ""
                  }
                >
                  Export
                </NavLink>
              </li>
            </ul>
          </div>
        </nav>
      )}

      {/* Routes */}
      <div className="container py-4">
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <Protected>
                <Home />
              </Protected>
            }
          />
          <Route
            path="/journal"
            element={
              <Protected>
                <JournalPage />
              </Protected>
            }
          />
          <Route
            path="/divisions"
            element={
              <Protected>
                <DivisionsPage />
              </Protected>
            }
          />
          <Route
            path="/categories"
            element={
              <Protected>
                <CategoriesPage />
              </Protected>
            }
          />
          <Route
            // ...existing code...
          />
          <Route
            path="/reports"
            element={
              <Protected>
                <ReportsPage />
              </Protected>
            }
          />
          <Route
            path="/stats"
            element={
              <Protected>
                <StatsPage />
              </Protected>
            }
          />
          <Route
            path="/export"
            element={
              <Protected>
                <ExportPage />
              </Protected>
            }
          />

          <Route
            path="*"
            element={<Navigate to={user ? "/" : "/login"} replace />}
          />
        </Routes>
      </div>
    </div>
  )
}
