import { redirect } from 'next/navigation'

/**
 * Sent messages have moved to the Communications Hub (Messages → Sent tab).
 * Redirect all visitors to the new destination.
 */
export default function SentMessagesPage() {
  redirect('/communications/messages')
}
