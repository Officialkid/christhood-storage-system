// ─────────────────────────────────────────────────────────────────────────────
// lib/assistant/safety/action-classifier.ts
//
// Classifies every action Zara can take by damage level and generates a full
// impact-disclosure warning shown in the confirmation card before any action runs.
//
// Used by:
//   - app/api/assistant/route.ts  — injects ActionWarning into the SSE event
//   - components/ChatbotWidget.tsx — renders the enhanced confirmation card
//   - lib/assistant/safety/preservation.ts — determines snapshot / rollback TTL
// ─────────────────────────────────────────────────────────────────────────────

// ── Risk levels ───────────────────────────────────────────────────────────────
export enum ActionRiskLevel {
  /** Reversible, no data loss, affects only metadata. */
  SAFE = 'SAFE',
  /** Reversible within 30 days, affects file status or folder structure. */
  MODERATE = 'MODERATE',
  /** Affects user accounts, passwords, access permissions. */
  SENSITIVE = 'SENSITIVE',
  /** Moves data, creates or deletes records. */
  HIGH = 'HIGH',
  /** Permanent or large-scale data operations — requires typed "CONFIRM" + countdown. */
  CRITICAL = 'CRITICAL',
}

// ── Impact disclosure structure ───────────────────────────────────────────────
export interface ActionWarning {
  riskLevel:           ActionRiskLevel
  /** Bold warning shown at the top of the confirmation card. */
  headline:            string
  /** Bullet list of exact consequences. */
  whatWillHappen:      string[]
  /** Reassurances — what is NOT affected. */
  whatWillNOTHappen:   string[]
  canBeUndone:         boolean
  /** Exact steps to reverse this action, or null if irreversible. */
  howToUndo:           string | null
  /** Shown in subtle grey — e.g. "A snapshot will be saved before this action." */
  preservationNote:    string | null
}

// ── Static risk map ───────────────────────────────────────────────────────────
const RISK_MAP: Record<string, ActionRiskLevel> = {
  changeFileStatus:     ActionRiskLevel.SAFE,
  createEvent:          ActionRiskLevel.SAFE,
  flagIssueToAdmin:     ActionRiskLevel.SAFE,
  unlockUserAccount:    ActionRiskLevel.MODERATE,
  restoreFileFromTrash: ActionRiskLevel.MODERATE,
  resetUserPassword:    ActionRiskLevel.SENSITIVE,
}

/**
 * Returns the risk level for a given tool name.
 * Unknown tools default to HIGH — safe over-approximation.
 */
export function classifyAction(toolName: string): ActionRiskLevel {
  return RISK_MAP[toolName] ?? ActionRiskLevel.HIGH
}

/**
 * Builds a full ActionWarning for a given tool + args.
 * All strings are pre-substituted with values from args so the card can render
 * them directly without any further logic.
 */
export function getActionWarning(
  toolName: string,
  args: Record<string, unknown>,
): ActionWarning {
  const riskLevel = classifyAction(toolName)

  switch (toolName) {

    // ── changeFileStatus ───────────────────────────────────────────────────
    case 'changeFileStatus':
      return {
        riskLevel,
        headline: "This will update the file's workflow status",
        whatWillHappen: [
          `"${args.fileName ?? 'the file'}" will move from ${args.currentStatus ?? 'its current status'} → ${args.newStatus ?? 'the new status'}`,
          'The change is recorded in the Activity Log instantly',
          'All team members with access will see the new status immediately',
        ],
        whatWillNOTHappen: [
          'The file itself will NOT be moved, copied, or deleted',
          'Download links will NOT be affected',
          'Version history will NOT be changed',
          'No emails or notifications will be sent',
        ],
        canBeUndone: true,
        howToUndo:
          'Ask Zara to change the status back, or change it manually on the file detail page. No data is lost.',
        preservationNote:
          'A snapshot of the current file status will be saved to the Zara Action Log before this change.',
      }

    // ── createEvent ────────────────────────────────────────────────────────
    case 'createEvent':
      return {
        riskLevel,
        headline: 'This will create a new empty event folder',
        whatWillHappen: [
          `A new event "${args.eventName ?? 'the event'}" will be created in ${args.categoryName ?? 'the selected category'}`,
          'It will appear in the folder browser immediately',
          'Uploaders can be assigned to this event via Admin → Users',
          ...(Array.isArray(args.subfolders) && args.subfolders.length > 0
            ? [`${args.subfolders.length} subfolder(s) will be created inside it: ${(args.subfolders as string[]).join(', ')}`]
            : []),
        ],
        whatWillNOTHappen: [
          'No existing files or folders will be affected',
          'No users will be automatically assigned to this event',
          'No notifications will be sent to the team',
        ],
        canBeUndone: true,
        howToUndo:
          'The event can be deleted from Admin → Folder Hierarchy. Only delete it if it contains no files.',
        preservationNote: null,
      }

    // ── flagIssueToAdmin ───────────────────────────────────────────────────
    case 'flagIssueToAdmin':
      return {
        riskLevel,
        headline: 'This will send a message to all admin users on your behalf',
        whatWillHappen: [
          `A message will be sent to all admin users right now`,
          `Issue type: ${args.issueType ?? 'General'}`,
          args.urgency === 'URGENT'
            ? 'An email will be sent to each admin immediately (URGENT)'
            : 'An in-app notification will be sent to the admin(s)',
        ],
        whatWillNOTHappen: [
          'Your files and account will NOT be changed in any way',
          'Other team members (non-admins) will NOT be notified',
          'This will NOT automatically resolve your issue',
        ],
        canBeUndone: false,
        howToUndo:
          'The message cannot be recalled. You can follow up with the admin directly if you sent it by mistake.',
        preservationNote: null,
      }

    // ── unlockUserAccount ──────────────────────────────────────────────────
    case 'unlockUserAccount':
      return {
        riskLevel,
        headline: "This will re-enable login access for this account",
        whatWillHappen: [
          `${args.userName ?? "The user"}'s account lock will be removed immediately`,
          'Their failed login attempt counter will be reset to zero',
          'They will be able to log in right away',
        ],
        whatWillNOTHappen: [
          'Their password will NOT be changed',
          'Their role and permissions will NOT change',
          'Their files and data will NOT be affected',
        ],
        canBeUndone: true,
        howToUndo:
          "An account can be locked again manually from Admin → Users if needed.",
        preservationNote:
          "A snapshot of the account's locked state will be saved to the Zara Action Log.",
      }

    // ── resetUserPassword ──────────────────────────────────────────────────
    case 'resetUserPassword':
      return {
        riskLevel,
        headline: 'This will immediately send a password reset email',
        whatWillHappen: [
          `A reset email will be sent to ${args.userEmail ?? "the user's registered email address"}`,
          'Any previous unused reset links will be invalidated first',
          'The new link expires after 24 hours',
          'Their current password continues to work until they use the reset link',
        ],
        whatWillNOTHappen: [
          'Their account will NOT be locked',
          'Their files and data will NOT be affected',
          'They will NOT lose access until they choose to click the reset link',
        ],
        canBeUndone: false,
        howToUndo:
          'You cannot cancel the email once sent. The user can ignore it and their current password remains valid.',
        preservationNote: null,
      }

    // ── restoreFileFromTrash ───────────────────────────────────────────────
    case 'restoreFileFromTrash':
      return {
        riskLevel,
        headline: 'This will recover a deleted file back into the system',
        whatWillHappen: [
          `"${args.fileName ?? 'the file'}" will be moved out of the trash`,
          'It will be returned to its original event folder',
          'It will return to its pre-deletion status',
          'The original uploader will receive an in-app notification',
        ],
        whatWillNOTHappen: [
          'No other files will be affected',
          "The file's version history will NOT be changed",
          'Download history will NOT be cleared',
        ],
        canBeUndone: true,
        howToUndo:
          'The file can be deleted again from the file detail page if this was a mistake.',
        preservationNote:
          'A snapshot of the trash record and file state will be saved to the Zara Action Log before restoring.',
      }

    // ── Future CRITICAL bulk-delete example ───────────────────────────────
    case 'deleteEventFolder': return {
      riskLevel: ActionRiskLevel.CRITICAL,
      headline: '⚠️ This will permanently remove an entire event folder',
      whatWillHappen: [
        `All files in the event will be moved to trash`,
        'Files will be permanently deleted after 30 days unless restored one by one',
        'The folder structure will be removed from the browser immediately',
        'Activity log records will be preserved',
      ],
      whatWillNOTHappen: [
        'Files are NOT immediately gone — they go to trash first',
        'Activity log records are NOT deleted',
        'Other events and folders are NOT affected',
      ],
      canBeUndone: true,
      howToUndo:
        'Go to Admin → Trash within 30 days and restore files individually before the purge date.',
      preservationNote:
        'A complete file manifest (all file IDs, names, sizes, statuses) will be saved to the Zara Action Log before deletion.',
    }

    // ── Unknown / future tools ──────────────────────────────────────────────
    default:
      return {
        riskLevel,
        headline: 'This action will modify the system',
        whatWillHappen: [
          'The requested changes will be applied',
          'All changes are recorded in the Activity Log',
        ],
        whatWillNOTHappen: [
          'Unrelated data will NOT be affected',
        ],
        canBeUndone: riskLevel !== ActionRiskLevel.CRITICAL,
        howToUndo:
          riskLevel !== ActionRiskLevel.CRITICAL
            ? 'Contact your admin to reverse this change if needed.'
            : null,
        preservationNote:
          'A snapshot of affected records will be saved to the Zara Action Log before this executes.',
      }
  }
}

// ── Visual treatment config — consumed by ChatbotWidget ──────────────────────

export interface RiskStyle {
  cardBorder:  string   // Tailwind border class
  cardBg:      string   // Tailwind background class
  headerIcon:  string   // emoji / symbol for the header
  headlineColor: string // Tailwind text class for the headline
  requiresTypedConfirm: boolean   // CRITICAL — must type "CONFIRM"
  requiresCountdown:    boolean   // CRITICAL — 5-second delay after typing
}

export const RISK_STYLES: Record<ActionRiskLevel, RiskStyle> = {
  [ActionRiskLevel.SAFE]: {
    cardBorder:           'border-green-300',
    cardBg:               'bg-green-50',
    headerIcon:           '✅',
    headlineColor:        'text-slate-700',
    requiresTypedConfirm: false,
    requiresCountdown:    false,
  },
  [ActionRiskLevel.MODERATE]: {
    cardBorder:           'border-blue-300',
    cardBg:               'bg-blue-50',
    headerIcon:           'ℹ️',
    headlineColor:        'text-blue-800',
    requiresTypedConfirm: false,
    requiresCountdown:    false,
  },
  [ActionRiskLevel.SENSITIVE]: {
    cardBorder:           'border-amber-400',
    cardBg:               'bg-amber-50',
    headerIcon:           '⚠️',
    headlineColor:        'text-amber-800',
    requiresTypedConfirm: false,
    requiresCountdown:    false,
  },
  [ActionRiskLevel.HIGH]: {
    cardBorder:           'border-orange-400',
    cardBg:               'bg-orange-50',
    headerIcon:           '⚠️',
    headlineColor:        'text-orange-800',
    requiresTypedConfirm: false,
    requiresCountdown:    false,
  },
  [ActionRiskLevel.CRITICAL]: {
    cardBorder:           'border-red-500',
    cardBg:               'bg-red-50',
    headerIcon:           '🛑',
    headlineColor:        'text-red-800',
    requiresTypedConfirm: true,
    requiresCountdown:    true,
  },
}
