"use client";

import { useState } from "react";
import Image from "next/image";
import WebChatBubble from "@/components/WebChatBubble";

/* ── Material Symbol helper ─────────────────────────────────────────────── */
function Icon({
  name,
  size = 24,
  fill = 0,
  className = "",
}: {
  name: string;
  size?: number;
  fill?: 0 | 1;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${fill}, 'wght' 400, 'GRAD' 0, 'opsz' ${size}`,
      }}
    >
      {name}
    </span>
  );
}

/* ── Data ───────────────────────────────────────────────────────────────── */
const BENEFITS = [
  "Free website via WebsiteBot on Telegram — instant",
  "3 months free on any paid plan",
  "Founder pricing — locked in forever",
  "Priority onboarding via Telegram",
  "Direct input into the product roadmap",
];

/* ── Input component ────────────────────────────────────────────────────── */
function Input({
  label,
  required,
  prefix,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  required?: boolean;
  prefix?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 text-[#425d7f]">
        {label}{" "}
        {required ? (
          <span className="text-primary">*</span>
        ) : (
          <span className="text-[#94afd5]">(optional)</span>
        )}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-primary select-none">
            {prefix}
          </span>
        )}
        <input
          {...props}
          onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
          onBlur={(e)  => { setFocused(false); props.onBlur?.(e); }}
          className={`w-full ${prefix ? "pl-8" : "px-4"} pr-4 py-3 rounded-xl text-[#12304f] text-sm outline-none transition-all placeholder:text-[#94afd5] bg-[#eaf1ff]`}
          style={{ border: `1.5px solid ${focused ? "#006092" : "#94afd5"}` }}
        />
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function ComingSoonPage() {
  const [form, setForm] = useState({ name: "", email: "", telegram: "", whatsapp: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong");
      }
      setStatus("success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Please try again.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f3f6ff]">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md shadow-[0_32px_64px_-15px_rgba(18,48,79,0.06)]">
        <nav className="flex justify-between items-center w-full px-6 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <Icon name="forum" className="text-primary" size={26} />
            <span
              className="text-2xl font-extrabold tracking-tight"
              style={{
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                background: "linear-gradient(135deg, #006092 0%, #4db0f7 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              ChatRecept
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full animate-pulse bg-whatsapp" />
              <span className="text-xs font-medium text-[#5e799c]">Now Live</span>
            </span>
            <a
              href="#signup"
              className="px-5 py-2.5 rounded-full font-bold text-sm text-white shadow-lg hover:scale-105 active:scale-95 transition-all duration-200"
              style={{ background: "linear-gradient(135deg, #006092 0%, #4db0f7 100%)" }}
            >
              Get Started
            </a>
          </div>
        </nav>
      </header>

      {/* ── WebsiteBot announcement banner ───────────────────────────────── */}
      <div className="max-w-7xl mx-auto w-full px-6 pt-5 pb-2">
        <a
          href="https://t.me/ChatReceptWebBot"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 rounded-xl px-5 py-3 hover:opacity-90 transition-opacity"
          style={{ background: "rgba(0,96,146,0.06)", border: "1px solid rgba(0,96,146,0.18)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full animate-pulse bg-[#4db0f7]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#4db0f7]">New</span>
            </span>
            <span className="text-sm font-medium text-[#12304f] truncate">
              WebsiteBot is live — generate your business website free on Telegram
            </span>
          </div>
          <span className="text-xs font-bold text-primary shrink-0">Try it →</span>
        </a>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-14 pb-24 px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left copy */}
          <div className="relative z-10">
            {/* Platform badge */}
            <div
              className="inline-flex items-center gap-3 px-4 py-2 rounded-full mb-8"
              style={{ background: "#dce9ff" }}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-whatsapp">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.11 1.522 5.836L.057 23.927c-.07.388.261.718.648.648l6.092-1.465A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.96 9.96 0 0 1-5.073-1.38l-.363-.214-3.763.905.924-3.757-.234-.376A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
                WhatsApp
              </span>
              <span className="text-[#94afd5]">·</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-telegram">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.01 9.476c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 13.887l-2.94-.918c-.64-.203-.653-.64.136-.948l11.49-4.43c.535-.194 1.003.13.615.657z" />
                </svg>
                Telegram
              </span>
              <span className="text-[#94afd5]">·</span>
              <span className="text-xs font-medium text-[#425d7f]">AI Receptionist</span>
            </div>

            <h1
              className="text-5xl md:text-6xl lg:text-[3.75rem] font-extrabold tracking-tight text-[#12304f] leading-[1.1] mb-6"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Your business never<br />
              <span className="gradient-text">stops talking</span>
            </h1>

            <p className="text-xl text-[#425d7f] leading-relaxed max-w-xl mb-10">
              An AI that handles every WhatsApp and Telegram inquiry automatically — while you focus on what matters.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <a
                href="#signup"
                className="inline-flex items-center justify-center px-8 py-4 rounded-xl font-bold text-white text-base shadow-xl hover:scale-105 active:scale-95 transition-all"
                style={{ background: "linear-gradient(135deg, #006092 0%, #4db0f7 100%)" }}
              >
                Claim Early Access →
              </a>
              <a
                href="https://t.me/ChatReceptWebBot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-primary text-base bg-[#eaf1ff] hover:bg-[#dce9ff] transition-all"
              >
                <Icon name="smart_toy" size={20} />
                Try WebsiteBot
              </a>
            </div>
          </div>

          {/* Right: chat illustration with photo background */}
          <div className="relative">
            <div className="absolute -top-20 -right-20 w-96 h-96 rounded-full blur-[100px]" style={{ background: "rgba(0,96,146,0.09)" }} />
            <div className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full blur-[100px]" style={{ background: "rgba(37,211,102,0.07)" }} />
            <div className="relative rounded-[3rem] shadow-[0_48px_100px_rgba(18,48,79,0.1)] border border-white/40 overflow-hidden">
              {/* Photo background layer */}
              <div className="absolute inset-0">
                <Image
                  src="https://images.unsplash.com/photo-1556745757-8d76bdb6984b?w=900&h=700&auto=format&fit=crop&q=80"
                  alt="Business owner using messaging apps on phone"
                  fill
                  sizes="(max-width:1024px) 100vw, 50vw"
                  className="object-cover"
                />
                {/* Dark overlay for chat readability */}
                <div className="absolute inset-0 bg-[rgba(18,48,79,0.6)]" />
              </div>
              {/* Chat UI floats above photo */}
              <div className="relative z-10 p-8 flex flex-col gap-5">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="p-4 rounded-2xl rounded-br-sm max-w-[80%] shadow-sm" style={{ background: "linear-gradient(135deg, #006092, #005480)" }}>
                    <p className="text-white font-medium text-sm">Build a website for my café ☕</p>
                    <span className="text-[10px] uppercase tracking-widest opacity-60 mt-1.5 block text-right text-white">just now</span>
                  </div>
                </div>
                {/* Bot: generating */}
                <div className="flex items-end gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 border-white/30 shadow-md"
                    style={{ background: "linear-gradient(135deg, #25D366, #229ED9)" }}
                  >
                    <Icon name="smart_toy" className="text-white" size={18} fill={1} />
                  </div>
                  <div className="bg-white/15 backdrop-blur-sm p-4 rounded-2xl rounded-bl-sm max-w-[80%] shadow-sm border border-white/20">
                    <p className="font-medium text-sm text-white">Generating your site... 🚀</p>
                    <span className="text-[10px] uppercase tracking-widest text-white/60 mt-1.5 block">now</span>
                  </div>
                </div>
                {/* Bot: site ready */}
                <div className="flex items-end gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 border-white/30 shadow-md"
                    style={{ background: "linear-gradient(135deg, #25D366, #229ED9)" }}
                  >
                    <Icon name="smart_toy" className="text-white" size={18} fill={1} />
                  </div>
                  <div className="bg-white/15 backdrop-blur-sm p-4 rounded-2xl rounded-bl-sm max-w-[80%] shadow-sm border border-white/20">
                    <p className="font-medium text-sm text-white">Your site is live! Share the link with your customers.</p>
                    <div className="mt-2 px-3 py-1.5 rounded-lg text-xs font-mono text-white/70 bg-white/10">
                      chatrecept.chat/w/my-café
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-white/60 mt-1.5 block">just now</span>
                  </div>
                </div>
              </div>
              {/* Floating badge */}
              <div className="absolute -right-6 top-1/3 z-20 bg-white px-3 py-2 rounded-2xl shadow-xl flex items-center gap-2">
                <Icon name="bolt" className="text-whatsapp" size={20} fill={1} />
                <span className="text-xs font-bold text-primary">Instant</span>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── Social Proof ─────────────────────────────────────────────────── */}
      <section className="py-20 px-6 bg-[#f8f7f3]">
        <div className="max-w-7xl mx-auto">
          <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-[#5e799c] mb-12">
            Built for businesses like yours
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Café */}
            <div className="group relative rounded-3xl overflow-hidden aspect-[4/3] shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <Image
                src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=600&h=400&auto=format&fit=crop&q=80"
                alt="Cafe counter with staff serving customers"
                fill
                sizes="(max-width:768px) 100vw, 33vw"
                className="object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#003655]/80 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold text-white uppercase tracking-wider mb-2">
                  <Icon name="storefront" size={12} className="text-white" />
                  Café &amp; Restaurant
                </span>
                <p className="text-white font-semibold text-sm leading-snug">
                  Used by cafés handling 200+ chats daily
                </p>
              </div>
            </div>

            {/* Retail */}
            <div className="group relative rounded-3xl overflow-hidden aspect-[4/3] shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <Image
                src="https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=600&h=400&auto=format&fit=crop&q=80"
                alt="Retail shop owner assisting customer at counter"
                fill
                sizes="(max-width:768px) 100vw, 33vw"
                className="object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#003655]/80 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold text-white uppercase tracking-wider mb-2">
                  <Icon name="shopping_bag" size={12} className="text-white" />
                  Retail &amp; Services
                </span>
                <p className="text-white font-semibold text-sm leading-snug">
                  Retail stores automating walk-in + WhatsApp
                </p>
              </div>
            </div>

            {/* Office */}
            <div className="group relative rounded-3xl overflow-hidden aspect-[4/3] shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300">
              <Image
                src="https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&h=400&auto=format&fit=crop&q=80"
                alt="Modern office team collaborating at workstations"
                fill
                sizes="(max-width:768px) 100vw, 33vw"
                className="object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#003655]/80 via-transparent to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <span className="inline-flex items-center gap-1.5 bg-white/15 backdrop-blur-sm px-2.5 py-1 rounded-full text-[10px] font-semibold text-white uppercase tracking-wider mb-2">
                  <Icon name="business" size={12} className="text-white" />
                  Agencies &amp; Teams
                </span>
                <p className="text-white font-semibold text-sm leading-snug">
                  Agencies managing multi-client conversations
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Features bento ───────────────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2
              className="text-4xl md:text-5xl font-black tracking-tight text-[#12304f] mb-4"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Everything you need
            </h2>
            <p className="text-[#425d7f] text-lg">One platform, every channel, zero missed opportunities.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Always On — wide */}
            <div className="md:col-span-2 group bg-[#f8f7f3] p-10 rounded-[2.5rem] relative overflow-hidden hover:bg-[#f1efe8] transition-colors duration-500">
              {/* Right-half photo accent */}
              <div className="absolute right-0 top-0 bottom-0 w-2/5 overflow-hidden rounded-r-[2.5rem]">
                <Image
                  src="https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=600&h=500&auto=format&fit=crop&q=80"
                  alt="Person using phone for business messaging"
                  fill
                  sizes="(max-width:768px) 0vw, 20vw"
                  className="object-cover opacity-30 group-hover:opacity-40 transition-opacity duration-500"
                />
                {/* Warm fade mask — blends photo into card background */}
                <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(248,247,243,1) 0%, rgba(248,247,243,0) 50%)" }} />
              </div>
              <div className="relative z-10">
                <div className="w-14 h-14 bg-[#e8e6de] rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform">
                  <Icon name="verified_user" className="text-primary" size={28} />
                </div>
                <h3 className="text-3xl font-bold mb-4 text-[#12304f]">Always On</h3>
                <p className="text-[#425d7f] text-lg max-w-md">AI handles every inquiry 24/7 — no missed leads, no waiting customers.</p>
              </div>
              <div className="absolute right-0 bottom-0 opacity-[0.07] group-hover:opacity-[0.12] transition-opacity">
                <Icon name="all_inclusive" className="text-primary" size={200} />
              </div>
            </div>

            {/* WhatsApp + Telegram */}
            <div
              className="p-10 rounded-[2.5rem] flex flex-col justify-between relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #006092, #005480)" }}
            >
              {/* Photo texture */}
              <div className="absolute inset-0">
                <Image
                  src="https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=500&h=500&auto=format&fit=crop&q=80"
                  alt="Phone showing chat messaging apps"
                  fill
                  sizes="(max-width:768px) 100vw, 33vw"
                  className="object-cover opacity-20"
                />
              </div>
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-8" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <Icon name="forum" className="text-white" size={28} />
                </div>
                <h3 className="text-3xl font-bold mb-4 text-white">WhatsApp + Telegram</h3>
                <p className="text-white/80 text-lg">One AI, two platforms. Meet customers where they already are.</p>
              </div>
              <div className="relative z-10 mt-8 flex justify-end">
                <Icon name="connect_without_contact" className="text-white opacity-30" size={64} />
              </div>
            </div>

            {/* Smart Lead Detection */}
            <div
              className="p-10 rounded-[2.5rem]"
              style={{ background: "linear-gradient(135deg, #006a2e, #005d27)" }}
            >
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-8" style={{ background: "rgba(255,255,255,0.15)" }}>
                <Icon name="trending_up" className="text-white" size={28} />
              </div>
              <h3 className="text-3xl font-bold mb-4 text-white">Smart Lead Detection</h3>
              <p className="text-white/80 text-lg">AI scores and captures leads automatically. Your dashboard, always updated.</p>
            </div>

            {/* Full Dashboard — wide */}
            <div className="md:col-span-2 p-10 rounded-[2.5rem] flex flex-col md:flex-row gap-8 items-center" style={{ background: "#dce9ff" }}>
              <div className="flex-1">
                <h3 className="text-3xl font-bold mb-4 text-primary" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Full Dashboard</h3>
                <p className="text-[#425d7f] text-lg">Conversations, leads, analytics, and billing — all in one place.</p>
              </div>
              <div className="flex-1 flex gap-4">
                <div className="w-full h-28 bg-white rounded-3xl shadow-sm flex items-center justify-center">
                  <Icon name="laptop" className="text-[#4db0f7]" size={40} />
                </div>
                <div className="w-full h-28 bg-white rounded-3xl shadow-sm flex items-center justify-center">
                  <Icon name="smartphone" className="text-primary" size={40} />
                </div>
              </div>
            </div>

            {/* WebsiteBot — full width */}
            <div
              className="md:col-span-3 group p-10 rounded-[2.5rem] relative overflow-hidden flex flex-col md:flex-row items-center gap-8"
              style={{ background: "rgba(77,176,247,0.08)", border: "1.5px solid rgba(0,96,146,0.18)" }}
            >
              <div className="flex-1 relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #006092, #4db0f7)" }}
                  >
                    <Icon name="web" className="text-white" size={28} />
                  </div>
                  <span
                    className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
                    style={{ background: "rgba(0,96,146,0.1)", color: "#006092" }}
                  >
                    Live Now
                  </span>
                </div>
                <h3 className="text-3xl font-bold mb-4 text-[#12304f]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  WebsiteBot
                </h3>
                <p className="text-[#425d7f] text-lg max-w-xl">
                  Generate a live business website in seconds — straight from Telegram. No design skills needed.
                </p>
              </div>
              <div className="shrink-0">
                <a
                  href="https://t.me/ChatReceptWebBot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-white hover:scale-105 active:scale-95 transition-all shadow-lg"
                  style={{ background: "linear-gradient(135deg, #006092, #4db0f7)" }}
                >
                  <Icon name="open_in_new" className="text-white" size={18} />
                  Try on Telegram
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── CTA + Signup ─────────────────────────────────────────────────── */}
      <section id="signup" className="py-24 px-6">
        <div
          className="max-w-7xl mx-auto rounded-[4rem] p-12 md:p-16 relative overflow-hidden"
          style={{ background: "linear-gradient(135deg, #006092 0%, #003655 100%)" }}
        >
          {/* Photo texture — blurred, purely decorative */}
          <div className="absolute inset-0">
            <Image
              src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=1400&h=700&auto=format&fit=crop&q=80"
              alt=""
              fill
              sizes="100vw"
              className="object-cover opacity-15 blur-sm scale-105 will-change-transform"
            />
          </div>
          {/* Glow orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[120px]" style={{ background: "rgba(77,176,247,0.25)" }} />
            <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[120px]" style={{ background: "rgba(37,211,102,0.15)" }} />
          </div>

          <div className="relative z-10 grid md:grid-cols-2 gap-12 items-start">

            {/* Left: heading + benefits */}
            <div>
              <span
                className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6"
                style={{ background: "rgba(93,253,138,0.15)", color: "#5dfd8a" }}
              >
                Founding Member Benefits
              </span>
              <h2
                className="text-4xl md:text-5xl font-black text-white mb-4 leading-tight"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Try ChatRecept<br />WebsiteBot free
              </h2>
              <p className="text-white/70 text-lg mb-10">
                Register to get free credits and generate your business website instantly on Telegram — no design skills needed.
              </p>
              <div className="space-y-4">
                {BENEFITS.map((b) => (
                  <div key={b} className="flex items-start gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                      style={{ background: "rgba(93,253,138,0.2)" }}
                    >
                      <Icon name="check" className="text-[#5dfd8a]" size={16} />
                    </div>
                    <span className="text-white/80 text-sm">{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: signup form (white card) */}
            <div
              className="rounded-3xl p-8"
              style={{ background: "rgba(255,255,255,0.97)", boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}
            >
              {status === "success" ? (
                <div className="text-center py-8">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                    style={{ background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)" }}
                  >
                    <Icon name="check_circle" className="text-whatsapp" size={32} fill={1} />
                  </div>
                  <h3 className="text-xl font-bold text-[#12304f] mb-2">You&apos;re in!</h3>
                  <p className="text-sm text-[#425d7f] leading-relaxed">
                    We&apos;ll reach out with your exclusive early access benefits. Watch your inbox.
                  </p>
                </div>
              ) : (
                <>
                  <h3
                    className="text-xl font-bold text-[#12304f] mb-1"
                    style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                  >
                    Get early access
                  </h3>
                  <p className="text-sm text-[#5e799c] mb-6">
                    Founding members get exclusive benefits — free months, locked pricing, and direct access to the team.
                  </p>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                      label="Your name" required type="text" placeholder="Jane Smith"
                      value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                    <Input
                      label="Email" required type="email" placeholder="you@company.com"
                      value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                    <Input
                      label="Telegram handle" type="text" prefix="@" placeholder="yourhandle"
                      value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                    />
                    <Input
                      label="WhatsApp number" type="tel" prefix="+" placeholder="60123456789"
                      value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                    />
                    {errorMsg && (
                      <p className="text-sm px-1 text-red-500">{errorMsg}</p>
                    )}
                    <button
                      type="submit"
                      disabled={status === "loading" || !form.name || !form.email}
                      className="w-full py-3.5 rounded-xl font-bold text-white text-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg, #006092 0%, #4db0f7 100%)", boxShadow: "0 8px 24px rgba(0,96,146,0.25)" }}
                    >
                      {status === "loading" ? "Joining…" : "Claim Early Access →"}
                    </button>
                    <p className="text-xs text-center text-[#94afd5]">
                      No spam. No credit card. Unsubscribe anytime.
                    </p>
                  </form>
                </>
              )}
            </div>

          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-[#f3f6ff] rounded-t-[3rem] mt-4">
        <div className="flex flex-col md:flex-row justify-between items-center w-full px-10 py-12 gap-6 max-w-7xl mx-auto">
          <div className="flex flex-col items-center md:items-start gap-3">
            <div className="flex items-center gap-2">
              <Icon name="forum" className="text-primary" size={22} />
              <span
                className="font-extrabold text-primary text-xl"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                ChatRecept
              </span>
            </div>
            <p className="text-sm text-[#12304f]/60">
              © {new Date().getFullYear()} ChatRecept · AI-powered messaging automation
            </p>
          </div>
          <a
            href="/terms"
            className="text-sm text-[#12304f]/60 hover:text-primary underline decoration-[#5dfd8a] decoration-2 underline-offset-4 transition-colors"
          >
            Terms &amp; Conditions
          </a>
        </div>
      </footer>

      <WebChatBubble />
    </main>
  );
}
