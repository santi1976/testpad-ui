// Vercel serverless function: Assign run and send email
// NOTE: Uses USER_TESTPAD and PASSWORD_TESTPAD from env (system user for sending emails only)
import { loginToTestpad, httpsRequest } from './_utils.js'

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Parse body if it's a string
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { scriptId, runId, targetEmail, scriptName, senderEmail, senderPassword } = body

    if (!scriptId || !runId || !targetEmail || !scriptName) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const COMPANY_OID = process.env.COMPANY_OID
    if (!COMPANY_OID) {
      return res.status(500).json({ error: 'COMPANY_OID not configured' })
    }

    // Login to Testpad using provided sender credentials (fallback to env if missing)
    const { cookies, csrfToken } = await loginToTestpad(senderEmail, senderPassword)

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
    const senderName = SENDER_EMAIL.split('@')[0].split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')

    console.log(`[Email] Sending for ${SENDER_EMAIL} to ${targetEmail} (Run #${runId})`)

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

    if (sendemailResponse.status >= 400) {
      return res.status(sendemailResponse.status).json({ error: 'Failed to send email', details: sendemailResponse.data })
    }

    return res.json({ success: true, message: `Run assigned and email sent to ${targetEmail}` })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
