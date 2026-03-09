import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service – Christhood CMMS',
  description: 'Terms of Service for the Christhood CMMS media management platform.',
}

export default function TermsPage() {
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
            <h1 className="text-3xl font-bold text-white mb-3">Terms of Service</h1>
            <p className="text-sm text-slate-400">Effective date: March 9, 2026</p>
          </div>

          <div className="prose prose-invert prose-sm max-w-none space-y-8 text-slate-300">

            {/* 1 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
              <p>
                By accessing or using Christhood CMMS (&ldquo;the Platform&rdquo;), you agree to be bound
                by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree, you may not use the
                Platform. The Platform is intended solely for authorised members of the Christhood ministry
                team. Unauthorised access is strictly prohibited.
              </p>
            </section>

            {/* 2 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">2. Access and Accounts</h2>
              <p>
                Access to the Platform is granted by an Administrator to authorised personnel only.
                Each user is assigned one of three roles that determine their permissions:
              </p>
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-700/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800/60 text-slate-300">
                      <th className="text-left px-4 py-3 font-medium">Role</th>
                      <th className="text-left px-4 py-3 font-medium">Capabilities</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-slate-400">
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Uploader</td>
                      <td className="px-4 py-3">Upload photos and videos to assigned events</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Editor</td>
                      <td className="px-4 py-3">Upload files and update file statuses and tags</td>
                    </tr>
                    <tr className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 font-medium">Admin</td>
                      <td className="px-4 py-3">Full platform access including user management, trash, and activity logs</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3">
                You are responsible for maintaining the confidentiality of your login credentials. You must
                not share your account with others or allow unauthorised access. Notify an Administrator
                immediately if you suspect your account has been compromised.
              </p>
            </section>

            {/* 3 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">3. Acceptable Use</h2>
              <p>When using the Platform, you agree to:</p>
              <ul className="list-disc list-inside mt-2 space-y-1 text-slate-400">
                <li>Upload only photos and videos from Christhood ministry events</li>
                <li>Use the Platform only for its intended ministry media management purpose</li>
                <li>Respect the role-based access controls assigned to your account</li>
                <li>Not upload content that is offensive, unlawful, or unrelated to ministry activity</li>
                <li>Not attempt to circumvent the Platform&rsquo;s security or access controls</li>
                <li>Not share, publish, or redistribute ministry media outside authorised channels</li>
              </ul>
            </section>

            {/* 4 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">4. Content Ownership</h2>
              <p>
                All photos and videos uploaded to the Platform remain the property of the Christhood
                ministry. By uploading content, you confirm that you have the right to upload that material
                for ministry use and that doing so does not infringe any third-party rights.
              </p>
              <p className="mt-3">
                The Platform does not claim ownership of any uploaded media. Content is stored solely for
                internal ministry use and is not shared externally without authorisation from an Admin.
              </p>
            </section>

            {/* 5 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">5. File Statuses and Lifecycle</h2>
              <p>
                Files progress through defined statuses: <code className="text-indigo-300 bg-slate-800/60 px-1.5 py-0.5 rounded text-xs">RAW</code>,{' '}
                <code className="text-indigo-300 bg-slate-800/60 px-1.5 py-0.5 rounded text-xs">EDITING IN PROGRESS</code>,{' '}
                <code className="text-indigo-300 bg-slate-800/60 px-1.5 py-0.5 rounded text-xs">EDITED</code>,{' '}
                <code className="text-indigo-300 bg-slate-800/60 px-1.5 py-0.5 rounded text-xs">PUBLISHED</code>, and{' '}
                <code className="text-indigo-300 bg-slate-800/60 px-1.5 py-0.5 rounded text-xs">ARCHIVED</code>.
                Files deleted by an Admin are moved to a Trash state and are permanently purged from storage
                after 30 days. Purged files cannot be recovered. Admins should exercise caution before
                deleting content.
              </p>
            </section>

            {/* 6 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">6. Help Assistant</h2>
              <p>
                The Platform includes an AI-powered Help Assistant to assist users with navigating the
                system. The assistant is designed to answer questions about Platform functionality only. It
                does not have access to uploaded media files or personal account data. Responses generated
                by the assistant are for guidance purposes and should not be treated as official
                administrative decisions.
              </p>
            </section>

            {/* 7 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">7. Notifications</h2>
              <p>
                The Platform may send you in-app notifications and, if you opt in, browser push
                notifications relating to activity within the Platform. You may adjust your notification
                preferences at any time from your profile settings.
              </p>
            </section>

            {/* 8 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">8. Account Termination</h2>
              <p>
                Administrators may suspend or remove user accounts that violate these Terms or are no
                longer required. Upon termination, your access to the Platform will be revoked. Content
                you have uploaded will remain available to other authorised users unless explicitly deleted.
              </p>
            </section>

            {/* 9 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">9. Disclaimer of Warranties</h2>
              <p>
                The Platform is provided &ldquo;as is&rdquo; for internal ministry use. While we strive
                for reliability, we make no guarantees of uninterrupted availability. We are not liable for
                any loss of data, access interruptions, or damages arising from use of the Platform beyond
                what is required by applicable law.
              </p>
            </section>

            {/* 10 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">10. Changes to These Terms</h2>
              <p>
                We may revise these Terms as the Platform develops. Updated Terms will be published at
                this page. Continued use of the Platform after a revision constitutes acceptance of the
                updated Terms.
              </p>
            </section>

            {/* 11 */}
            <section>
              <h2 className="text-lg font-semibold text-white mb-3">11. Contact</h2>
              <p>
                Questions about these Terms may be directed to the platform administrator at{' '}
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
            <Link href="/privacy"
                  className="text-xs text-slate-500 hover:text-indigo-400 transition-colors">
              Privacy Policy →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
