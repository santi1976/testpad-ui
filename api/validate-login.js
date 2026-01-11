// Vercel serverless function: Validate user login (Email + API Token)
import { httpsRequest } from './_utils.js'

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
    const { email, apiToken } = body
    
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
        // Token is valid
        return res.json({ valid: true, email })
      } else {
        return res.status(401).json({ valid: false, error: 'Invalid API token' })
      }
    } catch (apiError) {
      return res.status(401).json({ valid: false, error: 'Invalid API token' })
    }
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}