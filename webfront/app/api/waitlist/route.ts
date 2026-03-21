import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; telegram?: string; whatsapp?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const telegram = (body.telegram ?? "").trim().replace(/^@/, "") || null;
  const whatsapp = (body.whatsapp ?? "").trim() || null;

  const { error } = await supabase.rpc("join_waitlist", {
    p_name: name,
    p_email: email,
    p_telegram: telegram,
    p_whatsapp: whatsapp,
  });

  if (error) {
    console.error("waitlist insert error:", error);
    return NextResponse.json({ error: "Failed to join waitlist" }, { status: 500 });
  }

  await resend.emails.send({
    from: "ChatRecept <hello@chatrecept.chat>",
    to: email,
    subject: "You're in — ChatRecept early access confirmed",
    html: `
      <div style="font-family:'Be Vietnam Pro',system-ui,sans-serif;background:#f3f6ff;padding:40px 0;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;padding:48px 40px;box-shadow:0 4px 24px rgba(18,48,79,0.08);">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#006092,#4db0f7);display:flex;align-items:center;justify-content:center;">
              <span style="color:white;font-size:18px;">💬</span>
            </div>
            <span style="font-size:20px;font-weight:800;background:linear-gradient(135deg,#006092,#4db0f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">ChatRecept</span>
          </div>
          <h1 style="font-size:28px;font-weight:800;color:#12304f;margin:0 0 12px;">You're in, ${name}! 🎉</h1>
          <p style="color:#425d7f;font-size:16px;line-height:1.6;margin:0 0 28px;">
            Welcome to ChatRecept early access. You're now on the founding member list — we'll reach out soon with your exclusive benefits.
          </p>
          <div style="background:#eaf1ff;border-radius:16px;padding:24px;margin-bottom:28px;">
            <p style="color:#006092;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 16px;">Your founding member benefits</p>
            <ul style="margin:0;padding:0;list-style:none;">
              <li style="color:#425d7f;font-size:14px;padding:6px 0;border-bottom:1px solid #dce9ff;">✅ Free website via WebsiteBot on Telegram — instant</li>
              <li style="color:#425d7f;font-size:14px;padding:6px 0;border-bottom:1px solid #dce9ff;">✅ 3 months free on any paid plan</li>
              <li style="color:#425d7f;font-size:14px;padding:6px 0;border-bottom:1px solid #dce9ff;">✅ Founder pricing — locked in forever</li>
              <li style="color:#425d7f;font-size:14px;padding:6px 0;border-bottom:1px solid #dce9ff;">✅ Priority onboarding via Telegram</li>
              <li style="color:#425d7f;font-size:14px;padding:6px 0;">✅ Direct input into the product roadmap</li>
            </ul>
          </div>
          <a href="https://t.me/ChatReceptWebBot" style="display:inline-block;background:linear-gradient(135deg,#006092,#4db0f7);color:#ffffff;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;">
            Try WebsiteBot on Telegram →
          </a>
          <p style="color:#94afd5;font-size:12px;margin:32px 0 0;">
            You're receiving this because you signed up at chatrecept.chat. No spam — ever.
          </p>
        </div>
      </div>
    `,
  }).catch((err) => console.error("resend error:", err));

  return NextResponse.json({ ok: true });
}
