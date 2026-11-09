import type { Config } from 'tailwindcss';

const config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: 'var(--ow-navy)',
        'navy-light': 'var(--ow-navy-light)',
        action: 'var(--ow-blue)',
        'action-soft': 'var(--ow-blue-soft)',
        teal: 'var(--ow-teal)',
        'teal-soft': 'var(--ow-teal-soft)',
        amber: 'var(--ow-amber)',
        'amber-soft': 'var(--ow-amber-soft)',
        ink: 'var(--ow-ink)',
        ink2: 'var(--ow-ink2)',
        ink3: 'var(--ow-ink3)',
        line: 'var(--ow-line)',
        canvas: 'var(--ow-bg)',
        danger: 'var(--ow-red)',
        'danger-soft': 'var(--ow-red-soft)',
        purp: 'var(--ow-purp)',
        'purp-soft': 'var(--ow-purp-soft)',
        admin: 'var(--ow-admin)',
      },
      fontSize: {
        xs: '17px',
        sm: '18px',
        base: '19px',
        md: '20px',
        lg: '24px',
        xl: '26px',
        '2xl': '29px',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default config;
