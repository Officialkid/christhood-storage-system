import { redirect } from 'next/navigation'

/**
 * The transfers inbox has moved to the Communications Hub.
 * Redirect all visitors to the new destination.
 */
export default function TransferInboxPage() {
  redirect('/communications/transfers')
}
