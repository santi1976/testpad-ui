import https from 'https'

function httpsRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data
        })
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Get token from Authorization header (user's token) or fallback to server token
  // Vercel normalizes headers to lowercase, but check both cases
  const authHeader = req.headers.authorization || req.headers.Authorization || req.headers['authorization']
  let token = null

  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('apikey ')) {
    // Extract token from "apikey TOKEN" format
    token = authHeader.substring(7).trim()
    console.log('[PROXY] Using user token from Authorization header')
  } else {
    console.log('[PROXY] No valid Authorization header found')
  }

  if (!token) {
    return res.status(401).json({ error: 'API token not found' })
  }

  // Path comes from rewrite: /api/v1/projects/19/folders -> ?path=projects/19/folders
  // Preserve all other query params from the original request
  const pathParam = req.query.path || 'projects'

  // Build query string from other params (excluding 'path' which is the route)
  const queryParams = { ...req.query }
  delete queryParams.path
  const queryString = Object.keys(queryParams).length > 0
    ? '?' + new URLSearchParams(queryParams).toString()
    : ''

  const targetPath = `/api/v1/${pathParam}${queryString}`

  console.log('[PROXY] Request:', req.method, targetPath)

  try {
    const options = {
      hostname: 'api.testpad.com',
      port: 443,
      path: targetPath,
      method: req.method,
      headers: {
        'Authorization': `apikey ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }

    let body = null
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      body = JSON.stringify(req.body)
      options.headers['Content-Length'] = Buffer.byteLength(body)
    }

    const proxyResponse = await httpsRequest(options, body)

    console.log('[PROXY] Response status:', proxyResponse.status)
    console.log('[PROXY] Response data length:', proxyResponse.data?.length || 0)
    if (proxyResponse.status >= 400) {
      console.log('[PROXY] Error response:', proxyResponse.data?.substring(0, 200))
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    res.status(proxyResponse.status)
    try {
      return res.json(JSON.parse(proxyResponse.data))
    } catch (parseError) {
      console.log('[PROXY] JSON parse error, sending raw data')
      return res.send(proxyResponse.data)
    }
  } catch (error) {
    console.error('[PROXY] Error:', error.message)
    console.error('[PROXY] Error stack:', error.stack)
    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(500).json({ error: error.message })
  }
}