// Tab navigation shared between /admin (Users) and /admin/lookups.
// Both pages render this at the top of <main> so the relationship
// between the two views is visible and switching feels like flipping
// tabs in an admin section, not navigating between unrelated routes.

const TABS = [
  { key: 'users',   label: 'Users',   href: '/admin'         },
  { key: 'lookups', label: 'Lookups', href: '/admin/lookups' },
] as const

export type AdminTabKey = typeof TABS[number]['key']

export default function AdminTabs({ active }: { active: AdminTabKey }) {
  return (
    <div className="flex items-center gap-1 border-b border-[#dde8f5] -mt-2 mb-6">
      {TABS.map(t => {
        const isActive = t.key === active
        return (
          <a
            key={t.key}
            href={t.href}
            className={
              isActive
                ? 'px-4 py-2.5 -mb-px border-b-2 border-[#006092] text-sm font-semibold text-[#12304f]'
                : 'px-4 py-2.5 -mb-px border-b-2 border-transparent text-sm text-[#94afd5] hover:text-[#425d7f] transition-colors'
            }
            aria-current={isActive ? 'page' : undefined}
          >
            {t.label}
          </a>
        )
      })}
    </div>
  )
}
