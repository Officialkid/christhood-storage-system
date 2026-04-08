import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms & Privacy – Christhood ShareLink',
  description: 'Terms of Service and Privacy Policy for Christhood ShareLink.',
}

export default function ShareLinkLegalPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900
                     px-4 py-16 relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="pointer-events-none fixed -top-60 -left-60 w-[600px] h-[600px]
                      rounded-full bg-indigo-600/15 blur-[140px]" />
      <div className="pointer-events-none fixed -bottom-60 -right-60 w-[600px] h-[600px]
                      rounded-full bg-violet-600/15 blur-[140px]" />

      <div className="relative z-10 max-w-3xl mx-auto">

        {/* Back link */}
        <Link
          href="/public-share"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400
                     hover:text-indigo-400 transition-colors mb-8 group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to ShareLink
        </Link>

        {/* Jump links */}
        <div className="flex gap-4 mb-8">
          <a href="#terms"
             className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
            → Terms of Service
          </a>
          <a href="#privacy"
             className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors font-medium">
            → Privacy Policy
          </a>
        </div>

        {/* ── TERMS OF SERVICE ─────────────────────────────────────────────── */}
        <section id="terms" className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/60
                                       rounded-2xl shadow-2xl shadow-black/40 px-8 py-10 mb-8">
          <div className="mb-10 pb-6 border-b border-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-2">
              Christhood ShareLink
            </p>
            <h1 className="text-3xl font-bold text-white mb-3">Terms of Service</h1>
            <p className="text-sm text-slate-400">Effective date: April 8, 2026</p>
          </div>

          <div className="prose prose-invert prose-sm max-w-none space-y-8 text-slate-300">

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance</h2>
              <p>
                By uploading or downloading files through Christhood ShareLink
                (&ldquo;ShareLink&rdquo;), you agree to these Terms. If you do not agree, do not use
                ShareLink. ShareLink is a public file-transfer service operated by the Christhood
                ministry team.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">2. Permitted Use</h2>
              <p>You may use ShareLink to:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                <li>Share files with individuals who have a legitimate need to receive them</li>
                <li>Send documents, images, videos, or other files up to 50 MB per file</li>
              </ul>
              <p className="mt-3">You must <strong className="text-white">not</strong> use ShareLink to:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                <li>Upload illegal, harmful, hateful, or sexually explicit content</li>
                <li>Distribute malware, viruses, or any malicious software</li>
                <li>Infringe the intellectual property rights of any third party</li>
                <li>Conduct automated or bulk uploads without authorisation</li>
                <li>Attempt to circumvent rate limits, PIN protections, or access controls</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">3. File Lifecycle</h2>
              <p>
                All uploaded files are stored for a maximum of <strong className="text-white">7 days</strong>.
                After expiry, files and their associated share links are permanently and automatically
                deleted from our storage. We do not keep backups of expired files. You are responsible
                for retaining your own copies of uploaded content.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">4. No Account Required</h2>
              <p>
                ShareLink does not require a user account. Your IP address is recorded solely for
                rate-limiting and abuse prevention purposes (see Section 5). No personal profile or
                account is created when you use ShareLink.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">5. Rate Limits and Abuse Prevention</h2>
              <p>
                To prevent abuse, uploads are limited to <strong className="text-white">5 per IP address per hour</strong>.
                If you need higher limits, contact us. We reserve the right to block IP addresses that
                violate these Terms or attempt to misuse the service.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">6. PIN Protection</h2>
              <p>
                You may optionally protect a share link with a PIN. If you do, recipients will be
                required to enter the PIN before downloading. You are responsible for communicating the
                PIN to intended recipients securely. We cannot recover or reset PINs.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">7. Disclaimer of Warranties</h2>
              <p>
                ShareLink is provided &ldquo;as is&rdquo; without warranty of any kind. We do not
                guarantee uninterrupted availability or that files will be accessible for the full
                7-day window. We are not liable for any loss of data or damages arising from use of
                ShareLink.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">8. Changes to These Terms</h2>
              <p>
                We may update these Terms at any time. Continued use of ShareLink after an update
                constitutes acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">9. Contact</h2>
              <p>
                Questions about these Terms:{' '}
                <a href="mailto:contact@cmmschristhood.org"
                   className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  contact@cmmschristhood.org
                </a>
              </p>
            </section>
          </div>
        </section>

        {/* ── PRIVACY POLICY ───────────────────────────────────────────────── */}
        <section id="privacy" className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/60
                                         rounded-2xl shadow-2xl shadow-black/40 px-8 py-10 mb-12">
          <div className="mb-10 pb-6 border-b border-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-2">
              Christhood ShareLink
            </p>
            <h1 className="text-3xl font-bold text-white mb-3">Privacy Policy</h1>
            <p className="text-sm text-slate-400">Effective date: April 8, 2026</p>
          </div>

          <div className="prose prose-invert prose-sm max-w-none space-y-8 text-slate-300">

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">1. Who We Are</h2>
              <p>
                Christhood ShareLink is a file-sharing service operated by the Christhood ministry team.
                This Policy explains what data ShareLink collects when you upload or download files, how
                that data is used, and how long it is retained.
              </p>
              <p className="mt-3">
                Contact us:{' '}
                <a href="mailto:contact@cmmschristhood.org"
                   className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  contact@cmmschristhood.org
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>

              <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">2.1 When you upload a file</h3>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                <li>File name, file size, and MIME type — to manage the upload and display information to recipients</li>
                <li>Optional title, description, and recipient email address — provided by you</li>
                <li>Your IP address — stored solely for rate-limiting and abuse prevention; never shown publicly</li>
                <li>A PIN hash — if you set a PIN (the plain-text PIN is never stored)</li>
              </ul>

              <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">2.2 When you download a file</h3>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                <li>A download counter is incremented on the share record — no personal data is collected about the downloader</li>
              </ul>

              <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">2.3 Recipient email</h3>
              <p>
                If you enter a recipient email address, it is used solely to send that person a one-time
                notification email containing the download link(s). We do not subscribe recipients to any
                mailing list or retain their address beyond the share record&rsquo;s 7-day lifetime.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>To generate and serve the download link for your uploaded file(s)</li>
                <li>To deliver a notification email to the recipient address you provide (if any)</li>
                <li>To enforce rate limits and prevent abuse using your IP address</li>
                <li>To automatically purge expired files and their records after 7 days</li>
              </ul>
              <p className="mt-3">
                We do not use any collected data for advertising, analytics, or profiling.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">4. Third-Party Services</h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-700/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800/60 text-slate-300">
                      <th className="text-left px-4 py-3 font-medium">Service</th>
                      <th className="text-left px-4 py-3 font-medium">Purpose</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-slate-400">
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Cloudflare R2</td>
                      <td className="px-4 py-3">Encrypted file storage — files are purged after 7 days</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Neon PostgreSQL</td>
                      <td className="px-4 py-3">Share record metadata (token, file info, expiry, IP hash)</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Resend</td>
                      <td className="px-4 py-3">Transactional email for recipient notifications</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Google Cloud Run</td>
                      <td className="px-4 py-3">Application hosting</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">5. Data Retention</h2>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>
                  <span className="text-slate-300">Uploaded files</span> — deleted from Cloudflare R2 automatically
                  7 days after upload. Cannot be recovered after deletion.
                </li>
                <li>
                  <span className="text-slate-300">Share records (metadata)</span> — purged from the database
                  together with the file, 7 days after upload.
                </li>
                <li>
                  <span className="text-slate-300">IP addresses</span> — retained only within the share record
                  and deleted with it after 7 days.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">6. Your Rights</h2>
              <p>
                Because ShareLink does not require an account, there is no user profile to access, correct,
                or delete. If you want a specific upload removed before its 7-day expiry, contact us with
                the share token and we will remove it promptly.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">7. Security</h2>
              <p>
                Files are stored on Cloudflare R2 with access controlled by short-lived presigned URLs.
                PINs are stored as bcrypt hashes — the plain-text PIN is never stored. All traffic is
                served over HTTPS.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">8. Changes to This Policy</h2>
              <p>
                We may update this Policy to reflect changes in our practices. Updates will be published
                at this page with a revised effective date. Continued use of ShareLink after an update
                constitutes acceptance of the revised Policy.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-white mb-3">9. Contact</h2>
              <p>
                Privacy questions:{' '}
                <a href="mailto:contact@cmmschristhood.org"
                   className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  contact@cmmschristhood.org
                </a>
              </p>
            </section>
          </div>
        </section>

        {/* Footer back link */}
        <div className="text-center">
          <Link href="/public-share"
                className="text-sm text-slate-500 hover:text-indigo-400 transition-colors">
            ← Back to ShareLink
          </Link>
        </div>

      </div>
    </main>
  )
}
