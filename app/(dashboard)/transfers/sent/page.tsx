import { redirect } from 'next/navigation'

/**
 * Sent transfers have moved to the Communications Hub (Transfers → Sent tab).
 * Redirect all visitors to the new destination.
 */
export default function SentTransfersPage() {
  redirect('/communications/transfers')
}
