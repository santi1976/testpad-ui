// Vercel serverless function: Proxy for Testpad API (/api/v1/*)
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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const token = process.env.VITE_TESTPAD_API_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'VITE_TESTPAD_API_TOKEN not set' })
  }

  // Debug: log what we receive
  console.log('req.query:', JSON.stringify(req.query))
  console.log('req.url:', req.url)

  // Extract path from catch-all route
  // Try multiple ways to get the path
  let pathString = ''
  
  if (req.query.path) {
    // Vercel catch-all: path is array ['projects'] or ['scripts', '123']
    const pathSegments = req.query.path
    pathString = Array.isArray(pathSegments) ? pathSegments.join('/') : pathSegments
  } else if (req.url) {
    // Fallback: extract from URL
    // req.url might be /api/v1/projects or /v1/projects
    const match = req.url.match(/\/v1\/(.+?)(\?|$)/)
    if (match) {
      pathString = match[1]
    }
  }

  if (!pathString) {
    return res.status(400).json({ error: 'No path provided', debug: { query: req.query, url: req.url } })
  }
  
  // Build target path for api.testpad.com
  const targetPath = `/api/v1/${pathString}`

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
    
    res.status(proxyResponse.status)
    try {
      return res.json(JSON.parse(proxyResponse.data))
    } catch {
      return res.send(proxyResponse.data)
    }
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}