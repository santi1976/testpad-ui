// Shared utilities for Vercel serverless functions
import https from 'https'

export function extractCookies(setCookieHeaders) {
  if (!setCookieHeaders || setCookieHeaders.length === 0) return ''
  return setCookieHeaders.map(cookie => cookie.split(';')[0].trim()).join('; ')
}

export function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data,
          cookies: extractCookies(res.headers['set-cookie'] || [])
        })
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

export async function loginToTestpad(userEmail, userPassword) {
  console.log('[loginToTestpad] ========== Starting web login ==========')
  console.log(`[loginToTestpad] Email: ${userEmail || '❌ MISSING'}`)
  console.log(`[loginToTestpad] Password: ${userPassword ? '✅ provided (' + userPassword.length + ' chars)' : '❌ MISSING'}`)
  
  const USERNAME = userEmail
  const PASSWORD = userPassword?.trim()

  if (!USERNAME || !PASSWORD) {
    const missing = []
    if (!USERNAME) missing.push('email')
    if (!PASSWORD) missing.push('password')
    const errorMsg = `User credentials required for Testpad login. Missing: ${missing.join(', ')}`
    console.log(`[loginToTestpad] ❌ ${errorMsg}`)
    throw new Error(errorMsg)
  }

  // Step 1: Get login page
  console.log('[loginToTestpad] Step 1: Getting login page...')
  const loginPage = await httpsRequest({
    hostname: 'app.testpad.com',
    port: 443,
    path: '/login?acct=bitfinex',
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'text/html'
    },
    rejectUnauthorized: false
  })

  console.log(`[loginToTestpad] Login page status: ${loginPage.status}`)
  let cookies = loginPage.cookies
  console.log(`[loginToTestpad] Initial cookies: ${cookies ? cookies.substring(0, 50) + '...' : 'none'}`)

  // Extract CSRF token
  const csrfMatch = loginPage.data.match(/name=['"]csrfmiddlewaretoken['"][^>]*value=['"]([^'"]+)/i)
  if (!csrfMatch) {
    console.log('[loginToTestpad] ❌ Could not find CSRF token in login page')
    throw new Error('Could not find CSRF token in login page')
  }
  const csrfToken = csrfMatch[1]
  console.log(`[loginToTestpad] ✅ CSRF token found: ${csrfToken.substring(0, 10)}...`)

  // Step 2: Submit login
  console.log('[loginToTestpad] Step 2: Submitting login form...')
  const formData = `csrfmiddlewaretoken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(USERNAME)}&password=${encodeURIComponent(PASSWORD)}&js=y&next=`

  const loginResponse = await httpsRequest({
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
      'Cookie': cookies
    },
    rejectUnauthorized: false
  }, formData)

  console.log(`[loginToTestpad] Login response status: ${loginResponse.status}`)

  if (loginResponse.cookies) {
    cookies = [cookies, loginResponse.cookies].filter(c => c).join('; ')
  }

  if (loginResponse.status !== 302) {
    console.log(`[loginToTestpad] ❌ Login failed - expected 302, got ${loginResponse.status}`)
    console.log(`[loginToTestpad] Response data preview: ${loginResponse.data?.substring(0, 200)}`)
    throw new Error(`Login failed with status ${loginResponse.status}. Check email/password.`)
  }
  console.log('[loginToTestpad] ✅ Login submitted successfully (302 redirect)')

  // Step 3: Follow redirects
  console.log('[loginToTestpad] Step 3: Following redirects...')
  let location = loginResponse.headers.location
  let redirectCount = 0

  while (location && redirectCount < 5) {
    let host = 'bitfinex.testpad.com'
    let path = location

    if (location.startsWith('http')) {
      const url = new URL(location)
      host = url.hostname
      path = url.pathname + url.search
    }

    console.log(`[loginToTestpad] Redirect ${redirectCount + 1}: ${host}${path}`)

    const redirect = await httpsRequest({
      hostname: host,
      port: 443,
      path: path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Cookie': cookies
      },
      rejectUnauthorized: false
    })

    if (redirect.cookies) {
      cookies = [cookies, redirect.cookies].filter(c => c).join('; ')
    }

    if (redirect.status === 200) {
      console.log(`[loginToTestpad] ✅ Redirect complete (status 200)`)
      break
    }
    location = redirect.headers.location
    redirectCount++
  }

  // Extract final CSRF token from cookies
  const cookieCsrfMatch = cookies.match(/csrftoken=([^;]+)/)
  const finalCsrfToken = cookieCsrfMatch ? cookieCsrfMatch[1] : csrfToken

  console.log('[loginToTestpad] ========== ✅ Web login complete ==========')
  console.log(`[loginToTestpad] Final cookies length: ${cookies.length}`)
  console.log(`[loginToTestpad] Final CSRF token: ${finalCsrfToken.substring(0, 10)}...`)

  return {
    cookies,
    csrfToken: finalCsrfToken
  }
}
