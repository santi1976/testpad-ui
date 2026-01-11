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

export async function loginToTestpad() {
  const USERNAME = process.env.USER_TESTPAD
  const PASSWORD = process.env.PASSWORD_TESTPAD?.trim()

  if (!USERNAME || !PASSWORD) {
    throw new Error('USER_TESTPAD and PASSWORD_TESTPAD must be set in environment variables')
  }

  // Step 1: Get login page
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

  let cookies = loginPage.cookies
  
  // Extract CSRF token
  const csrfMatch = loginPage.data.match(/name=['"]csrfmiddlewaretoken['"][^>]*value=['"]([^'"]+)/i)
  if (!csrfMatch) {
    throw new Error('Could not find CSRF token in login page')
  }
  const csrfToken = csrfMatch[1]

  // Step 2: Submit login
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

  if (loginResponse.cookies) {
    cookies = [cookies, loginResponse.cookies].filter(c => c).join('; ')
  }

  if (loginResponse.status !== 302) {
    throw new Error(`Login failed with status ${loginResponse.status}`)
  }

  // Step 3: Follow redirects
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
    
    if (redirect.status === 200) break
    location = redirect.headers.location
    redirectCount++
  }

  // Extract final CSRF token from cookies
  const cookieCsrfMatch = cookies.match(/csrftoken=([^;]+)/)
  const finalCsrfToken = cookieCsrfMatch ? cookieCsrfMatch[1] : csrfToken

  return {
    cookies,
    csrfToken: finalCsrfToken
  }
}
