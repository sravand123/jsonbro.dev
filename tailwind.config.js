/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: ['./index.html', './src/**/*.{ts,tsx}'],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: { '2xl': '1400px' },
		},
		screens: {
			xs: '480px',
			sm: '640px',
			md: '768px',
			lg: '1024px',
			xl: '1280px',
			'2xl': '1536px',
			'3xl': '1920px',
		},
		extend: {
			fontFamily: {
				sans: [
					'Inter',
					'-apple-system',
					'BlinkMacSystemFont',
					'Segoe UI',
					'system-ui',
					'sans-serif',
				],
				mono: [
					'JetBrains Mono',
					'SF Mono',
					'Menlo',
					'Monaco',
					'Consolas',
					'Liberation Mono',
					'monospace',
				],
			},
			/*
			  Chrome type scale, in rem so it tracks the root font size.

			  Everything outside the code editor is expressed with these steps; the
			  root size then moves in discrete jumps per display class (see
			  src/index.css), which keeps the interface proportional from a small
			  laptop to a 4K desktop instead of shrinking into it.
			*/
			fontSize: {
				'3xs': ['0.625rem', { lineHeight: '0.875rem' }],
				'2xs': ['0.6875rem', { lineHeight: '1rem' }],
				xs: ['0.75rem', { lineHeight: '1.0625rem' }],
				sm: ['0.8125rem', { lineHeight: '1.1875rem' }],
				base: ['0.875rem', { lineHeight: '1.3125rem' }],
				lg: ['1rem', { lineHeight: '1.5rem' }],
				xl: ['1.125rem', { lineHeight: '1.625rem' }],
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				surface: {
					DEFAULT: 'hsl(var(--surface))',
					raised: 'hsl(var(--surface-raised))',
				},
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))',
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))',
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))',
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))',
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))',
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))',
				},
				success: {
					DEFAULT: 'hsl(var(--success))',
					foreground: 'hsl(var(--success-foreground))',
				},
				warning: {
					DEFAULT: 'hsl(var(--warning))',
					foreground: 'hsl(var(--warning-foreground))',
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))',
				},
				info: {
					DEFAULT: 'hsl(var(--info))',
					foreground: 'hsl(var(--info-foreground))',
				},
				diff: {
					added: 'hsl(var(--diff-added))',
					removed: 'hsl(var(--diff-removed))',
				},
				json: {
					key: 'hsl(var(--json-key))',
					string: 'hsl(var(--json-string))',
					number: 'hsl(var(--json-number))',
					boolean: 'hsl(var(--json-boolean))',
					null: 'hsl(var(--json-null))',
					punctuation: 'hsl(var(--json-punctuation))',
				},
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)',
			},
			spacing: {
				topbar: 'var(--topbar-height)',
				statusbar: 'var(--statusbar-height)',
				rail: 'var(--rail-width)',
			},
			transitionTimingFunction: {
				out: 'var(--ease-out)',
				'in-out': 'var(--ease-in-out)',
			},
			transitionDuration: {
				instant: 'var(--duration-instant)',
				fast: 'var(--duration-fast)',
				normal: 'var(--duration-normal)',
				slow: 'var(--duration-slow)',
			},
			boxShadow: {
				panel: '0 1px 2px 0 hsl(220 40% 4% / 0.06), 0 8px 24px -12px hsl(220 40% 4% / 0.18)',
				overlay: '0 12px 40px -12px hsl(220 40% 4% / 0.35)',
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' },
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' },
				},
				'fade-in': {
					from: { opacity: '0' },
					to: { opacity: '1' },
				},
				'slide-up': {
					from: { opacity: '0', transform: 'translateY(6px)' },
					to: { opacity: '1', transform: 'translateY(0)' },
				},
				/*
				  A single glow that draws the eye to a control which has just appeared, then
				  stops. Deliberately not a loop: a document is invalid for most of the time you
				  are typing in it, so a pulsing button would be permanently competing with the
				  code for attention. Rings rather than movement, so nothing shifts position.
				*/
				attention: {
					'0%, 100%': { boxShadow: '0 0 0 0 hsl(var(--warning) / 0)' },
					'50%': { boxShadow: '0 0 0 0.3rem hsl(var(--warning) / 0.35)' },
				},
				'slide-down': {
					from: { opacity: '0', transform: 'translateY(-6px)' },
					to: { opacity: '1', transform: 'translateY(0)' },
				},
				'scale-in': {
					from: { opacity: '0', transform: 'scale(0.96) translateY(-4px)' },
					to: { opacity: '1', transform: 'scale(1) translateY(0)' },
				},
				/*
				  Centred dialogs keep their -50%/-50% translate inside the keyframes.
				  Animating a bare `scale()` would replace the centering transform for
				  the duration of the animation, so the dialog appeared below and right
				  of centre and then snapped into place.
				*/
				'dialog-in': {
					from: { opacity: '0', transform: 'translate(-50%, -50%) scale(0.96)' },
					to: { opacity: '1', transform: 'translate(-50%, -50%) scale(1)' },
				},
				'slide-in-right': {
					from: { opacity: '0', transform: 'translateX(12px)' },
					to: { opacity: '1', transform: 'translateX(0)' },
				},
			},
			animation: {
				'accordion-down': 'accordion-down var(--duration-normal) var(--ease-out)',
				'accordion-up': 'accordion-up var(--duration-normal) var(--ease-out)',
				'fade-in': 'fade-in var(--duration-fast) var(--ease-out)',
				'slide-up': 'slide-up var(--duration-normal) var(--ease-out)',
				'slide-down': 'slide-down var(--duration-normal) var(--ease-out)',
				'scale-in': 'scale-in var(--duration-normal) var(--ease-out)',
				'dialog-in': 'dialog-in var(--duration-normal) var(--ease-out)',
				'slide-in-right': 'slide-in-right var(--duration-normal) var(--ease-out)',
				attention: 'attention 900ms var(--ease-out) 2',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
}
