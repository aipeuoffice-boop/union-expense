import { Routes, Route, NavLink, Navigate } from "react-router-dom"
import { useAuth } from "./auth"
import { useState } from "react"

import Login from "./pages/Login"
import BulkUploadPage from "./pages/BulkUploadPage"
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
  const [open, setOpen] = useState(false)
  const navItems = [
    { to: "/", label: "Home", icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-8 9 8v7a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2v-7z" />
      </svg>
    )},
    { to: "/journal", label: "Add Entry", icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
    )},
    { to: "/divisions", label: "Divisions", icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M3 12h18M3 17h18" />
      </svg>
    )},
    { to: "/categories", label: "Categories", icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
      </svg>
    )},
    { to: "/reports", label: "Reports", icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 17v-6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v6m4 0v-4a2 2 0 0 0-2-2h-1M5 21V7a2 2 0 0 1 2-2h1" />
      </svg>
    )},
    { to: "/stats", label: "Statistics", icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M11 12h6M11 6h6M11 18h6M6 20V8" />
      </svg>
    )},
    { to: "/export", label: "Export", icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4-4-4M21 21H3" />
      </svg>
    )},
    { to: "/bulk-upload", label: "Bulk Upload", icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 3v16m0 0l4-4m-4 4-4-4M21 21H3" />
      </svg>
    )},
  ]

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
          {/* Use column layout on small screens so menu can be centered; row layout on sm+ */}
          <div className="container flex items-center justify-between py-2">
            {/* Mobile toggle + brand*/}
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-start">
              <button
                className="sm:hidden p-2 rounded-md hover:bg-black/10"
                aria-label="Toggle menu"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
              >
                {/* simple hamburger icon */}
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="hidden sm:block text-sm font-semibold">Menu</div>
            </div>

            {/* Links: centered panel on mobile, horizontal on sm+ */}
            <div className="w-full flex justify-center sm:justify-end">
              <div className={`transition-all duration-200 w-full sm:w-auto ${open ? 'opacity-100 scale-100' : 'opacity-0 scale-95 sm:opacity-100 sm:scale-100'} origin-top`}> 
                {/* Mobile panel */}
                <div className={`mx-auto sm:hidden ${open ? 'block' : 'hidden'} bg-white/5 backdrop-blur-sm rounded-xl shadow-md px-3 py-3 max-w-md`}> 
                  <ul className="space-y-2">
                    {navItems.map((it) => (
                      <li key={it.to}>
                        <NavLink
                          to={it.to}
                          end={it.to === '/'}
                          className={({ isActive }: { isActive: boolean }) =>
                            `flex items-center justify-center gap-3 px-4 py-3 rounded-lg hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30 transition ${isActive ? 'bg-white/20 font-semibold' : 'text-white'}`
                          }
                          onClick={() => setOpen(false)}
                        >
                          <span className="text-white/90">{it.icon}</span>
                          <span className="text-sm">{it.label}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Desktop / sm+ horizontal */}
                <ul className="hidden sm:flex sm:flex-wrap gap-4 text-sm items-center">
                  {navItems.map((it) => (
                    <li key={it.to}>
                      <NavLink
                        to={it.to}
                        end={it.to === '/'}
                        className={({ isActive }: { isActive: boolean }) =>
                          `inline-flex items-center gap-2 px-3 py-2 rounded-md hover:bg-white/10 transition ${isActive ? 'bg-white/20 font-semibold' : 'text-white/90'}`
                        }
                        onClick={() => setOpen(false)}
                      >
                        <span className="inline-block opacity-90">{it.icon}</span>
                        <span className="hidden sm:inline">{it.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </nav>
      )}

      {/* Routes */}
      <div className="container py-4">
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/bulk-upload"
            element={
              <Protected>
                <BulkUploadPage />
              </Protected>
            }
          />

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
