// Get Users - Script to extract users from Testpad runs

// Extracts unique users from existing runs labels
// Label format: "number / email / date / status"

import dotenv from 'dotenv'
import https from 'https'
import path from 'path'
import { fileURLToPath } from 'url'

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load .env from project root (two levels up from src/api/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const API_TOKEN = process.env.VITE_TESTPAD_API_TOKEN
const API_BASE = 'https://api.testpad.com'

if (!API_TOKEN) {
  console.error('❌ Error: VITE_TESTPAD_API_TOKEN is not defined in .env file')
  process.exit(1)
}

function apiRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE)
    
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `apikey ${API_TOKEN}`,
        'Accept': 'application/json'
      },
      rejectUnauthorized: false
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            data: JSON.parse(data)
          })
        } catch {
          resolve({
            status: res.statusCode,
            ok: false,
            data: data
          })
        }
      })
    })
    
    req.on('error', reject)
    req.end()
  })
}

// validate and extract emails
function isValidEmail(email) {
  return email && typeof email === 'string' && email.includes('@') && email !== 'anyone' && email.trim().length > 0
}

// get all scripts
function getAllScripts(items) {
  const scripts = []
  for (const item of items) {
    if (item.type === 'script') {
      scripts.push(item)
    } else if (item.type === 'folder' && item.contents?.length) {
      scripts.push(...getAllScripts(item.contents))
    }
  }
  return scripts
}

// extract users from a script
async function extractUsersFromScript(script, users) {
  try {
    const scriptResponse = await apiRequest(`/api/v1/scripts/${script.id}`)
    if (!scriptResponse.ok) return
    
    const scriptData = scriptResponse.data.script || scriptResponse.data
    const runs = scriptData.runs || []
    
    // Extract users from labels and headers
    for (const run of runs) {
      // Extract from label (format: "number / email / date / status")
      if (run.label) {
        const parts = run.label.split(' / ')
        if (parts.length >= 2) {
          const email = parts[1].trim()
          if (isValidEmail(email)) {
            users.add(email)
          }
        }
      }
      
      // Extract from headers._tester
      if (run.headers?._tester && isValidEmail(run.headers._tester)) {
        users.add(run.headers._tester)
      }
    }
  } catch (error) {
    // Silently continue if there's an error
  }
}

// Optimized function to process a project
async function processProject(project) {
  try {
    const foldersResponse = await apiRequest(`/api/v1/projects/${project.id}/folders`)
    if (!foldersResponse.ok) return []
    
    const folders = foldersResponse.data.folders || []
    return getAllScripts(folders)
  } catch (error) {
    return []
  }
}

async function getUsers() {
  console.log('👥 TEST - Get Users from Testpad (OPTIMIZED)\n')
  console.log('='.repeat(60))
  console.log('📋 Extracting users from runs labels...\n')
  
  const users = new Set()
  
  try {
    // Get all projects
    const projectsResponse = await apiRequest('/api/v1/projects')
    if (!projectsResponse.ok) {
      console.error('❌ Error getting projects')
      return
    }
    
    const projects = projectsResponse.data.projects || []
    console.log(`✅ Found ${projects.length} projects\n`)
    
    // Process projects in parallel (faster)
    const PROJECT_CONCURRENT_LIMIT = 5 // Process 5 projects in parallel
    const SCRIPT_CONCURRENT_LIMIT = 20 // Process 20 scripts in parallel (increased)
    
    for (let p = 0; p < projects.length; p += PROJECT_CONCURRENT_LIMIT) {
      const projectBatch = projects.slice(p, p + PROJECT_CONCURRENT_LIMIT)
      
      // Process batch of projects in parallel
      const allScriptsResults = await Promise.allSettled(
        projectBatch.map(async (project) => {
          console.log(`📦 Project: ${project.name} (ID: ${project.id})`)
          const scripts = await processProject(project)
          console.log(`   📝 Scripts found: ${scripts.length}`)
          return { project, scripts }
        })
      )
      
      // Collect all scripts from all projects
      const allScripts = []
      for (const result of allScriptsResults) {
        if (result.status === 'fulfilled' && result.value.scripts.length > 0) {
          allScripts.push(...result.value.scripts)
        }
      }
      
      // Process all scripts in parallel with concurrency limit
      for (let i = 0; i < allScripts.length; i += SCRIPT_CONCURRENT_LIMIT) {
        const scriptBatch = allScripts.slice(i, i + SCRIPT_CONCURRENT_LIMIT)
        
        // Use Promise.allSettled so errors don't stop processing
        await Promise.allSettled(
          scriptBatch.map(script => extractUsersFromScript(script, users))
        )
      }
    }
    
    // Show results
    console.log('\n' + '='.repeat(60))
    console.log(`✅ Users found: ${users.size}\n`)
    
    const usersArray = Array.from(users).sort()
    usersArray.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user}`)
    })
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ TEST completed!')
    
  } catch (error) {
    console.error('\n❌ Exception:', error.message)
  }
}

getUsers()

