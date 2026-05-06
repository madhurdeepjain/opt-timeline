function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="13" fill="#23251d"/>
      <rect x="16" y="30.5" width="32" height="3" rx="1.5" fill="#33342d"/>
      <circle cx="16" cy="32" r="5.5" fill="#4d4f46"/>
      <circle cx="30" cy="32" r="5.5" fill="#4d4f46"/>
      <circle cx="48" cy="32" r="10" fill="#f7a501"/>
      <path d="M42 33 L47 37 L55 27" stroke="#23251d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export default function Nav({ lastUpdated }: { lastUpdated: string | null }) {
  return (
    <nav
      className="w-full border-b"
      style={{ backgroundColor: 'var(--canvas)', borderColor: 'var(--hairline)' }}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="text-lg font-bold" style={{ color: 'var(--ink)' }}>
            OPT Timeline
          </span>
          <span
            className="hidden sm:inline-block text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--primary)', color: 'var(--ink)' }}
          >
            Community
          </span>
        </div>
        <div className="flex items-center gap-4">
          {lastUpdated && (
            <span className="text-xs hidden sm:block" style={{ color: 'var(--mute)' }}>
              Updated {lastUpdated}
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--mute)' }}>
            r/f1visa · r/USCIS
          </span>
        </div>
      </div>
    </nav>
  )
}
