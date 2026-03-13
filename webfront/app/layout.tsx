import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatRecept — AI Receptionist for WhatsApp & Telegram",
  description:
    "Deploy an AI receptionist that handles customer inquiries on WhatsApp and Telegram 24/7. Join the waitlist for exclusive early access.",
  openGraph: {
    title: "ChatRecept — AI Receptionist for WhatsApp & Telegram",
    description: "AI-powered customer messaging automation. Coming soon.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
