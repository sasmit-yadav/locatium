import { CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR_NAME } from '../config/legal';

/**
 * Terms of Use and Privacy Policy. Written in plain language for everyday users.
 * IMPORTANT: this is a starting draft, not legal advice — have it reviewed before launch.
 */

function Section({ title, children }) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-bold text-ds-text-primary">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ds-text-secondary">{children}</div>
    </section>
  );
}

function Terms() {
  return (
    <>
      <h1 className="text-2xl font-black text-ds-text-primary">Terms of Use</h1>
      <p className="mt-1 text-xs text-ds-text-tertiary">Last updated: {LEGAL_UPDATED}</p>
      <p className="mt-4 rounded-lg border border-ds-border bg-ds-surface-sunken p-3 text-sm text-ds-text-primary">
        <strong>In short:</strong> LOCATIUM is a free screening tool. Its scores, prices and forecasts are estimates from
        public data and can be wrong or out of date. It is <strong>not</strong> legal, financial, valuation or investment
        advice. Always verify title, mutation (Jamabandi), zoning/CLU and the latest collector rates with the tehsil or a
        lawyer before you pay anything.
        <br />
        <span className="mt-2 block">
          संक्षेप में: LOCATIUM सिर्फ़ शुरुआती जाँच का मुफ़्त साधन है। इसके स्कोर, कीमतें और अनुमान गलत या पुराने हो सकते हैं। यह कानूनी,
          वित्तीय या निवेश सलाह नहीं है। पैसे देने से पहले तहसील या वकील से कागज़ ज़रूर जाँचें।
        </span>
      </p>

      <Section title="1. Who we are">
        <p>
          LOCATIUM is operated by {OPERATOR_NAME} (&quot;we&quot;). By using the site you agree to these terms. If you do
          not agree, please do not use it.
        </p>
      </Section>

      <Section title="2. What the service is">
        <p>
          LOCATIUM shows maps, location scores, indicative land prices (circle / collector rates and auction comparables),
          cost estimates, an AI assistant and downloadable reports for places in Haryana. Map layers and rates come from
          government and public sources; we may show them later than they are published and we may make mistakes when
          processing them.
        </p>
      </Section>

      <Section title="3. No advice, no guarantee">
        <p>
          Everything on LOCATIUM — including scores, &quot;Good / Average / Weak&quot; labels, price bands, forecasts,
          stamp-duty and EMI calculations, checklists and AI answers — is general information for screening only. It is
          provided &quot;as is&quot; without any warranty of accuracy, completeness or fitness for a purpose. You are
          responsible for your own decisions. To the extent the law allows, we are not liable for any loss arising from
          relying on the service.
        </p>
        <p>
          The AI assistant can misunderstand questions or produce wrong answers. Check anything important against the
          official source it cites.
        </p>
      </Section>

      <Section title="4. Not an official government service">
        <p>
          LOCATIUM is not a government website and is not endorsed by any government department unless stated in writing.
          Data credited to a department remains that department&apos;s; the official record always prevails.
        </p>
      </Section>

      <Section title="5. Your account">
        <p>
          You can use LOCATIUM as a guest; guest data is deleted automatically after a few days. If you create an account,
          keep your password private and give a real email address you control. You can delete your account at any time
          from Settings → Account.
        </p>
      </Section>

      <Section title="6. Fair use">
        <p>Do not:</p>
        <ul className="list-disc pl-5">
          <li>scrape or bulk-download data, or overload the service (daily limits apply to the AI assistant and emails);</li>
          <li>try to access other people&apos;s data or break the security of the service;</li>
          <li>use the service for anything unlawful, or to mislead others about a property;</li>
          <li>present LOCATIUM reports as an official valuation or government document.</li>
        </ul>
        <p>We may suspend accounts that break these rules.</p>
      </Section>

      <Section title="7. Changes and availability">
        <p>
          The service may change, pause or stop at any time. We may update these terms; the date at the top will change and
          continued use means you accept the new version.
        </p>
      </Section>

      <Section title="8. Law and contact">
        <p>
          These terms are governed by the laws of India. Questions or complaints: <a className="text-ds-accent-text underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h1 className="text-2xl font-black text-ds-text-primary">Privacy Policy</h1>
      <p className="mt-1 text-xs text-ds-text-tertiary">Last updated: {LEGAL_UPDATED}</p>
      <p className="mt-4 rounded-lg border border-ds-border bg-ds-surface-sunken p-3 text-sm text-ds-text-primary">
        <strong>In short:</strong> we collect only what we need to run your account and the tools you use, we do not sell
        your data, and you can delete your account and its data yourself at any time.
        <br />
        <span className="mt-2 block">
          संक्षेप में: हम सिर्फ़ ज़रूरी जानकारी रखते हैं, आपका डेटा बेचते नहीं, और आप कभी भी अपना खाता और उसका डेटा खुद मिटा सकते हैं।
        </span>
      </p>

      <Section title="1. Who is responsible">
        <p>
          {OPERATOR_NAME} is the data fiduciary for LOCATIUM under India&apos;s Digital Personal Data Protection Act, 2023.
          Grievance contact: <a className="text-ds-accent-text underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Section>

      <Section title="2. What we collect">
        <ul className="list-disc pl-5">
          <li><strong>Account:</strong> email, optional display name, a one-way hash of your password (never the password itself), and when you accepted these terms.</li>
          <li><strong>What you save:</strong> pipelines, portfolios, saved searches, alerts, reports, analysis history and assistant memory.</li>
          <li><strong>What you ask:</strong> places you search or tap, and questions (text or voice) you send to the assistant.</li>
          <li><strong>Security logs:</strong> IP address, time and type of action (sign-in, report emailed, etc.).</li>
        </ul>
        <p>We do not ask for Aadhaar, PAN, bank details or property documents. Please do not type them into the assistant.</p>
      </Section>

      <Section title="3. Why we use it">
        <ul className="list-disc pl-5">
          <li>to run your account and the features you use, and to send emails you request (verification, password reset, reports, alerts);</li>
          <li>to keep the service secure, prevent abuse and enforce daily limits;</li>
          <li>to fix problems and understand which features are used (in aggregate).</li>
        </ul>
        <p>We do not sell your data or use it for advertising.</p>
      </Section>

      <Section title="4. Who else processes it">
        <ul className="list-disc pl-5">
          <li><strong>AI provider</strong> (Groq, Inc.) — assistant questions and voice clips are sent to generate answers and transcripts; this may be processed outside India.</li>
          <li><strong>Email provider</strong> — to deliver emails you ask for.</li>
          <li><strong>Hosting and network</strong> (e.g. Vercel, Cloudflare) — to serve the site.</li>
          <li><strong>Map tiles</strong> (OpenFreeMap / OpenStreetMap) — your browser requests basemap tiles directly from them.</li>
        </ul>
      </Section>

      <Section title="5. How long we keep it">
        <ul className="list-disc pl-5">
          <li>Guest (no sign-up) data: deleted automatically after about a week.</li>
          <li>Account data: until you delete your account.</li>
          <li>Generated report files: removed from the server after a few weeks (you can regenerate them).</li>
          <li>Security logs: up to 1 year; they lose the link to you when your account is deleted.</li>
        </ul>
      </Section>

      <Section title="6. Your rights">
        <p>
          You can see and correct your details in Settings → Account, and delete your account (with everything you saved)
          there in one step. For any other request — a copy of your data, a correction, or a complaint — email{' '}
          <a className="text-ds-accent-text underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If you are not
          satisfied with our response you may approach the Data Protection Board of India.
        </p>
      </Section>

      <Section title="7. Storage on your device">
        <p>
          We store your sign-in tokens and preferences (language, welcome screen) in your browser&apos;s local storage. We do
          not use advertising cookies.
        </p>
      </Section>

      <Section title="8. Children">
        <p>LOCATIUM is meant for adults. Do not create an account if you are under 18.</p>
      </Section>
    </>
  );
}

export function LegalPage({ page }) {
  return (
    <div className="min-h-screen overflow-y-auto bg-ds-surface-base">
      <main className="mx-auto max-w-2xl px-5 py-10">
        <a href="/" className="text-xs font-semibold text-ds-accent-text hover:underline">
          ← Back to LOCATIUM
        </a>
        <div className="mt-4">{page === 'privacy' ? <Privacy /> : <Terms />}</div>
        <p className="mt-10 border-t border-ds-border-subtle pt-4 text-xs text-ds-text-tertiary">
          <a href="/terms" className="hover:underline">Terms of Use</a> ·{' '}
          <a href="/privacy" className="hover:underline">Privacy Policy</a>
        </p>
      </main>
    </div>
  );
}
