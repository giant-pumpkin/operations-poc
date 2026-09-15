import { NavLink, Outlet } from 'react-router-dom'
import {
  Package,
  ScanBarcode,
  Warehouse,
  PackagePlus,
  ArrowRightLeft,
  Undo2,
  ClipboardMinus,
  ArrowLeftRight,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/products', label: 'Products', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: ScanBarcode },
  { to: '/stock', label: 'Stock', icon: Warehouse },
  { to: '/stock-in', label: 'Stock In', icon: PackagePlus },
  { to: '/transfer', label: 'Transfer', icon: ArrowRightLeft },
  { to: '/return', label: 'Return', icon: Undo2 },
  { to: '/adjustment', label: 'Adjustment', icon: ClipboardMinus },
  { to: '/movements', label: 'Movements', icon: ArrowLeftRight },
]

function AsteriskLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
      <line x1="19.07" y1="4.93" x2="4.93" y2="19.07" />
    </svg>
  )
}

export default function Layout() {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-neutral-800 text-neutral-0 flex flex-col shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <AsteriskLogo className="w-5 h-5 text-brand-500" />
          <span className="font-semibold text-sm tracking-wide">ConnectIQ</span>
        </div>

        <nav className="flex-1 px-2 space-y-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-120 ${
                  isActive
                    ? 'bg-neutral-700 text-neutral-0 border-l-2 border-brand-500'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/50'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-5 py-4 border-t border-neutral-700/50 text-[11px] text-neutral-500">
          Inventory Prototype
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-neutral-50">
        <Outlet />
      </main>
    </div>
  )
}
