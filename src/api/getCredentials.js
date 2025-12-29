// API Client - Get Credentials
// Get authentication credentials from environment variables
// NOTE: Login requires Node.js due to CORS and cookie handling

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load .env from project root when running in Node.js
if (typeof process !== 'undefined' && process.versions?.node) {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  dotenv.config({ path: path.resolve(__dirname, '../../.env') })
}

/**
 * Get credentials from environment
 * @returns {Object} - { username, password }
 */
export function getCredentials() {
  // Try import.meta.env first (Vite/frontend), then process.env (Node.js)
  const username = import.meta?.env?.VITE_USER_TESTPAD || import.meta?.env?.USER_TESTPAD || process.env.USER_TESTPAD
  const password = import.meta?.env?.VITE_PASSWORD_TESTPAD || import.meta?.env?.PASSWORD_TESTPAD || process.env.PASSWORD_TESTPAD

  console.log('🔍 getCredentials() called')
  console.log('   Checking import.meta.env.VITE_USER_TESTPAD:', import.meta?.env?.VITE_USER_TESTPAD ? '✅ Found' : '❌ Not found')
  console.log('   Checking import.meta.env.USER_TESTPAD:', import.meta?.env?.USER_TESTPAD ? '✅ Found' : '❌ Not found')
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

/**
 * NOTE: The complete login function is in test files (test-assign-and-send-email.js)
 * because it requires Node.js to handle cookies and follow redirects.
 * 
 * To use from frontend, you would need:
 * 1. Create a backend endpoint that handles login
 * 2. Or use a proxy that handles cookies
 * 
 * The login function returns:
 * { cookies: string, csrfToken: string }
 */

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
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  }
}

