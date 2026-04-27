import { describe, expect, it } from 'vitest'

import { sanitizePath } from '../../lib/sanitize'
import { makeEventR2Key, sanitizeFilename } from '../../lib/uploadNaming'

describe('core utility behavior', () => {
  it('removes raw CRLF from reflected path values', () => {
    expect(sanitizePath('uploads\r\nX-Injected: 1')).toBe('uploadsX-Injected: 1')
  })

  it('removes percent-encoded CRLF from reflected path values', () => {
    expect(sanitizePath('report%0d%0Aset-cookie')).toBe('reportset-cookie')
  })

  it('sanitizes filenames by trimming and removing unsafe characters', () => {
    expect(sanitizeFilename('  my*unsafe?file.jpg  ')).toBe('myunsafefile.jpg')
  })

  it('preserves allowed filename characters', () => {
    expect(sanitizeFilename('Photo (Final) [v2].jpg')).toBe('Photo (Final) [v2].jpg')
  })

  it('builds event R2 keys with sanitized file names', () => {
    expect(makeEventR2Key('evt_123', '  launch?.png  ')).toBe('events/evt_123/launch.png')
  })
})
