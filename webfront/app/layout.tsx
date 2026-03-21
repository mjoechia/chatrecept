import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatRecept — AI Receptionist for WhatsApp & Telegram",
  description:
    "Deploy an AI receptionist that handles customer inquiries on WhatsApp and Telegram 24/7. Join the waitlist for exclusive early access.",
  openGraph: {
    title: "ChatRecept — AI Receptionist for WhatsApp & Telegram",
    description: "AI-powered customer messaging automation. Now live.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
