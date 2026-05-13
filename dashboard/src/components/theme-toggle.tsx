'use client'

import React, { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

function resolve(): Theme {
  try {
    const v = localStorage.getItem('theme')
    if (v === 'light' || v === 'dark') return v
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function apply(theme: Theme) {
  try {
    localStorage.setItem('theme', theme)
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.removeAttribute('data-theme')
  } catch {}
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    setTheme(resolve())
    setMounted(true)
  }, [])

  function toggle() {
    const next: Theme = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    apply(next)
  }

  if (!mounted) return <div style={{ width: 32, height: 32 }} />

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className="flex items-center justify-center rounded-md transition-opacity hover:opacity-70"
        style={{
          width: 32,
          height: 32,
          color: 'var(--mute)',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>

      {hovered && (
        <div
          className="absolute right-0 top-full mt-1 whitespace-nowrap rounded-md px-2 py-1 text-xs pointer-events-none z-50"
          style={{
            backgroundColor: 'var(--surface-card)',
            color: 'var(--body)',
            border: '1px solid var(--hairline)',
            boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
          }}
        >
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </div>
      )}
    </div>
  )
}
