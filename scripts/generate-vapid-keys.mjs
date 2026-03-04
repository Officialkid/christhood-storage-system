#!/usr/bin/env node
/**
 * scripts/generate-vapid-keys.mjs
 *
 * Run once to generate VAPID keys for Web Push notifications.
 * Usage:  node scripts/generate-vapid-keys.mjs
 *
 * Copy the output into your .env file.
 */

import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log('\n✅  VAPID Keys generated — add these to your .env file:\n')
console.log(`VAPID_PUBLIC_KEY="${keys.publicKey}"`)
console.log(`VAPID_PRIVATE_KEY="${keys.privateKey}"`)
console.log(`VAPID_SUBJECT="mailto:admin@christhood.org"`)
console.log('\nPublic key (for browser):')
console.log(keys.publicKey)
console.log('\nNEVER commit the private key to version control.\n')
