export default function Footer() {
  return (
    <footer
      className="border-t mt-16"
      style={{ borderColor: 'var(--hairline)', backgroundColor: 'var(--canvas)' }}
    >
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
            OPT Timeline
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mute)' }}>
            Community data from r/f1visa and r/USCIS megathreads. Not affiliated with USCIS.
          </p>
        </div>
        <p className="text-xs" style={{ color: 'var(--ash)' }}>
          For informational use only
        </p>
      </div>
    </footer>
  )
}
