// Vercel serverless function: Validate user login (Email + Password + API Token)
// This endpoint validates ALL credentials needed for the app to work:
// 1. API Token - for official TestPad API calls
// 2. Email + Password - for web login to access undocumented endpoints (setmeta, sendemail)
import { httpsRequest, loginToTestpad } from './_utils.js'

export default async function handler(req, res) {
  console.log('[LOGIN] ========== Login request received ==========')
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only allow POST
  if (req.method !== 'POST') {
    console.log('[LOGIN] ❌ Method not allowed:', req.method)
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Parse body if it's a string
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { email, password, apiToken } = body

    console.log('[LOGIN] Received credentials:')
    console.log(`  - email: ${email ? email : '❌ MISSING'}`)
    console.log(`  - password: ${password ? '✅ provided (' + password.length + ' chars)' : '❌ MISSING'}`)
    console.log(`  - apiToken: ${apiToken ? '✅ provided (' + apiToken.length + ' chars)' : '❌ MISSING'}`)

    // Validate all required fields upfront
    const missingFields = []
    if (!email) missingFields.push('email')
    if (!password) missingFields.push('password')
    if (!apiToken) missingFields.push('apiToken')

    if (missingFields.length > 0) {
      const errorMsg = `Missing required fields: ${missingFields.join(', ')}`
      console.log(`[LOGIN] ❌ ${errorMsg}`)
      return res.status(400).json({ error: errorMsg })
    }

    // Validate domain
    const allowedDomains = ['bitfinex.com', 'tether.com']
    const emailDomain = email.split('@')[1]?.toLowerCase()

    if (!allowedDomains.includes(emailDomain)) {
      console.log(`[LOGIN] ❌ Invalid email domain: ${emailDomain}`)
      return res.status(400).json({ error: 'Email must be from @bitfinex.com or @tether.com' })
    }
    console.log(`[LOGIN] ✅ Email domain valid: ${emailDomain}`)

    // Step 1: Validate API token by making a test API call
    console.log('[LOGIN] Step 1: Validating API token...')
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

      console.log(`[LOGIN] API token test response status: ${testResponse.status}`)

      if (testResponse.status !== 200) {
        console.log('[LOGIN] ❌ API token invalid')
        return res.status(401).json({ valid: false, error: 'Invalid API token' })
      }
      console.log('[LOGIN] ✅ API token valid')
    } catch (apiError) {
      console.log('[LOGIN] ❌ API token validation error:', apiError.message)
      return res.status(401).json({ valid: false, error: 'Invalid API token: ' + apiError.message })
    }

    // Step 2: Validate password by attempting web login
    // This is CRITICAL - without valid password, user cannot assign/send emails
    console.log('[LOGIN] Step 2: Validating password via web login...')
    try {
      const loginResult = await loginToTestpad(email, password)
      console.log('[LOGIN] ✅ Web login successful')
      console.log(`[LOGIN]   - Cookies obtained: ${loginResult.cookies ? 'yes (' + loginResult.cookies.length + ' chars)' : 'no'}`)
      console.log(`[LOGIN]   - CSRF token obtained: ${loginResult.csrfToken ? 'yes' : 'no'}`)
    } catch (loginError) {
      console.log('[LOGIN] ❌ Web login failed:', loginError.message)
      return res.status(401).json({ 
        valid: false, 
        error: 'Invalid password. Web login failed: ' + loginError.message 
      })
    }

    // All validations passed
    console.log('[LOGIN] ========== ✅ ALL VALIDATIONS PASSED ==========')
    console.log('[LOGIN] User can now use all app features including assign & send email')
    return res.json({ valid: true, email })

  } catch (error) {
    console.log('[LOGIN] ❌ Unexpected error:', error.message)
    return res.status(500).json({ error: error.message })
  }
}