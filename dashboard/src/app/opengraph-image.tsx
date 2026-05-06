import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        background: '#1a1b14',
        padding: '72px 80px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '6px',
          background: '#f7a501',
        }}
      />
      {/* Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '32px',
        }}
      >
        <div
          style={{
            background: '#f7a501',
            color: '#1a1b14',
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            padding: '5px 12px',
            borderRadius: '100px',
          }}
        >
          Community
        </div>
        <span style={{ color: '#6b6d60', fontSize: '14px' }}>r/f1visa · r/USCIS</span>
      </div>
      {/* Title */}
      <div
        style={{
          color: '#f0f0e8',
          fontSize: '64px',
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          marginBottom: '20px',
        }}
      >
        OPT Timeline
      </div>
      {/* Subtitle */}
      <div
        style={{
          color: '#9a9c8e',
          fontSize: '26px',
          fontWeight: 400,
          lineHeight: 1.4,
          maxWidth: '720px',
        }}
      >
        OPT &amp; STEM OPT processing timelines aggregated from Reddit
      </div>
    </div>,
    size,
  )
}
