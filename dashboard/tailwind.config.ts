import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#eeefe9',
        'surface-card': '#ffffff',
        'surface-soft': '#e5e7e0',
        'surface-dark': '#23251d',
        primary: '#f7a501',
        'primary-pressed': '#dd9001',
        ink: '#23251d',
        body: '#4d4f46',
        charcoal: '#33342d',
        mute: '#6c6e63',
        ash: '#9b9c92',
        hairline: '#bfc1b7',
        'hairline-soft': '#dcdfd2',
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'var(--font-ibm-plex-sans)', '-apple-system', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
        xs: '2px',
        sm: '4px',
        md: '6px',
        lg: '8px',
        full: '9999px',
      },
      fontSize: {
        'display-xl': ['36px', { lineHeight: '1.5', fontWeight: '700' }],
        'display-lg': ['24px', { lineHeight: '1.33', fontWeight: '800', letterSpacing: '-0.6px' }],
        'heading-lg': ['21px', { lineHeight: '1.4', fontWeight: '700', letterSpacing: '-0.5px' }],
        'heading-md': ['20px', { lineHeight: '1.4', fontWeight: '700' }],
        'heading-sm': ['18px', { lineHeight: '1.5', fontWeight: '700' }],
        'body-md': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['15px', { lineHeight: '1.71', fontWeight: '400' }],
        'body-xs': ['14px', { lineHeight: '1.43', fontWeight: '500' }],
        'caption-md': ['14px', { lineHeight: '1.71', fontWeight: '700' }],
        'caption-xs': ['12px', { lineHeight: '1.33', fontWeight: '600' }],
        'utility-xs': ['12px', { lineHeight: '1.33', fontWeight: '700' }],
        'button-md': ['14px', { lineHeight: '1.5', fontWeight: '700' }],
        'button-sm': ['13px', { lineHeight: '1', fontWeight: '500' }],
      },
    },
  },
  plugins: [],
}

export default config
