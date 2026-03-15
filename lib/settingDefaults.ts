/**
 * lib/settingDefaults.ts
 *
 * Single source of truth for AppSetting default values.
 * Kept in lib/ (not in a route file) so it can be imported by any server-side
 * module without triggering Next.js's "invalid Route export" build error.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  // ── General ───────────────────────────────────────────────────────────────
  system_name:              'Christhood CMMS',
  system_tagline:           'Professional Media Management',
  organization_name:        'Christhood',
  admin_contact_email:      '',
  system_timezone:          'Africa/Nairobi',
  date_format:              'DD/MM/YYYY',
  language:                 'en',
  logo_url:                 '',

  // ── Storage & Files ───────────────────────────────────────────────────────
  archive_threshold_months: '6',
  trash_retention_days:     '30',
  max_file_size_mb:         '500',
  allowed_photo_types:      'jpg,png,heic,raw,tiff',
  allowed_video_types:      'mp4,mov,avi,mkv',
  allowed_doc_types:        'pdf,docx,xlsx,pptx',
  storage_warning_gb:       '100',
  duplicate_detection:      'true',
  auto_thumbnails:          'true',

  // ── User & Access ─────────────────────────────────────────────────────────
  default_role:               'UPLOADER',
  allow_self_registration:    'false',
  session_timeout_minutes:    '120',
  max_login_attempts:         '10',
  lockout_duration_minutes:   '30',
  password_min_length:        '8',
  password_require_uppercase: 'true',
  password_require_number:    'true',
  password_require_special:   'false',

  // ── Notifications ─────────────────────────────────────────────────────────
  from_email:            '',
  from_name:             'Christhood CMMS',
  reply_to_email:        '',
  email_footer_text:     '',
  weekly_digest_enabled: 'false',
  digest_time:           '08:00',

  // ── AI Assistant (Zara) ───────────────────────────────────────────────────
  zara_enabled:               'true',
  zara_conversation_logging:  'false',
  zara_log_retention_days:    '90',
  zara_rate_limit_per_hour:   '30',
  zara_display_name:          'Zara',
  zara_greeting:              "Hello! I'm Zara, your intelligent media management assistant. How can I help you today?",

  // ── Transfers & Communications ────────────────────────────────────────────
  transfer_expiry_pending_days:   '60',
  transfer_expiry_completed_days: '30',
  max_transfer_size_gb:           '10',
  share_link_default_expiry_days: '7',
  share_link_max_downloads:       '0',

  // ── Internal: scheduled job last-run timestamps ───────────────────────────
  job_trash_purge_last_run:    '',
  job_archive_last_run:        '',
  job_transfer_purge_last_run: '',
  job_log_cleanup_last_run:    '',
}
