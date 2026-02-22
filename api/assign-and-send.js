// Vercel serverless function: Assign run and send email
// Uses sender credentials passed from frontend (captured at login)
import { loginToTestpad, httpsRequest } from './_utils.js'

export default async function handler(req, res) {
  console.log('[ASSIGN-SEND] ========== Request received ==========')
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only allow POST
  if (req.method !== 'POST') {
    console.log('[ASSIGN-SEND] ❌ Method not allowed:', req.method)
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Parse body if it's a string
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { scriptId, runId, targetEmail, scriptName, senderEmail, senderPassword } = body

    console.log('[ASSIGN-SEND] Request data:')
    console.log(`  - scriptId: ${scriptId}`)
    console.log(`  - runId: ${runId}`)
    console.log(`  - targetEmail: ${targetEmail}`)
    console.log(`  - scriptName: ${scriptName}`)
    console.log(`  - senderEmail: ${senderEmail || '❌ MISSING'}`)
    console.log(`  - senderPassword: ${senderPassword ? '✅ provided (' + senderPassword.length + ' chars)' : '❌ MISSING'}`)

    // Validate all required fields
    const missingFields = []
    if (!scriptId) missingFields.push('scriptId')
    if (!runId) missingFields.push('runId')
    if (!targetEmail) missingFields.push('targetEmail')
    if (!scriptName) missingFields.push('scriptName')
    if (!senderEmail) missingFields.push('senderEmail')
    if (!senderPassword) missingFields.push('senderPassword')

    if (missingFields.length > 0) {
      const errorMsg = `Missing required fields: ${missingFields.join(', ')}`
      console.log(`[ASSIGN-SEND] ❌ ${errorMsg}`)
      return res.status(400).json({ error: errorMsg })
    }

    const COMPANY_OID = process.env.COMPANY_OID
    if (!COMPANY_OID) {
      console.log('[ASSIGN-SEND] ❌ COMPANY_OID not configured in environment')
      return res.status(500).json({ error: 'COMPANY_OID not configured' })
    }
    console.log(`[ASSIGN-SEND] ✅ COMPANY_OID: ${COMPANY_OID}`)

    // Login to Testpad using sender credentials
    console.log('[ASSIGN-SEND] Logging in to Testpad...')
    let cookies, csrfToken
    try {
      const loginResult = await loginToTestpad(senderEmail, senderPassword)
      cookies = loginResult.cookies
      csrfToken = loginResult.csrfToken
      console.log('[ASSIGN-SEND] ✅ Login successful')
    } catch (loginError) {
      console.log('[ASSIGN-SEND] ❌ Login failed:', loginError.message)
      return res.status(401).json({ error: 'Login failed: ' + loginError.message })
    }

    const SENDER_EMAIL = senderEmail

    // Generate ObjectId
    const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
    const random = Math.random().toString(16).substring(2, 18).padStart(16, '0')
    const runOid = timestamp + random

    const now = new Date()
    const runDate = now.toISOString()
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

    // Step 1: setmeta
    console.log('[ASSIGN-SEND] Step 1: Calling setmeta...')
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

    console.log(`[ASSIGN-SEND] setmeta response status: ${setmetaResponse.status}`)

    if (setmetaResponse.status >= 400) {
      console.log('[ASSIGN-SEND] ❌ setmeta failed:', setmetaResponse.data)
      return res.status(setmetaResponse.status).json({ error: 'Failed to assign run', details: setmetaResponse.data })
    }
    console.log('[ASSIGN-SEND] ✅ setmeta successful')

    // Step 2: sendemail
    console.log('[ASSIGN-SEND] Step 2: Calling sendemail...')
    const senderName = SENDER_EMAIL.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')

    console.log(`[ASSIGN-SEND] Sending email from ${senderName} (${SENDER_EMAIL}) to ${targetEmail}`)

    const sendemailBody = JSON.stringify({
      data: {
        to: targetEmail,
        subject: `Guest Testing Invitation: ${scriptName} (test run #${runId})`,
        previewContents: `${senderName} (${SENDER_EMAIL}) is inviting you to use Testpad as a Guest Tester.`,
        intro: `Hi\n\n${senderName} (${SENDER_EMAIL}) is inviting you to use Testpad to run through the tests in test script "${scriptName}".\nThe link below will access the bitfinex account on Testpad as a Guest Tester, so there's no registration required.\n`,
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

    console.log(`[ASSIGN-SEND] sendemail response status: ${sendemailResponse.status}`)

    if (sendemailResponse.status >= 400) {
      console.log('[ASSIGN-SEND] ❌ sendemail failed:', sendemailResponse.data)
      return res.status(sendemailResponse.status).json({ error: 'Failed to send email', details: sendemailResponse.data })
    }

    console.log('[ASSIGN-SEND] ========== ✅ SUCCESS ==========')
    console.log(`[ASSIGN-SEND] Run #${runId} assigned and email sent to ${targetEmail}`)
    return res.json({ success: true, message: `Run assigned and email sent to ${targetEmail}` })
  } catch (error) {
    console.log('[ASSIGN-SEND] ❌ Unexpected error:', error.message)
    return res.status(500).json({ error: error.message })
  }
}
