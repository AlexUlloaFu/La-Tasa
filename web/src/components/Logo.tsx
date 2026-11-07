/** Marca: taza ↔ tasa */
export function Logo({ size = 56 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 64 64"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden
			style={{ flexShrink: 0, display: "block" }}
		>
			{/* vapor */}
			<path
				className="steam steam-a"
				d="M22 14c0-3 3-5 3-8"
				stroke="var(--accent)"
				strokeWidth="2.2"
				strokeLinecap="round"
				opacity="0.55"
			/>
			<path
				className="steam steam-b"
				d="M30 12c0-3.5 3.5-5.5 3.5-9"
				stroke="var(--accent)"
				strokeWidth="2.2"
				strokeLinecap="round"
				opacity="0.7"
			/>
			<path
				className="steam steam-c"
				d="M38 14c0-3 3-5 3-8"
				stroke="var(--accent)"
				strokeWidth="2.2"
				strokeLinecap="round"
				opacity="0.45"
			/>
			{/* taza */}
			<path d="M16 24h28c0 14-4 26-14 26S16 38 16 24Z" fill="var(--accent)" />
			<path
				d="M44 28h5.5a7.5 7.5 0 0 1 0 15H42"
				stroke="var(--accent)"
				strokeWidth="3.2"
				strokeLinecap="round"
				strokeLinejoin="round"
				fill="none"
			/>
			{/* líquido */}
			<ellipse cx="30" cy="26" rx="11" ry="3.2" fill="#f4f3ef" opacity="0.35" />
			{/* plato */}
			<path
				d="M14 52h32c1.5 3.5-2 5-16 5s-17.5-1.5-16-5Z"
				fill="var(--accent)"
				opacity="0.85"
			/>
		</svg>
	);
}
