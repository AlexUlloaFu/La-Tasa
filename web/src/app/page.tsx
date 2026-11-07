import { Logo } from "@/components/Logo";
import { RatesBoard } from "@/components/RatesBoard";

type CurrencyPair = {
	currency: "USD" | "ZELLE" | "USDT" | "EUR" | "MLC";
	buy: number;
	sell: number;
};

type RatesResponse = {
	base: "CUP";
	rates: CurrencyPair[];
	saldoMovil: Array<{
		amount: 120 | 240 | 360;
		buy: number;
		sell: number;
		change?: { buy: number; sell: number } | null;
	}> | null;
	updatedAt: string;
	sources: string[];
	provisional: boolean;
};

async function getRates(): Promise<RatesResponse | null> {
	const base = process.env.API_URL ?? "http://localhost:3124";
	try {
		const res = await fetch(`${base.replace(/\/$/, "")}/rates`, {
			cache: "no-store",
		});
		if (!res.ok) return null;
		return res.json();
	} catch {
		return null;
	}
}

export default async function Home() {
	const data = await getRates();

	return (
		<main
			style={{
				minHeight: "100dvh",
				display: "grid",
				placeItems: "center",
				padding: "clamp(1.5rem, 5vw, 3.5rem)",
			}}
		>
			<section
				style={{
					width: "min(640px, 100%)",
					animation: "rise 600ms ease both",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: "0.85rem",
						marginBottom: "0.55rem",
					}}
				>
					<Logo size={64} />
					<h1
						style={{
							fontFamily: "var(--font-display), serif",
							fontSize: "clamp(3.2rem, 12vw, 5rem)",
							fontWeight: 400,
							lineHeight: 0.92,
							letterSpacing: "-0.03em",
						}}
					>
						La Tasa
					</h1>
				</div>
				<p
					style={{
						color: "var(--muted)",
						fontSize: "0.95rem",
						lineHeight: 1.45,
						marginBottom: "2.5rem",
						maxWidth: "28rem",
					}}
				>
					CUP frente a USD, Zelle, USDT, EUR y MLC.
				</p>

				{data ? (
					<RatesBoard data={data} />
				) : (
					<p style={{ color: "var(--accent)" }}>
						No se pudo cargar la API. Arranca el backend en el puerto 3124.
					</p>
				)}
			</section>
		</main>
	);
}
