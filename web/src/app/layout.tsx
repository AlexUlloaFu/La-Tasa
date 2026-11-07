import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

const sans = Instrument_Sans({
	subsets: ["latin"],
	variable: "--font-sans",
});

const display = Instrument_Serif({
	subsets: ["latin"],
	weight: "400",
	variable: "--font-display",
});

export const metadata: Metadata = {
	title: "La Tasa — CUP",
	description:
		"La Tasa: consulta de cambio informal CUP frente a USD, USDT, EUR y MLC.",
};

export default function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return (
		<html lang="es">
			<body className={`${sans.variable} ${display.variable}`}>{children}</body>
		</html>
	);
}
