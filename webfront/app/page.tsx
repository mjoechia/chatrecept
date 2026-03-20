"use client";

import { useState } from "react";

const FEATURES: { icon: React.ReactNode; title: string; desc: string; highlight?: boolean }[] = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Always On",
    desc: "AI handles every inquiry 24/7 — no missed leads, no waiting customers.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    title: "WhatsApp + Telegram",
    desc: "One AI, two platforms. Meet customers where they already are.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Smart Lead Detection",
    desc: "AI scores and captures leads automatically. Your dashboard, always updated.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: "Full Dashboard",
    desc: "Conversations, leads, analytics, and billing — all in one place.",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
    title: "WebsiteBot",
    desc: "Generate a live business website in seconds — straight from Telegram. No design skills needed.",
    highlight: true,
  },
];

const BENEFITS = [
  "Free website via WebsiteBot on Telegram — instant",
  "3 months free on any paid plan",
  "Founder pricing — locked in forever",
  "Priority onboarding via Telegram",
  "Direct input into the product roadmap",
];

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
      <label className="block text-xs font-medium mb-1.5" style={{ color: "#9CA3AF" }}>
        {label}{" "}
        {required ? (
          <span style={{ color: "#25D366" }}>*</span>
        ) : (
          <span style={{ color: "#4B5563" }}>(optional)</span>
        )}
      </label>
      <div className="relative">
        {prefix && (
          <span
            className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium select-none"
            style={{ color: "#229ED9" }}
          >
            {prefix}
          </span>
        )}
        <input
          {...props}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          className={`w-full ${prefix ? "pl-8" : "px-4"} pr-4 py-3 rounded-xl text-white text-sm outline-none transition-all placeholder:text-gray-600`}
          style={{
            background: "rgba(55, 65, 81, 0.5)",
            border: `1px solid ${focused ? "#229ED9" : "rgba(75, 85, 99, 0.5)"}`,
          }}
        />
      </div>
    </div>
  );
}

export default function ComingSoonPage() {
  const [form, setForm] = useState({ name: "", email: "", telegram: "", whatsapp: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
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
    <main className="min-h-screen bg-graphite flex flex-col">

      {/* ── Background glow orbs ─────────────────────────────── */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.07] animate-pulse-slow"
          style={{ background: "radial-gradient(circle, #229ED9, transparent)" }} />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.07] animate-pulse-slow"
          style={{ background: "radial-gradient(circle, #25D366, transparent)", animationDelay: "2.5s" }} />
      </div>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #25D366 0%, #229ED9 100%)" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-bold text-white text-lg tracking-tight">ChatRecept</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#25D366" }} />
          <span className="text-xs font-medium" style={{ color: "#6B7280" }}>Now Live</span>
        </div>
      </nav>

      {/* ── WebsiteBot announcement banner ───────────────────── */}
      <div className="relative z-10 max-w-5xl mx-auto w-full px-6 pb-2">
        <a
          href="https://t.me/ChatReceptWebBot"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between gap-3 rounded-xl px-5 py-3 transition-opacity hover:opacity-90"
          style={{ background: "rgba(34,158,217,0.1)", border: "1px solid rgba(34,158,217,0.3)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#229ED9" }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#229ED9" }}>New</span>
            </span>
            <span className="text-sm font-medium text-white truncate">
              WebsiteBot is live — generate your business website free on Telegram
            </span>
          </div>
          <span className="text-xs font-semibold shrink-0" style={{ color: "#229ED9" }}>Try it →</span>
        </a>
      </div>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-10 pb-6">
        {/* Platform badge */}
        <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full mb-8"
          style={{ background: "rgba(34,158,217,0.08)", border: "1px solid rgba(34,158,217,0.25)" }}>
          {/* WhatsApp icon */}
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#25D366" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.11 1.522 5.836L.057 23.927c-.07.388.261.718.648.648l6.092-1.465A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.96 9.96 0 0 1-5.073-1.38l-.363-.214-3.763.905.924-3.757-.234-.376A9.96 9.96 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
            </svg>
            WhatsApp
          </span>
          <span style={{ color: "#374151" }}>·</span>
          {/* Telegram icon */}
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#229ED9" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.248-2.01 9.476c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.26 13.887l-2.94-.918c-.64-.203-.653-.64.136-.948l11.49-4.43c.535-.194 1.003.13.615.657z" />
            </svg>
            Telegram
          </span>
          <span style={{ color: "#374151" }}>·</span>
          <span className="text-xs font-medium" style={{ color: "#6B7280" }}>AI Receptionist</span>
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-[3.75rem] font-extrabold text-white leading-[1.1] max-w-3xl mb-5">
          Your business never<br />
          <span className="gradient-text">stops talking</span>
        </h1>

        <p className="text-base sm:text-lg max-w-lg mb-12 leading-relaxed" style={{ color: "#9CA3AF" }}>
          An AI that handles every WhatsApp and Telegram inquiry automatically — while you focus on what matters.
        </p>
      </section>

      {/* ── Signup + Benefits side by side on md+ ─────────────── */}
      <section className="relative z-10 px-6 pb-16 max-w-4xl mx-auto w-full">
        <div className="grid md:grid-cols-2 gap-6 items-start">

          {/* Signup card */}
          <div className="rounded-2xl p-7 order-1"
            style={{ background: "rgba(31,41,55,0.85)", border: "1px solid rgba(34,158,217,0.2)", backdropFilter: "blur(16px)", boxShadow: "0 0 40px rgba(34,158,217,0.08)" }}>

            {status === "success" ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                  style={{ background: "rgba(37,211,102,0.12)", border: "1px solid rgba(37,211,102,0.3)" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                    stroke="#25D366" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">You&apos;re in!</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
                  We&apos;ll reach out with your exclusive early access benefits. Watch your inbox.
                </p>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-white mb-1">Register for free credits</h2>
                <p className="text-sm mb-6" style={{ color: "#6B7280" }}>
                  Get free WebsiteBot credits + founding member benefits — free months, locked pricing, and direct access to the team.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    label="Your name"
                    required
                    type="text"
                    placeholder="Jane Smith"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                  <Input
                    label="Email"
                    required
                    type="email"
                    placeholder="you@company.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                  <Input
                    label="Telegram handle"
                    type="text"
                    prefix="@"
                    placeholder="yourhandle"
                    value={form.telegram}
                    onChange={(e) => setForm({ ...form, telegram: e.target.value })}
                  />
                  <Input
                    label="WhatsApp number"
                    type="tel"
                    prefix="+"
                    placeholder="60123456789"
                    value={form.whatsapp}
                    onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  />

                  {errorMsg && (
                    <p className="text-sm px-1" style={{ color: "#F87171" }}>{errorMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading" || !form.name || !form.email}
                    className="w-full py-3.5 rounded-xl font-semibold text-white text-sm transition-opacity disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #25D366 0%, #1aaa55 100%)", boxShadow: "0 0 24px rgba(37,211,102,0.2)" }}
                  >
                    {status === "loading" ? "Joining…" : "Claim Early Access →"}
                  </button>

                  <p className="text-xs text-center" style={{ color: "#4B5563" }}>
                    No spam. No credit card. Unsubscribe anytime.
                  </p>
                </form>
              </>
            )}
          </div>

          {/* Benefits + features */}
          <div className="order-2 flex flex-col gap-5">
            {/* Early access perks */}
            <div className="rounded-2xl p-6"
              style={{ background: "rgba(37,211,102,0.05)", border: "1px solid rgba(37,211,102,0.15)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#25D366" }}>
                Founding member benefits
              </p>
              <div className="space-y-3">
                {BENEFITS.map((b) => (
                  <div key={b} className="flex items-start gap-3">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0">
                      <circle cx="12" cy="12" r="10" fill="rgba(37,211,102,0.15)" />
                      <polyline points="8 12 11 15 16 9" stroke="#25D366" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-sm" style={{ color: "#D1D5DB" }}>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature list */}
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl p-4"
                  style={f.highlight
                    ? { background: "rgba(34,158,217,0.08)", border: "1px solid rgba(34,158,217,0.35)" }
                    : { background: "rgba(55,65,81,0.4)", border: "1px solid rgba(75,85,99,0.3)" }}>
                  <div className="mb-2" style={{ color: "#229ED9" }}>{f.icon}</div>
                  <p className="text-sm font-semibold text-white mb-1">
                    {f.title}
                    {f.highlight && (
                      <span className="ml-1.5 text-xs font-medium px-1.5 py-0.5 rounded-full align-middle"
                        style={{ background: "rgba(34,158,217,0.2)", color: "#229ED9" }}>Live</span>
                    )}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: "#6B7280" }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="relative z-10 mt-auto text-center py-6 px-6"
        style={{ borderTop: "1px solid rgba(75,85,99,0.2)" }}>
        <p className="text-xs" style={{ color: "#374151" }}>
          © {new Date().getFullYear()} ChatRecept · AI-powered messaging automation
          {" · "}
          <a href="/terms" className="hover:underline transition-colors" style={{ color: "#4B5563" }}>
            Terms &amp; Conditions
          </a>
        </p>
      </footer>
    </main>
  );
}
