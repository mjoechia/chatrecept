import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — ChatRecept",
  description: "ChatRecept Privacy Policy — how we collect, use, and protect your personal data under PDPA and GDPR.",
};

const EFFECTIVE_DATE = "26 April 2026";
const EMAIL = "privacy@chatrecept.chat";

export default function PrivacyPage() {
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
        <h1 className="text-2xl font-bold text-white mb-1">Privacy Policy</h1>
        <p className="text-sm mb-1" style={{ color: "#6B7280" }}>Effective Date: {EFFECTIVE_DATE}</p>
        <p className="text-sm mb-10" style={{ color: "#6B7280" }}>Website: https://chatrecept.chat/</p>

        <Section title="1. Introduction">
          <p>
            ChatRecept (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) operates a platform that provides AI-driven chat,
            communication, and related services.
          </p>
          <p>
            We are committed to protecting personal data in accordance with applicable laws, including the
            Singapore Personal Data Protection Act 2012 (<strong className="text-white">PDPA</strong>) and
            the EU General Data Protection Regulation (<strong className="text-white">GDPR</strong>).
          </p>
        </Section>

        <Section title="2. Data Controller">
          <p>
            Email:{" "}
            <a href={`mailto:${EMAIL}`} style={{ color: "#229ED9" }}>{EMAIL}</a>
          </p>
        </Section>

        <Section title="3. Categories of Personal Data">
          <h3>3.1 Information You Provide</h3>
          <ul>
            <li>Name, email, phone number</li>
            <li>Account credentials</li>
            <li>Payment details (processed via third-party processors)</li>
            <li>Chat messages and uploaded content</li>
            <li>Customer support communications</li>
          </ul>

          <h3>3.2 Sensitive Personal Data</h3>
          <p>
            Due to the nature of chat interactions, you may voluntarily provide sensitive data, including:
          </p>
          <ul>
            <li>Financial information</li>
            <li>Health-related information</li>
            <li>Personal identifiers</li>
          </ul>
          <p className="font-medium" style={{ color: "#F9FAFB" }}>
            Important: You should avoid submitting sensitive data unless necessary.
          </p>

          <h3>3.3 Automatically Collected Data</h3>
          <ul>
            <li>IP address</li>
            <li>Device and browser information</li>
            <li>Usage logs and analytics</li>
            <li>Cookies and tracking data</li>
          </ul>
        </Section>

        <Section title="4. Legal Basis for Processing (GDPR)">
          <p>We process personal data under the following lawful bases:</p>
          <ul>
            <li><strong className="text-white">Contractual necessity</strong> – to provide our services</li>
            <li><strong className="text-white">Legitimate interests</strong> – to improve, secure, and optimise our platform</li>
            <li><strong className="text-white">Consent</strong> – for marketing and certain data processing</li>
            <li><strong className="text-white">Legal obligation</strong> – compliance with applicable laws</li>
          </ul>
        </Section>

        <Section title="5. Purpose of Processing">
          <p>We use your data to:</p>
          <ul>
            <li>Provide and operate ChatRecept services</li>
            <li>Process payments and manage subscriptions</li>
            <li>Deliver AI chat functionality</li>
            <li>Improve system performance and accuracy</li>
            <li>Provide customer support</li>
            <li>Detect fraud, abuse, or security incidents</li>
            <li>Comply with legal obligations</li>
          </ul>
        </Section>

        <Section title="6. AI &amp; Chat Data Processing">
          <p>By using our platform:</p>
          <ul>
            <li>You acknowledge that chat inputs may be processed by AI systems</li>
            <li>Conversations may be stored, analysed, and used to improve services</li>
            <li>Data may be processed by third-party AI providers</li>
          </ul>
          <p className="font-medium" style={{ color: "#F9FAFB" }}>
            We implement safeguards, but AI outputs are not guaranteed to be accurate or confidential.
          </p>
        </Section>

        <Section title="7. Payments">
          <p>We use third-party payment processors (e.g. Stripe or similar providers):</p>
          <ul>
            <li>Payment details are not stored by us</li>
            <li>Payment processors handle data in accordance with their own privacy policies</li>
            <li>We may store billing metadata (e.g. transaction IDs, subscription status)</li>
          </ul>
        </Section>

        <Section title="8. Data Sharing &amp; Disclosure">
          <p>We do not sell personal data.</p>
          <p>We may share data with:</p>
          <ul>
            <li>Cloud hosting providers (e.g. Amazon Web Services, Google Cloud)</li>
            <li>Analytics providers</li>
            <li>Payment processors</li>
            <li>AI service providers</li>
            <li>Legal authorities when required</li>
          </ul>
          <p>All vendors are subject to contractual data protection obligations.</p>
        </Section>

        <Section title="9. International Data Transfers">
          <p>Your data may be transferred outside Singapore, including:</p>
          <ul>
            <li>United States</li>
            <li>European Union</li>
            <li>Other jurisdictions where our vendors operate</li>
          </ul>
          <p>We rely on safeguards such as:</p>
          <ul>
            <li>Standard Contractual Clauses (SCCs)</li>
            <li>Equivalent legal protections</li>
          </ul>
        </Section>

        <Section title="10. Data Retention">
          <p>We retain personal data:</p>
          <ul>
            <li>As long as your account is active</li>
            <li>As necessary for legal, tax, and regulatory compliance</li>
            <li>For legitimate business purposes (e.g. fraud prevention)</li>
          </ul>
          <p>You may request deletion at any time (see Section 12).</p>
        </Section>

        <Section title="11. Data Security">
          <p>We implement appropriate safeguards including:</p>
          <ul>
            <li>Encryption (in transit and at rest where applicable)</li>
            <li>Access controls</li>
            <li>Monitoring and logging</li>
          </ul>
          <p>However, no system is completely secure.</p>
        </Section>

        <Section title="12. Your Rights">
          <h3>Under GDPR (EU Users)</h3>
          <p>You have the right to:</p>
          <ul>
            <li>Access your data</li>
            <li>Rectify inaccurate data</li>
            <li>Erase data (&ldquo;right to be forgotten&rdquo;)</li>
            <li>Restrict processing</li>
            <li>Data portability</li>
            <li>Object to processing</li>
          </ul>

          <h3>Under PDPA (Singapore Users)</h3>
          <p>You have the right to:</p>
          <ul>
            <li>Access personal data</li>
            <li>Correct inaccuracies</li>
            <li>Withdraw consent</li>
          </ul>

          <p>
            To exercise your rights:{" "}
            <a href={`mailto:${EMAIL}`} style={{ color: "#229ED9" }}>{EMAIL}</a>
          </p>
        </Section>

        <Section title="13. Cookies &amp; Tracking">
          <p>We use cookies for:</p>
          <ul>
            <li>Authentication</li>
            <li>Analytics</li>
            <li>Performance optimisation</li>
          </ul>
          <p>You can manage cookies via your browser settings.</p>
        </Section>

        <Section title="14. Children's Data">
          <p>
            Our services are not intended for individuals under 13 (or the applicable local legal age).
            We do not knowingly collect children&apos;s data.
          </p>
        </Section>

        <Section title="15. Data Breach Notification">
          <p>In the event of a data breach:</p>
          <ul>
            <li>We will notify relevant authorities as required under PDPA/GDPR</li>
            <li>Affected users will be informed where legally required</li>
          </ul>
        </Section>

        <Section title="16. Third-Party Links">
          <p>
            Our website may contain links to third-party services. We are not responsible for
            their privacy practices.
          </p>
        </Section>

        <Section title="17. Changes to This Policy">
          <p>
            We may update this Privacy Policy periodically. Changes will be posted with an
            updated effective date.
          </p>
        </Section>

        <Section title="18. Contact">
          <p>
            Data Protection Contact:{" "}
            <a href={`mailto:${EMAIL}`} style={{ color: "#229ED9" }}>{EMAIL}</a>
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
