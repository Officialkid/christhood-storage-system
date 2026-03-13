import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy – Christhood CMMS',
  description: 'Privacy Policy for the Christhood CMMS media management platform.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#020817] px-4 py-16 relative overflow-hidden">
      {/* Ambient blobs */}
      <div className="pointer-events-none fixed -top-60 -left-60 w-[600px] h-[600px]
                      rounded-full bg-indigo-600/15 blur-[140px]" />
      <div className="pointer-events-none fixed -bottom-60 -right-60 w-[600px] h-[600px]
                      rounded-full bg-violet-600/15 blur-[140px]" />

      <div className="relative z-10 max-w-3xl mx-auto">
        {/* Back link */}
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400
                     hover:text-indigo-400 transition-colors mb-8 group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform"
               fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to login
        </Link>

        {/* Card */}
        <div className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/60
                        rounded-2xl shadow-2xl shadow-black/40 px-8 py-10">

          {/* Header */}
          <div className="mb-10 pb-6 border-b border-slate-800/60">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-400 mb-2">
              Christhood CMMS
            </p>
            <h1 className="text-3xl font-bold text-white mb-3">Privacy Policy</h1>
            <p className="text-sm text-slate-400">Effective date: March 9, 2026</p>
          </div>

          <div className="prose prose-invert prose-sm max-w-none space-y-8 text-slate-300">

            {/* 1 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">1. Who We Are</h2>
              <p>
                Christhood CMMS (&ldquo;the Platform&rdquo;) is an internal media management system operated
                by the Christhood ministry team. It is used exclusively by authorised ministry staff to
                upload, organise, review, and manage photos and videos from ministry events. This Policy
                explains what personal data we collect, how we use it, and your rights with respect to it.
              </p>
              <p className="mt-3">
                If you have questions about this Policy, contact us at{' '}
                <a href="mailto:contact@cmmschristhood.org"
                   className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  contact@cmmschristhood.org
                </a>.
              </p>
            </section>

            {/* 2 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>

              <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">2.1 Account Information</h3>
              <p>When you register or sign in, we collect:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                <li>Name, email address, and username</li>
                <li>Password (stored as a cryptographic hash — your plain-text password is never saved)</li>
                <li>Phone number (optional, if provided during sign-up)</li>
                <li>Profile picture (imported from Google if you use Google Sign-In)</li>
                <li>Your assigned role within the platform (Admin, Editor, or Uploader)</li>
              </ul>

              <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">2.2 Authentication Tokens</h3>
              <p>
                If you sign in via Google OAuth, we store the OAuth provider ID and access tokens issued
                by Google solely to manage your authenticated session. We do not access your Google account
                beyond the basic profile and email scopes required for sign-in.
              </p>

              <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">2.3 Uploaded Media</h3>
              <p>
                Photos and videos you upload are stored securely on Cloudflare R2 object storage. The
                platform records the original file name, stored file name, file size, file type, and upload
                timestamp. Files are organised within a hierarchy of Years, Event Categories, Events, and
                optional Subfolders.
              </p>

              <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">2.4 Activity Logs</h3>
              <p>
                We maintain an activity log that records actions taken within the platform — such as file
                uploads, status changes, downloads, and deletions — along with the user who performed each
                action and its timestamp. These logs are used for internal accountability and audit purposes
                and are accessible only to Admins.
              </p>

              <h3 className="text-base font-medium text-slate-200 mb-2 mt-4">2.5 Notifications</h3>
              <p>
                If you enable browser push notifications, we store your browser&rsquo;s push subscription
                endpoint and encryption keys (provided by your browser&rsquo;s push service) solely to
                deliver platform notifications to your device. You may revoke this permission at any time
                in your browser or notification settings.
              </p>
            </section>

            {/* 3 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
              <p>We use collected information only for the following purposes:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                <li>To authenticate and manage your account</li>
                <li>To organise and display media files relevant to your role</li>
                <li>To send password reset emails to the address associated with your account</li>
                <li>To deliver in-app and push notifications about activity relevant to you</li>
                <li>To maintain audit trails of activity within the platform</li>
                <li>To power the built-in Help Assistant (see Section 5)</li>
              </ul>
              <p className="mt-3">
                We do not use your data for advertising, profiling, or any purpose unrelated to the
                platform&rsquo;s operation.
              </p>
            </section>

            {/* 4 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">4. Third-Party Services</h2>
              <p>
                The platform relies on the following trusted third-party processors to operate. Each
                processes data only as needed to provide the described service:
              </p>
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
                      <td className="px-4 py-3 text-slate-300 font-medium">Google OAuth</td>
                      <td className="px-4 py-3">Optional social sign-in</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Cloudflare R2</td>
                      <td className="px-4 py-3">Secure media file storage</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Neon PostgreSQL</td>
                      <td className="px-4 py-3">Database hosting</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Google Cloud Run</td>
                      <td className="px-4 py-3">Application hosting</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Resend</td>
                      <td className="px-4 py-3">Transactional email delivery (password resets)</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Google Gemini</td>
                      <td className="px-4 py-3">AI model powering the Help Assistant (see Section 5)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 5 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">5. Help Assistant (AI Chatbot)</h2>
              <p>
                The platform includes a built-in Help Assistant powered by Google&rsquo;s Gemini AI API. When
                you send a message to the assistant, your message text and the current page context are
                transmitted to Google&rsquo;s servers to generate a response. Chat messages are not
                stored in our database beyond the active session. Please do not submit sensitive personal
                information through the Help Assistant.
              </p>
            </section>

            {/* 6 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">6. Data Retention</h2>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>
                  <span className="text-slate-300">Media files moved to Trash</span> — retained for 30 days, then
                  permanently deleted from storage.
                </li>
                <li>
                  <span className="text-slate-300">User accounts</span> — retained for as long as your account
                  is active. Admins may delete accounts, which cascades to remove associated sessions and
                  OAuth links.
                </li>
                <li>
                  <span className="text-slate-300">Activity logs</span> — retained indefinitely for audit
                  purposes unless manually cleared by an Admin.
                </li>
                <li>
                  <span className="text-slate-300">Push subscriptions</span> — retained until you revoke
                  notification permission or your subscription expires.
                </li>
              </ul>
            </section>

            {/* 7 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">7. Data Security</h2>
              <p>
                All data is transmitted over HTTPS. Passwords are never stored in plain text. Media files
                are stored in private Cloudflare R2 buckets with pre-signed time-limited URLs used for
                access. Access to the platform is restricted to invited, role-assigned users only.
              </p>
            </section>

            {/* 8 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">8. Your Rights</h2>
              <p>As a user of the platform, you may:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                <li>Update your profile information from your account settings</li>
                <li>Request deletion of your account by contacting an Admin</li>
                <li>Revoke push notification access at any time in your browser settings</li>
                <li>Request a summary of activity logged against your account from an Admin</li>
              </ul>
            </section>

            {/* 9 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">9. Changes to This Policy</h2>
              <p>
                We may update this Policy as the platform evolves. Material changes will be communicated
                to existing users. Continued use of the platform after an update constitutes acceptance
                of the revised Policy.
              </p>
            </section>

            {/* 10 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">10. Contact</h2>
              <p>
                For any privacy-related questions or requests, contact the platform administrator at{' '}
                <a href="mailto:contact@cmmschristhood.org"
                   className="text-indigo-400 hover:text-indigo-300 transition-colors">
                  contact@cmmschristhood.org
                </a>.
              </p>
            </section>

          </div>

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-slate-800/60 flex items-center
                          justify-between flex-wrap gap-3">
            <p className="text-xs text-slate-500">© {new Date().getFullYear()} Christhood CMMS. All rights reserved.</p>
            <Link href="/terms"
                  className="text-xs text-slate-500 hover:text-indigo-400 transition-colors">
              Terms of Service →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
