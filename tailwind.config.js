/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
		'./app/**/*.{ts,tsx}',
		'./src/**/*.{ts,tsx}',
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px',
			},
		},
		screens: {
			'sm': '640px',
			'md': '768px',
			'lg': '1024px',
			'xl': '1280px',
			'2xl': '1536px',
			'3xl': '1920px',
			'4xl': '2560px',
			'5xl': '3840px',
		},
		extend: {
			fontFamily: {
				sans: ['Inter', 'sans-serif'],
				mono: ['JetBrains Mono', 'monospace'],
			},
			fontSize: {
				'xs': ['clamp(0.65rem, 0.6rem + 0.2vw, 0.95rem)', { lineHeight: '1.5' }],
				'sm': ['clamp(0.75rem, 0.7rem + 0.2vw, 1.05rem)', { lineHeight: '1.5' }],
				'base': ['clamp(0.875rem, 0.8rem + 0.25vw, 1.2rem)', { lineHeight: '1.6' }],
				'lg': ['clamp(1rem, 0.95rem + 0.3vw, 1.5rem)', { lineHeight: '1.6' }],
				'xl': ['clamp(1.125rem, 1.05rem + 0.35vw, 1.75rem)', { lineHeight: '1.5' }],
				'2xl': ['clamp(1.25rem, 1.15rem + 0.5vw, 2rem)', { lineHeight: '1.4' }],
				'3xl': ['clamp(1.5rem, 1.35rem + 0.6vw, 2.5rem)', { lineHeight: '1.3' }],
			},
			spacing: {
				'fluid-xs': 'clamp(0.25rem, 0.2rem + 0.2vw, 0.5rem)',
				'fluid-sm': 'clamp(0.5rem, 0.45rem + 0.25vw, 0.85rem)',
				'fluid-md': 'clamp(0.75rem, 0.65rem + 0.35vw, 1.25rem)',
				'fluid-lg': 'clamp(1rem, 0.9rem + 0.5vw, 1.75rem)',
				'fluid-xl': 'clamp(1.5rem, 1.3rem + 0.75vw, 2.5rem)',
				'fluid-2xl': 'clamp(2rem, 1.7rem + 1vw, 3.5rem)',
				'fluid-3xl': 'clamp(3rem, 2.5rem + 1.5vw, 5rem)',
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: '#22c55e',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: '#4A90E2',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				accent: {
					DEFAULT: '#F5A623',
					foreground: 'hsl(var(--accent-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: 0 },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: 0 },
				},
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
}