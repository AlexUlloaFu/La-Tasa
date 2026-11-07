import Image from "next/image";

type PriceChange = {
	buy: number;
	sell: number;
};

type CurrencyPair = {
	currency: "USD" | "ZELLE" | "USDT" | "BINANCE" | "EUR" | "MLC";
	buy: number;
	sell: number;
	change?: PriceChange | null;
};

type SaldoTier = {
	amount: 120 | 240 | 360;
	buy: number;
	sell: number;
	change?: PriceChange | null;
};

type RatesResponse = {
	base: "CUP";
	rates: CurrencyPair[];
	saldoMovil: SaldoTier[] | null;
	updatedAt: string;
	sources: string[];
	provisional: boolean;
};

const meta: Record<
	CurrencyPair["currency"],
	{ label: string; src: string; alt: string }
> = {
	USD: {
		label: "Dólar",
		src: "/currencies/usd.png",
		alt: "Bandera de Estados Unidos",
	},
	EUR: {
		label: "Euro",
		src: "/currencies/eur.png",
		alt: "Bandera de la Unión Europea",
	},
	MLC: {
		label: "Tarjeta",
		src: "/currencies/mlc.jpg",
		alt: "Tarjeta MLC",
	},
	BINANCE: {
		label: "USDT Binance",
		src: "/currencies/binance.svg",
		alt: "USDT Binance",
	},
	USDT: {
		label: "USDT Tether",
		src: "/currencies/usdt.svg",
		alt: "USDT Tether",
	},
	ZELLE: {
		label: "Zelle",
		src: "/currencies/zelle.svg",
		alt: "Zelle",
	},
};

function formatCup(n: number) {
	return new Intl.NumberFormat("es-CU", {
		maximumFractionDigits: 0,
	}).format(n);
}

function formatWhen(iso: string) {
	return new Intl.DateTimeFormat("es-CU", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(iso));
}

const RATE_ORDER: CurrencyPair["currency"][] = [
	"USD",
	"EUR",
	"MLC",
	"BINANCE",
	"USDT",
	"ZELLE",
];

export function RatesBoard({ data }: { data: RatesResponse }) {
	const rates = [...data.rates].sort(
		(a, b) => RATE_ORDER.indexOf(a.currency) - RATE_ORDER.indexOf(b.currency),
	);

	return (
		<div>
			<ul style={{ listStyle: "none", display: "grid", gap: 0 }}>
				{rates.map((rate, i) => {
					const m = meta[rate.currency];
					return (
						<li
							key={rate.currency}
							style={{
								display: "grid",
								gridTemplateColumns: "auto 1fr auto",
								alignItems: "center",
								gap: "1rem",
								padding: "1.05rem 0",
								borderTop: i === 0 ? "1px solid var(--line)" : undefined,
								borderBottom: "1px solid var(--line)",
								animation: `rise 600ms ease both ${100 + i * 80}ms`,
							}}
						>
							<div
								style={{
									width: 52,
									height: 36,
									borderRadius: 4,
									overflow: "hidden",
									background: "var(--bg-soft)",
									flexShrink: 0,
								}}
							>
								<Image
									src={m.src}
									alt={m.alt}
									width={104}
									height={72}
									unoptimized={m.src.endsWith(".svg")}
									style={{
										width: "100%",
										height: "100%",
										objectFit: m.src.endsWith(".svg") ? "contain" : "cover",
										display: "block",
									}}
								/>
							</div>

							<div style={{ minWidth: 0 }}>
								<div
									style={{
										fontFamily: "var(--font-display), serif",
										fontSize: "1.35rem",
										lineHeight: 1.1,
									}}
								>
									{m.label}
								</div>
							</div>

							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: "1.25rem",
									textAlign: "right",
								}}
							>
								<RateCell
									label="Compra"
									value={formatCup(rate.buy)}
									delta={rate.change?.buy}
								/>
								<RateCell
									label="Venta"
									value={formatCup(rate.sell)}
									delta={rate.change?.sell}
								/>
							</div>
						</li>
					);
				})}
			</ul>

			{data.saldoMovil && data.saldoMovil.length > 0 && (
				<section
					style={{
						marginTop: "2.75rem",
						animation: "rise 600ms ease both 280ms",
					}}
				>
					<h2
						style={{
							fontFamily: "var(--font-display), serif",
							fontSize: "1.65rem",
							fontWeight: 400,
							letterSpacing: "-0.02em",
							marginBottom: "0.35rem",
						}}
					>
						Saldo móvil
					</h2>
					<p
						style={{
							color: "var(--muted)",
							fontSize: "0.85rem",
							marginBottom: "1rem",
							lineHeight: 1.4,
						}}
					>
						Mercado informal — precio en CUP por paquete de saldo.
					</p>
					<table
						style={{
							width: "100%",
							borderCollapse: "collapse",
							fontVariantNumeric: "tabular-nums",
						}}
					>
						<thead>
							<tr>
								{["Paquete", "Compra", "Venta"].map((h) => (
									<th
										key={h}
										style={{
											textAlign: h === "Paquete" ? "left" : "right",
											fontSize: "0.68rem",
											letterSpacing: "0.06em",
											textTransform: "uppercase",
											color: "var(--muted)",
											fontWeight: 500,
											padding: "0.55rem 0",
											borderBottom: "1px solid var(--line)",
										}}
									>
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{data.saldoMovil.map((tier) => (
								<tr key={tier.amount}>
									<td
										style={{
											padding: "1rem 0",
											borderBottom: "1px solid var(--line)",
											fontFamily: "var(--font-display), serif",
											fontSize: "1.2rem",
										}}
									>
										{tier.amount}
										<span
											style={{
												marginLeft: "0.35rem",
												fontSize: "0.75rem",
												color: "var(--muted)",
												fontFamily: "var(--font-sans), system-ui, sans-serif",
											}}
										>
											CUP saldo
										</span>
									</td>
									<td
										style={{
											padding: "1rem 0",
											borderBottom: "1px solid var(--line)",
											textAlign: "right",
										}}
									>
										<PriceWithDelta
											value={formatCup(tier.buy)}
											delta={tier.change?.buy}
										/>
									</td>
									<td
										style={{
											padding: "1rem 0",
											borderBottom: "1px solid var(--line)",
											textAlign: "right",
										}}
									>
										<PriceWithDelta
											value={formatCup(tier.sell)}
											delta={tier.change?.sell}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}

			<footer
				style={{
					marginTop: "1.5rem",
					color: "var(--muted)",
					fontSize: "0.78rem",
					display: "flex",
					flexWrap: "wrap",
					gap: "0.65rem 1.1rem",
					animation: "rise 600ms ease both 360ms",
				}}
			>
				<span>Actualizado {formatWhen(data.updatedAt)}</span>
				{data.provisional && <span>provisional</span>}
				{(data.sources ?? []).map((s) => (
					<a
						key={s}
						href={`https://t.me/${s}`}
						target="_blank"
						rel="noreferrer"
					>
						@{s}
					</a>
				))}
			</footer>
		</div>
	);
}

function RateCell({
	label,
	value,
	delta,
}: {
	label: string;
	value: string;
	delta?: number | null;
}) {
	return (
		<div>
			<div
				style={{
					fontSize: "0.68rem",
					letterSpacing: "0.05em",
					textTransform: "uppercase",
					color: "var(--muted)",
					marginBottom: "0.2rem",
				}}
			>
				{label}
			</div>
			<PriceWithDelta value={value} delta={delta} />
		</div>
	);
}

function PriceWithDelta({
	value,
	delta,
}: {
	value: string;
	delta?: number | null;
}) {
	return (
		<div
			style={{
				display: "inline-flex",
				flexDirection: "column",
				alignItems: "flex-end",
				gap: "0.2rem",
			}}
		>
			<span
				style={{
					fontFamily: "var(--font-display), serif",
					fontSize: "clamp(1.35rem, 3.5vw, 1.7rem)",
					lineHeight: 1,
					letterSpacing: "-0.02em",
					color: "var(--accent)",
				}}
			>
				{value}
			</span>
			<DeltaBadge delta={delta} />
		</div>
	);
}

function DeltaBadge({ delta }: { delta?: number | null }) {
	if (delta == null || delta === 0) return null;

	const up = delta > 0;
	const color = up ? "var(--up)" : "var(--down)";
	const arrow = up ? "▲" : "▼";
	const amount = new Intl.NumberFormat("es-CU", {
		maximumFractionDigits: 0,
	}).format(Math.abs(delta));

	return (
		<span
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: "0.2rem",
				fontSize: "0.78rem",
				fontWeight: 600,
				color,
				letterSpacing: "0.01em",
			}}
			title={
				up
					? "Subió respecto a la pasada anterior"
					: "Bajó respecto a la pasada anterior"
			}
		>
			<span aria-hidden>{arrow}</span>
			<span>{amount}</span>
		</span>
	);
}
