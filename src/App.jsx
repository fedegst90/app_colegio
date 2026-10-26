import { useEffect, useState } from 'react'
import { DataProvider } from './context/DataProvider'
import { ToastProvider } from './context/ToastProvider'
import { useData } from './context/data-context'
import { Icon } from './components/Icon'
import { ErrorScreen, LoadingScreen } from './components/UI'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import Assignments from './pages/Assignments'
import Students from './pages/Students'
import Grades from './pages/Grades'
import Program from './pages/Program'
import Planning from './pages/Planning'

const NAV_ITEMS = [
  { page: 'dashboard', label: 'Panel', icon: 'dashboard' },
  { page: 'notas', label: 'Notas', icon: 'clipboard' },
  { page: 'catedras', label: 'Cátedras', icon: 'graduation' },
  { page: 'alumnos', label: 'Alumnos', icon: 'users' },
  { page: 'programa', label: 'Programa', icon: 'book' },
  { page: 'planificacion', label: 'Planificación', icon: 'calendar' },
  { page: 'configuracion', label: 'Configuración', icon: 'settings' },
]

const VALID_PAGES = new Set(NAV_ITEMS.map((item) => item.page))

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '')
  const [pagePart, queryPart = ''] = raw.split('?')
  const page = VALID_PAGES.has(pagePart) ? pagePart : 'dashboard'
  const params = Object.fromEntries(new URLSearchParams(queryPart))
  return { page, params }
}

function buildHash(page, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  ).toString()
  return `#${page}${query ? `?${query}` : ''}`
}

function AppShell() {
  const { ready, error } = useData()
  const [route, setRoute] = useState(parseHash)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash())
      setMobileOpen(false)
    }
    window.addEventListener('hashchange', handleHashChange)
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#dashboard')
    }
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const current =
    NAV_ITEMS.find((item) => item.page === route.page) ?? NAV_ITEMS[0]

  useEffect(() => {
    document.title = `${current.label} · Aula Docente`
  }, [current.label])

  function navigate(page, params = {}) {
    const hash = buildHash(page, params)
    if (window.location.hash === hash) {
      setRoute(parseHash())
    } else {
      window.location.hash = hash
    }
  }

  if (error && !ready) {
    return <ErrorScreen error={error} />
  }

  if (!ready) {
    return <LoadingScreen />
  }

  const pages = {
    dashboard: <Dashboard navigate={navigate} params={route.params} />,
    configuracion: <Settings navigate={navigate} />,
    catedras: <Assignments navigate={navigate} params={route.params} />,
    alumnos: <Students navigate={navigate} params={route.params} />,
    notas: <Grades navigate={navigate} params={route.params} />,
    programa: <Program navigate={navigate} params={route.params} />,
    planificacion: <Planning navigate={navigate} params={route.params} />,
  }

  const today = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  })

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">
            <Icon name="graduation" size={22} />
          </span>
          <div>
            <strong>Aula Docente</strong>
            <small>Gestión de cátedras</small>
          </div>
          <button
            type="button"
            className="icon-button sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <nav className="main-nav" aria-label="Navegación principal">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.page}
              className={`nav-item ${
                route.page === item.page ? 'active' : ''
              }`}
              aria-current={route.page === item.page ? 'page' : undefined}
              onClick={() => navigate(item.page)}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="db-dot" />
          <div>
            <strong>Base local</strong>
            <small>SQLite · guardado automático</small>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Cerrar menú"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              type="button"
              className="icon-button menu-button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menú"
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="topbar-title">
              <span>Aula Docente</span>
              <strong>{current.label}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-pill">
              <span className="db-dot" /> Datos locales
            </span>
            <span className="topbar-date">{today}</span>
          </div>
        </header>

        <main className="app-content">{pages[route.page]}</main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <AppShell />
      </DataProvider>
    </ToastProvider>
  )
}
