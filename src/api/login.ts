// API Client - Login
// Login to Testpad and retrieve cookies and CSRF token
// NOTE: Requires Node.js due to CORS and cookie handling

import https from 'https'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import path from 'path'
import { getCredentials } from './getCredentials'

interface LoginPageResponse {
  cookies: string
  html: string
  status: number
}

interface LoginResponse {
  status: number
  cookies: string
  location?: string
}

interface RedirectResponse {
  status: number
  location?: string
  cookies: string
}

interface FinalPageResponse {
  html: string
  cookies: string
}

export interface LoginResult {
  cookies: string
  csrfToken: string
}

/**
 * Extract cookies from Set-Cookie headers
 */
function extractCookies(setCookieHeaders: string[]): string {
  if (!setCookieHeaders || setCookieHeaders.length === 0) return ''
  return setCookieHeaders.map(cookie => cookie.split(';')[0].trim()).join('; ')
}

/**
 * Login to Testpad and retrieve session cookies and CSRF token
 */
export async function login(verbose = false): Promise<LoginResult> {
  const { username, password } = getCredentials()

  if (verbose) {
    console.log('🔐 Login to Testpad\n')
    console.log('='.repeat(60))
    console.log(`👤 Username: ${username}\n`)
  }

  // Step 1: Get login page
  if (verbose) console.log('📡 Step 1: Getting login page...')
  const loginPageResponse = await new Promise<LoginPageResponse>((resolve, reject) => {
    const req = https.request({
      hostname: 'app.testpad.com',
      port: 443,
      path: '/login?acct=bitfinex',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      rejectUnauthorized: false
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        resolve({
          cookies: extractCookies(res.headers['set-cookie'] || []),
          html: data,
          status: res.statusCode || 0
        })
      })
    })
    req.on('error', reject)
    req.end()
  })

  if (verbose) {
    console.log(`   ✅ Status: ${loginPageResponse.status}`)
    console.log(`   🍪 Initial cookies: ${loginPageResponse.cookies ? 'Received' : 'None'}\n`)
  }

  let currentCookies = loginPageResponse.cookies

  // Extract CSRF token from login page
  const csrfTokenMatch = loginPageResponse.html.match(/name=['"]csrfmiddlewaretoken['"][^>]*value=['"]([^'"]+)/i) ||
                        loginPageResponse.html.match(/csrfmiddlewaretoken['"][^>]*value=['"]([^'"]+)/i)
  let csrfToken = csrfTokenMatch ? csrfTokenMatch[1] : null

  if (!csrfToken) {
    if (verbose) {
      console.error('⚠️  Could not extract CSRF token from login page HTML')
      console.error('HTML length:', loginPageResponse.html.length)
      console.error('HTML preview (first 500 chars):', loginPageResponse.html.substring(0, 500))
    }
    throw new Error('Could not find CSRF token in login page')
  }

  if (verbose) console.log(`   🔑 CSRF Token extracted: ${csrfToken.substring(0, 20)}...\n`)

  // Step 2: Submit login form
  if (verbose) console.log('📡 Step 2: Submitting login form...')
  const formData = `csrfmiddlewaretoken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&js=y&next=`

  const loginResponse = await new Promise<LoginResponse>((resolve, reject) => {
    const req = https.request({
      hostname: 'app.testpad.com',
      port: 443,
      path: '/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(formData),
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://app.testpad.com/login?acct=bitfinex',
        'Origin': 'https://app.testpad.com',
        'Cookie': currentCookies
      },
      rejectUnauthorized: false
    }, (res) => {
      res.on('data', () => {})
      res.on('end', () => {
        const newCookies = extractCookies(res.headers['set-cookie'] || [])
        const allCookies = [currentCookies, newCookies].filter(c => c).join('; ')
        resolve({
          status: res.statusCode || 0,
          cookies: allCookies,
          location: res.headers.location
        })
      })
    })
    req.on('error', reject)
    req.write(formData)
    req.end()
  })

  currentCookies = loginResponse.cookies

  if (verbose) {
    console.log(`   ✅ Status: ${loginResponse.status}`)
    console.log(`   🍪 Updated cookies: ${loginResponse.cookies ? 'Received' : 'None'}`)
    console.log(`   📍 Redirect location: ${loginResponse.location || 'None'}\n`)
  }

  // Step 3: Follow redirects until we get 200
  if (loginResponse.status !== 302 || !loginResponse.location) {
    if (verbose) console.log(`❌ Login failed: Status ${loginResponse.status}`)
    throw new Error(`Login failed with status ${loginResponse.status}`)
  }

  if (verbose) {
    console.log(`   ✅ Login successful! Redirect to: ${loginResponse.location}`)
    console.log('📡 Step 3: Following redirects...\n')
  }

  let currentLocation = loginResponse.location
  let redirectCount = 0
  const maxRedirects = 5

  while (redirectCount < maxRedirects) {
    let redirectHost = 'bitfinex.testpad.com'
    let redirectPath = currentLocation

    if (currentLocation.startsWith('http')) {
      const redirectUrl = new URL(currentLocation)
      redirectHost = redirectUrl.hostname
      redirectPath = redirectUrl.pathname + redirectUrl.search
    } else if (currentLocation.startsWith('/')) {
      redirectPath = currentLocation
    }

    if (verbose) console.log(`   → Redirect ${redirectCount + 1}: ${redirectHost}${redirectPath}`)

    const redirectResponse = await new Promise<RedirectResponse>((resolve, reject) => {
      const req = https.request({
        hostname: redirectHost,
        port: 443,
        path: redirectPath,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Cookie': currentCookies
        },
        rejectUnauthorized: false
      }, (res) => {
        res.on('data', () => {})
        res.on('end', () => {
          const newCookies = extractCookies(res.headers['set-cookie'] || [])
          if (newCookies) {
            currentCookies = [currentCookies, newCookies].filter(c => c).join('; ')
          }
          resolve({
            status: res.statusCode || 0,
            location: res.headers.location,
            cookies: currentCookies
          })
        })
      })
      req.on('error', reject)
      req.end()
    })

    if (redirectResponse.status === 200) {
      if (verbose) console.log(`   ✅ Final page reached (200 OK)!\n`)

      // Get HTML to extract final CSRF token
      const finalPageResponse = await new Promise<FinalPageResponse>((resolve, reject) => {
        const req = https.request({
          hostname: redirectHost,
          port: 443,
          path: redirectPath,
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Cookie': currentCookies
          },
          rejectUnauthorized: false
        }, (res) => {
          let data = ''
          res.on('data', (chunk) => { data += chunk })
          res.on('end', () => {
            resolve({
              html: data,
              cookies: extractCookies(res.headers['set-cookie'] || [])
            })
          })
        })
        req.on('error', reject)
        req.end()
      })

      // Extract final CSRF token from HTML
      if (finalPageResponse.html) {
        const finalCsrfMatch = finalPageResponse.html.match(/name=['"]csrfmiddlewaretoken['"][^>]*value=['"]([^'"]+)/i) ||
                               finalPageResponse.html.match(/csrfmiddlewaretoken['"][^>]*value=['"]([^'"]+)/i)
        if (finalCsrfMatch && finalCsrfMatch[1]) {
          csrfToken = finalCsrfMatch[1]
          if (verbose) console.log(`   🔑 Final CSRF token extracted from page\n`)
        }
      }

      break
    } else if (redirectResponse.status === 302 && redirectResponse.location) {
      currentLocation = redirectResponse.location
      redirectCount++
    } else {
      break
    }
  }

  // Try to extract CSRF token from cookies as fallback
  const cookieCsrfMatch = currentCookies.match(/csrftoken=([^;]+)/)
  const finalCsrfToken = cookieCsrfMatch ? cookieCsrfMatch[1] : csrfToken

  if (!finalCsrfToken) {
    throw new Error('Could not extract CSRF token')
  }

  return { cookies: currentCookies, csrfToken: finalCsrfToken }
}

// Execute if run directly
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') })

  login(true).then(({ cookies, csrfToken }) => {
    console.log('\n✅ LOGIN SUCCESSFUL!')
    console.log('Cookies:', cookies.substring(0, 50) + '...')
    console.log('CSRF Token:', csrfToken.substring(0, 30) + '...')
  }).catch(error => {
    console.error('❌ Error:', (error as Error).message)
    process.exit(1)
  })
}
