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

  const token = process.env.VITE_TESTPAD_API_TOKEN
  if (!token) {
    return res.status(500).json({ error: 'VITE_TESTPAD_API_TOKEN not set' })
  }

  // Path comes from rewrite: /api/v1/projects/19/folders -> ?path=projects/19/folders
  const pathParam = req.query.path || 'projects'
  const targetPath = `/api/v1/${pathParam}`

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