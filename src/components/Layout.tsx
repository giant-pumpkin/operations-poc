import { NavLink, Outlet } from 'react-router-dom'
import {
  Package,
  ScanBarcode,
  Warehouse,
  PackagePlus,
  ArrowRightLeft,
  ClipboardMinus,
  ArrowLeftRight,
  Briefcase,
  FileText,
  UserRound,
  ChevronDown,
} from 'lucide-react'
import { useProfile } from '../lib/profile'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  finance: 'Finance',
  sales: 'Sales',
  deployment: 'Deployment',
}

const NAV_ITEMS = [
  { to: '/products', label: 'Products', icon: Package },
  { to: '/inventory', label: 'Inventory', icon: ScanBarcode },
  { to: '/stock', label: 'Stock', icon: Warehouse },
  { to: '/stock-in', label: 'Stock In', icon: PackagePlus },
  { to: '/transfer', label: 'Transfer', icon: ArrowRightLeft },
  { to: '/adjustment', label: 'Adjustment', icon: ClipboardMinus },
  { to: '/quotes', label: 'Quotes', icon: FileText },
  { to: '/jobs', label: 'Jobs', icon: Briefcase },
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
  const { profiles, profile, profileId, setProfileId } = useProfile()

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

        <div className="px-3 py-3 border-t border-neutral-700/50">
          <label className="block px-2 mb-1 text-[10px] uppercase tracking-[0.06em] text-neutral-500">Acting as</label>
          <div className="relative">
            <UserRound size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            <select
              value={profileId}
              onChange={e => setProfileId(e.target.value)}
              className="w-full h-9 pl-8 pr-7 rounded-lg bg-neutral-700/60 border border-neutral-700 text-[13px] text-neutral-100 appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.full_name} · {ROLE_LABEL[p.role] ?? p.role}</option>
              ))}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          </div>
          <div className="px-2 mt-2 text-[11px] text-neutral-500 truncate">{profile?.email ?? 'Inventory Prototype'}</div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-neutral-50">
        <Outlet />
      </main>
    </div>
  )
}
