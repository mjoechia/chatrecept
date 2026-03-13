import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms & Conditions — ChatRecept",
  description: "ChatRecept Terms and Conditions including credit usage, affiliate programme rules, and subscription terms.",
};

const LAST_UPDATED = "13 March 2026";
const COMPANY = "ChatRecept Pte. Ltd.";
const EMAIL = "legal@chatrecept.chat";

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-graphite text-white">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-3xl mx-auto w-full border-b"
        style={{ borderColor: "rgba(75,85,99,0.2)" }}>
        <Link href="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #25D366 0%, #229ED9 100%)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="font-bold text-white text-base tracking-tight">ChatRecept</span>
        </Link>
        <Link href="/" className="text-sm transition-colors hover:text-white" style={{ color: "#6B7280" }}>
          ← Back
        </Link>
      </nav>

      {/* Content */}
      <article className="max-w-3xl mx-auto px-6 py-12 prose-terms">
        <h1 className="text-2xl font-bold text-white mb-1">Terms &amp; Conditions</h1>
        <p className="text-sm mb-10" style={{ color: "#6B7280" }}>Last updated: {LAST_UPDATED}</p>

        <Section title="1. About These Terms">
          <p>
            These Terms &amp; Conditions govern your use of the ChatRecept platform, including the website at{" "}
            <span className="text-white font-medium">chatrecept.chat</span>, the dashboard, the AI receptionist
            service, and any associated mobile or messaging integrations (collectively, the <strong>"Service"</strong>).
          </p>
          <p>
            The Service is operated by <strong>{COMPANY}</strong>, a company registered in Singapore
            (<strong>"we"</strong>, <strong>"us"</strong>, or <strong>"ChatRecept"</strong>).
          </p>
          <p>
            By creating an account or using the Service, you agree to these Terms. If you do not agree,
            do not use the Service.
          </p>
        </Section>

        <Section title="2. Subscription">
          <p>
            Access to the Service requires an active monthly subscription at{" "}
            <strong>SGD 9.90 per month</strong> (or the equivalent in your billing currency).
            Subscriptions are billed monthly in advance and renew automatically unless cancelled.
          </p>
          <ul>
            <li>You may cancel at any time. Cancellation takes effect at the end of the current billing period.</li>
            <li>No refunds are issued for partial months.</li>
            <li>We reserve the right to change subscription pricing with 30 days' notice.</li>
            <li>Founding member pricing, where offered, is locked for the period stated at signup.</li>
          </ul>
        </Section>

        <Section title="3. Message Credits">
          <p>
            The Service operates on a credit system. Credits are consumed each time the AI receptionist
            handles a new customer conversation window (a 24-hour period per customer).
          </p>

          <h3>3.1 Purchasing Credits</h3>
          <p>
            Credits may be purchased as top-ups in fixed amounts. Top-ups are processed immediately and
            added to your account balance upon successful payment.
          </p>

          <h3>3.2 Credit Usage</h3>
          <ul>
            <li>One (1) credit unit is deducted per new 24-hour conversation window opened by a customer.</li>
            <li>Messages within an open conversation window do not consume additional credits.</li>
            <li>If your credit balance reaches zero, the AI receptionist will stop responding to new conversations until credits are topped up.</li>
            <li>Unused credits roll over each month while your subscription is active.</li>
          </ul>

          <h3>3.3 No Cash Value</h3>
          <p className="font-medium" style={{ color: "#F9FAFB" }}>
            Credits have no monetary value and cannot be redeemed for cash, bank transfer, or any
            cash-equivalent. Credits are a prepaid service entitlement only.
          </p>
          <p>
            We do not buy back, exchange, or refund credits for money under any circumstances.
            This applies to credits purchased directly and to credits received through the Affiliate Programme.
          </p>

          <h3>3.4 Credit Expiry</h3>
          <ul>
            <li>Credits do not expire while your subscription remains active and in good standing.</li>
            <li>
              If your subscription is cancelled or lapses due to non-payment, all remaining credits
              are forfeited 30 days after the subscription end date.
            </li>
            <li>We will send a reminder before credits are forfeited.</li>
          </ul>

          <h3>3.5 No Refunds on Credits</h3>
          <p>
            Credit top-ups are non-refundable once purchased, except where required by applicable
            Singapore consumer protection law. If you believe a charge was made in error, contact us at{" "}
            <a href={`mailto:${EMAIL}`} style={{ color: "#229ED9" }}>{EMAIL}</a> within 14 days.
          </p>
        </Section>

        <Section title="4. Affiliate Programme">
          <p>
            Subscribers may participate in the ChatRecept Affiliate Programme by sharing a unique referral link.
            Participation is automatic for all active subscribers — no separate sign-up is required.
          </p>

          <h3>4.1 How Affiliate Credits Are Earned</h3>
          <ul>
            <li>
              <strong>Level 1:</strong> When someone you refer directly makes a credit top-up, you receive
              20% of the top-up value as affiliate credits.
            </li>
            <li>
              <strong>Level 2:</strong> When someone referred by your Level 1 referral makes a top-up,
              you receive 10% of that top-up value as affiliate credits.
            </li>
            <li>
              Affiliate credits are only generated from credit top-ups, not from subscription fees.
            </li>
            <li>
              Your subscription must be active and in good standing at the time the qualifying top-up
              is made for the credit to be issued.
            </li>
          </ul>

          <h3>4.2 Affiliate Credit Rules</h3>
          <ul>
            <li>Affiliate credits are identical to purchased credits in function and are subject to the same terms in Section 3.</li>
            <li>Affiliate credits have no cash value and cannot be redeemed for money.</li>
            <li>You cannot refer yourself or create multiple accounts to generate referral credits.</li>
            <li>Circular referrals (A refers B, B refers A) are not permitted.</li>
            <li>Affiliate credits are capped at SGD 500 face value per calendar month per account.</li>
            <li>A minimum top-up of SGD 10 by the referred party is required to generate affiliate credits.</li>
          </ul>

          <h3>4.3 Disqualification and Removal of Credits</h3>
          <p>
            We reserve the right to remove affiliate credits, with an audit trail recorded, if we determine that:
          </p>
          <ul>
            <li>The referral was fraudulent, self-generated, or violated these Terms.</li>
            <li>The referred account was created with false information or is associated with abuse.</li>
            <li>The top-up that generated the credit was subsequently charged back or refunded.</li>
            <li>There is evidence of coordinated or artificial top-up activity.</li>
          </ul>
          <p>
            All credit removal actions are logged with a timestamp, the reason, and the administrator
            responsible. You will be notified if credits are removed from your account.
          </p>

          <h3>4.4 Programme Changes</h3>
          <p>
            We may modify or discontinue the Affiliate Programme at any time with 30 days' notice.
            Any credits already in your balance at the time of discontinuation will remain valid for
            use against the Service for 90 days thereafter.
          </p>
        </Section>

        <Section title="5. Acceptable Use">
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Send unsolicited bulk messages (spam) to end users.</li>
            <li>Impersonate any person, business, or organisation in a misleading manner.</li>
            <li>Engage in any activity that violates WhatsApp, Telegram, or Meta platform policies.</li>
            <li>Use the AI receptionist for illegal purposes or to facilitate illegal activity.</li>
            <li>Attempt to circumvent credit deduction, rate limits, or abuse prevention systems.</li>
            <li>Resell access to the Service without our written consent.</li>
          </ul>
          <p>
            Violation of this section may result in immediate suspension of your account without
            refund.
          </p>
        </Section>

        <Section title="6. Intellectual Property">
          <p>
            All content, software, branding, and technology constituting the ChatRecept platform is
            owned by {COMPANY} or its licensors. You are granted a limited, non-exclusive,
            non-transferable licence to use the Service for its intended purpose.
          </p>
          <p>
            You retain all ownership of the business data, conversation content, and customer
            information you submit to the Service.
          </p>
        </Section>

        <Section title="7. Data and Privacy">
          <p>
            We process personal data in accordance with Singapore's Personal Data Protection Act 2012
            (PDPA). By using the Service, you consent to our collection and use of data as described
            in our Privacy Policy.
          </p>
          <p>
            You are responsible for ensuring that your use of the Service complies with PDPA obligations
            with respect to your own customers' data — including obtaining any necessary consents before
            collecting customer information via the AI receptionist.
          </p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p>
            To the maximum extent permitted by Singapore law, {COMPANY} is not liable for any indirect,
            incidental, or consequential loss arising from your use of the Service, including but not
            limited to loss of business, revenue, or data.
          </p>
          <p>
            Our total liability to you for any claim arising under these Terms shall not exceed the
            total amount paid by you to us in the 3 months preceding the claim.
          </p>
        </Section>

        <Section title="9. Changes to These Terms">
          <p>
            We may update these Terms from time to time. We will notify you by email or in-app notice
            at least 14 days before material changes take effect. Continued use of the Service after
            that date constitutes acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="10. Governing Law">
          <p>
            These Terms are governed by the laws of Singapore. Any dispute shall be subject to the
            exclusive jurisdiction of the courts of Singapore.
          </p>
          <p>
            For questions about these Terms, contact us at{" "}
            <a href={`mailto:${EMAIL}`} style={{ color: "#229ED9" }}>{EMAIL}</a>.
          </p>
        </Section>
      </article>

      {/* Footer */}
      <footer className="text-center py-6 px-6 mt-4"
        style={{ borderTop: "1px solid rgba(75,85,99,0.2)" }}>
        <p className="text-xs" style={{ color: "#374151" }}>
          © {new Date().getFullYear()} ChatRecept · AI-powered messaging automation
        </p>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-bold mb-4 pb-2"
        style={{ color: "#229ED9", borderBottom: "1px solid rgba(34,158,217,0.2)" }}>
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: "#9CA3AF" }}>
        {children}
      </div>
    </section>
  );
}
