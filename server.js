// server.js - Backend proxy for Testpad API
// Handles login and API calls server-side to avoid browser CORS/cookie issues
// Run with: node server.js

import express from 'express'
import https from 'https'
import { createServer as createViteServer } from 'vite'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const isProduction = process.env.NODE_ENV === 'production'

const PORT = process.env.PORT || 5173
const COMPANY_OID = process.env.COMPANY_OID

if (!COMPANY_OID) {
  console.error('❌ COMPANY_OID must be set in .env')
  process.exit(1)
}

// Per-user session cache (in production, use Redis or similar)
const userSessions = new Map() // email -> { cookies, csrfToken, lastLogin }

function extractCookies(setCookieHeaders) {
  if (!setCookieHeaders || setCookieHeaders.length === 0) return ''
  return setCookieHeaders.map(cookie => cookie.split(';')[0].trim()).join('; ')
}

function httpsRequest(options, body = null) {
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

async function loginToTestpad(userEmail, userPassword) {
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

  // Step 2: Submit login with user's credentials
  const formData = `csrfmiddlewaretoken=${encodeURIComponent(csrfToken)}&email=${encodeURIComponent(userEmail)}&password=${encodeURIComponent(userPassword)}&js=y&next=`

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

  const session = {
    cookies,
    csrfToken: finalCsrfToken,
    lastLogin: Date.now()
  }

  userSessions.set(userEmail, session)
  return session
}

async function ensureLoggedIn(userEmail, userPassword) {
  if (!userEmail || !userPassword) {
    throw new Error('User credentials required. Please log in with email and password.')
  }
  // Re-login if session is older than 10 minutes or doesn't exist
  const SESSION_TTL = 10 * 60 * 1000
  const session = userSessions.get(userEmail.toLowerCase())
  if (!session || !session.cookies || !session.lastLogin || (Date.now() - session.lastLogin) > SESSION_TTL) {
    return await loginToTestpad(userEmail.toLowerCase(), userPassword)
  }
  return session
}

async function startServer() {
  const app = express()
  app.use(express.json())

  // API endpoint: Validate user login (Email + API Token)
  app.post('/api/login', async (req, res) => {
    try {
      const { email, apiToken } = req.body

      if (!email || !apiToken) {
        return res.status(400).json({ error: 'Email and API token are required' })
      }

      // Validate domain
      const allowedDomains = ['bitfinex.com', 'tether.com']
      const emailDomain = email.split('@')[1]?.toLowerCase()

      if (!allowedDomains.includes(emailDomain)) {
        return res.status(400).json({ error: 'Email must be from @bitfinex.com or @tether.com' })
      }

      // Validate API token by making a test API call
      try {
        const testResponse = await httpsRequest({
          hostname: 'api.testpad.com',
          port: 443,
          path: '/api/v1/projects',
          method: 'GET',
          headers: {
            'Authorization': `apikey ${apiToken}`,
            'Accept': 'application/json'
          },
          rejectUnauthorized: false
        })

        if (testResponse.status === 200) {
          // Token is valid. Now validate password if provided.
          if (req.body.password) {
            try {
              await loginToTestpad(email, req.body.password)
              // Both Token and Password are valid
              res.json({ valid: true, email })
            } catch (loginError) {
              res.status(401).json({ valid: false, error: 'Invalid credentials' })
            }
          } else {
            res.status(400).json({ valid: false, error: 'Password is required' })
          }
        } else {
          res.status(401).json({ valid: false, error: 'Invalid API token' })
        }
      } catch (apiError) {
        res.status(401).json({ valid: false, error: 'Invalid API token' })
      }
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // API endpoint: Assign run and send email
  // Uses the logged-in user's credentials to create a Testpad session
  app.post('/api/assign-and-send', async (req, res) => {
    try {
      const { scriptId, runId, targetEmail, scriptName, senderEmail, senderPassword } = req.body

      if (!scriptId || !runId || !targetEmail || !scriptName) {
        return res.status(400).json({ error: 'Missing required fields' })
      }

      if (!senderEmail || !senderPassword) {
        return res.status(401).json({ error: 'User credentials required. Please log in with email and password.' })
      }

      const { cookies, csrfToken } = await ensureLoggedIn(senderEmail.toLowerCase(), senderPassword)

      // Generate ObjectId
      const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
      const random = Math.random().toString(16).substring(2, 18).padStart(16, '0')
      const runOid = timestamp + random

      const now = new Date()
      const runDate = now.toISOString()
      const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

      // Step 1: setmeta
      const setmetaBody = JSON.stringify({
        data: {
          _id: { $oid: runOid },
          id: runId.toString(),
          scriptOid: { $oid: scriptId.toString() },
          companyOid: { $oid: COMPANY_OID },
          retestOf: null,
          inherit: false,
          supercededBy: null,
          created: { $date: runDate },
          modified: { $date: runDate },
          state: 'new',
          assignee: 0,
          emailSentTo: targetEmail,
          fields: { '0': runId.toString(), '1': targetEmail, '2': dateStr, '3': timeStr, '4': 'ALL', '5': '' },
          results: {},
          files: {},
          progressCache: null,
          fielddata: [
            { raw: runId.toString() },
            { raw: targetEmail },
            { raw: dateStr, date: { $date: runDate } },
            { raw: timeStr },
            { raw: 'ALL' },
            { raw: '' }
          ]
        }
      })

      const setmetaResponse = await httpsRequest({
        hostname: 'bitfinex.testpad.com',
        port: 443,
        path: `/a/script/${scriptId}/run/${runId}/setmeta`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(setmetaBody),
          'Accept': 'application/json',
          'Cookie': cookies,
          'X-Csrftoken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `https://bitfinex.testpad.com/script/${scriptId}`,
          'Origin': 'https://bitfinex.testpad.com'
        },
        rejectUnauthorized: false
      }, setmetaBody)

      if (setmetaResponse.status >= 400) {
        return res.status(setmetaResponse.status).json({ error: 'Failed to assign run', details: setmetaResponse.data })
      }

      // Step 2: sendemail
      const senderName = senderEmail.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')

      const sendemailBody = JSON.stringify({
        data: {
          to: targetEmail,
          subject: `Guest Testing Invitation: ${scriptName} (test run #${runId})`,
          previewContents: `${senderName} (${senderEmail}) is inviting you to use Testpad as a Guest Tester.`,
          intro: `Hi\n\n${senderName} (${senderEmail}) is inviting you to use Testpad to run through the tests in test script "${scriptName}".\nThe link below will access the bitfinex account on Testpad as a Guest Tester, so there's no registration required.\n`,
          signoff: 'Happy Testing!\n',
          expectedAssigneeId: 0
        }
      })

      const sendemailResponse = await httpsRequest({
        hostname: 'bitfinex.testpad.com',
        port: 443,
        path: `/a/script/${scriptId}/run/${runId}/sendemail`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(sendemailBody),
          'Accept': 'application/json',
          'Cookie': cookies,
          'X-Csrftoken': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `https://bitfinex.testpad.com/script/${scriptId}`,
          'Origin': 'https://bitfinex.testpad.com'
        },
        rejectUnauthorized: false
      }, sendemailBody)

      if (sendemailResponse.status >= 400) {
        return res.status(sendemailResponse.status).json({ error: 'Failed to send email', details: sendemailResponse.data })
      }

      res.json({ success: true, message: `Run assigned and email sent to ${targetEmail}` })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Proxy for Testpad API (/api/v1/...)
  app.use('/api/v1', async (req, res) => {
    const authHeader = req.headers.authorization
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization header required. Please log in.' })
    }

    const targetPath = `/api/v1${req.url}`

    try {
      const options = {
        hostname: 'api.testpad.com',
        port: 443,
        path: targetPath,
        method: req.method,
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        rejectUnauthorized: false
      }

      const body = req.method !== 'GET' ? JSON.stringify(req.body) : null
      if (body) {
        options.headers['Content-Length'] = Buffer.byteLength(body)
      }

      const proxyResponse = await httpsRequest(options, body)

      res.status(proxyResponse.status)
      try {
        res.json(JSON.parse(proxyResponse.data))
      } catch {
        res.send(proxyResponse.data)
      }
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })

  // Serve static files in production, or use Vite dev server in development
  if (isProduction) {
    // Serve static files from dist directory
    app.use(express.static(join(__dirname, 'dist')))

    // Handle SPA routing - serve index.html for all non-API routes
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(join(__dirname, 'dist', 'index.html'))
      }
    })
  } else {
    // Create Vite server in middleware mode for development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    })
    // Use Vite's middleware
    app.use(vite.middlewares)
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  })
}

startServer().catch(console.error)