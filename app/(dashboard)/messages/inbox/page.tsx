import { redirect } from 'next/navigation'

/**
 * The messages inbox has moved to the Communications Hub.
 * Redirect all visitors to the new destination.
 */
export default function MessagesInboxPage() {
  redirect('/communications/messages')
}
