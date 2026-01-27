// API Client - Get Credentials
// Get authentication credentials from environment variables
// NOTE: Login requires Node.js due to CORS and cookie handling

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

export interface Credentials {
  username: string
  password: string
}

// Load .env from project root when running in Node.js
if (typeof process !== 'undefined' && process.versions?.node) {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  dotenv.config({ path: path.resolve(__dirname, '../../.env') })
}

/**
 * Get credentials from environment
 */
export function getCredentials(): Credentials {
  // Try import.meta.env first (Vite/frontend), then process.env (Node.js)
  const username = (import.meta as any)?.env?.VITE_USER_TESTPAD ||
                   (import.meta as any)?.env?.USER_TESTPAD ||
                   process.env.USER_TESTPAD
  const password = (import.meta as any)?.env?.VITE_PASSWORD_TESTPAD ||
                   (import.meta as any)?.env?.PASSWORD_TESTPAD ||
                   process.env.PASSWORD_TESTPAD

  console.log('🔍 getCredentials() called')
  console.log('   Checking import.meta.env.VITE_USER_TESTPAD:', (import.meta as any)?.env?.VITE_USER_TESTPAD ? '✅ Found' : '❌ Not found')
  console.log('   Checking import.meta.env.USER_TESTPAD:', (import.meta as any)?.env?.USER_TESTPAD ? '✅ Found' : '❌ Not found')
  console.log('   Checking process.env.USER_TESTPAD:', process.env.USER_TESTPAD ? '✅ Found' : '❌ Not found')
  console.log('   Final username:', username ? `✅ "${username}"` : '❌ Not found')
  console.log('   Final password:', password ? '✅ Found (hidden)' : '❌ Not found')

  if (!username || !password) {
    console.error('❌ Credentials not found in environment variables')
    throw new Error('Credentials not found in environment variables')
  }

  console.log('✅ Credentials retrieved successfully')
  return { username, password: password.trim() }
}

// Execute if run directly
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  try {
    const { username, password } = getCredentials()
    console.log('\n✅ getCredentials() works!')
    console.log('Username:', username)
    console.log('Password:', password ? '✅ Found (hidden)' : '❌ Not found')
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message)
    process.exit(1)
  }
}
