import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const dir = 'test-files'
if (!existsSync(dir)) mkdirSync(dir)

// Minimal valid JPEG header (100x100 pixels)
const jpgHeader = Buffer.from([
  0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,
  0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xD9
])

// test-photo.jpg ~50 KB
writeFileSync(join(dir, 'test-photo.jpg'), Buffer.concat([jpgHeader, Buffer.alloc(50 * 1024, 0xAB)]))
console.log('✓ test-photo.jpg')

// test-video.mp4 ~1 MB (minimal ftyp box — not a fully valid video, but uploadable)
const mp4 = Buffer.alloc(1024 * 1024)
mp4.writeUInt32BE(32, 0)
mp4.write('ftypisom', 4, 'ascii')
writeFileSync(join(dir, 'test-video.mp4'), mp4)
console.log('✓ test-video.mp4')

// test-large.jpg ~12 MB
writeFileSync(join(dir, 'test-large.jpg'), Buffer.concat([jpgHeader, Buffer.alloc(12 * 1024 * 1024, 0xCC)]))
console.log('✓ test-large.jpg (~12 MB)')

const files = readdirSync(dir).map(f => {
  const mb = (statSync(join(dir, f)).size / 1024 / 1024).toFixed(2)
  return `  ${f.padEnd(20)} ${mb} MB`
})
console.log('\nFiles in test-files/:\n' + files.join('\n'))
