// API Client - Create Runs
// Create and get test runs

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// Load .env from project root when running in Node.js
if (typeof process !== 'undefined' && process.versions?.node) {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  dotenv.config({ path: path.resolve(__dirname, '../../.env') })
}

const API_BASE = 'https://api.testpad.com'

export interface Run {
  id: number
  _id?: number
  label?: string
  headers?: Record<string, string>
}

export interface RunResponse {
  run?: Run
}

// ============================================
// CONFIGURATION - Complete the following values:
// ============================================
const CONFIG = {
  projectName: 'Testpad Api Testing',
  folderName: 'Release v1.135 (copy)',
  scriptName: 'Home Page'
}

/**
 * Create a new run using the public API
 */
export async function createRun(scriptId: number | string): Promise<Run> {
  const token = (import.meta as any)?.env?.VITE_TESTPAD_API_TOKEN || process.env.VITE_TESTPAD_API_TOKEN
  if (!token) {
    throw new Error('API token not found in environment variables')
  }

  const response = await fetch(`${API_BASE}/api/v1/scripts/${scriptId}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `apikey ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API Error ${response.status}: ${errorText}`)
  }

  const data: RunResponse = await response.json()
  return data.run || (data as unknown as Run)
}

/**
 * Get information for a specific run
 */
export async function getRun(scriptId: number | string, runId: number | string): Promise<Run> {
  const token = (import.meta as any)?.env?.VITE_TESTPAD_API_TOKEN || process.env.VITE_TESTPAD_API_TOKEN
  if (!token) {
    throw new Error('API token not found in environment variables')
  }

  const response = await fetch(`${API_BASE}/api/v1/scripts/${scriptId}/runs/${runId}`, {
    headers: {
      'Authorization': `apikey ${token}`
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API Error ${response.status}: ${errorText}`)
  }

  return response.json()
}

// Execute if run directly
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMainModule) {
  interface Project {
    id: number
    name: string
  }

  interface FolderItem {
    id: number
    name: string
    type: 'folder' | 'script'
    contents?: FolderItem[]
  }

  async function findAndCreateRun() {
    try {
      const { projectName, folderName, scriptName } = CONFIG

      console.log('🔍 Searching for script...')
      console.log(`   Project: ${projectName}`)
      console.log(`   Folder: ${folderName}`)
      console.log(`   Script: ${scriptName}\n`)

      const token = (import.meta as any)?.env?.VITE_TESTPAD_API_TOKEN || process.env.VITE_TESTPAD_API_TOKEN
      if (!token) {
        throw new Error('API token not found in environment variables')
      }

      // Get all projects
      const projectsResponse = await fetch(`${API_BASE}/api/v1/projects`, {
        headers: { 'Authorization': `apikey ${token}` }
      })
      if (!projectsResponse.ok) throw new Error(`Failed to get projects: ${projectsResponse.status}`)
      const projects = await projectsResponse.json()
      const project = projects.projects.find((p: Project) => p.name === projectName)

      if (!project) {
        throw new Error(`Project "${projectName}" not found`)
      }
      console.log(`✅ Found project: ${project.name} (ID: ${project.id})`)

      // Get folders
      const foldersResponse = await fetch(`${API_BASE}/api/v1/projects/${project.id}/folders`, {
        headers: { 'Authorization': `apikey ${token}` }
      })
      if (!foldersResponse.ok) throw new Error(`Failed to get folders: ${foldersResponse.status}`)
      const foldersData = await foldersResponse.json()
      const folders: FolderItem[] = foldersData.folders || []

      // Find folder recursively
      function findFolder(items: FolderItem[], name: string): FolderItem | null {
        for (const item of items) {
          if (item.type === 'folder' && item.name === name) {
            return item
          }
          if (item.type === 'folder' && item.contents) {
            const found = findFolder(item.contents, name)
            if (found) return found
          }
        }
        return null
      }

      const folder = findFolder(folders, folderName)
      if (!folder) {
        throw new Error(`Folder "${folderName}" not found in project "${projectName}"`)
      }
      console.log(`✅ Found folder: ${folder.name} (ID: ${folder.id})`)

      // Find script in folder
      function findScript(items: FolderItem[], name: string): FolderItem | null {
        for (const item of items) {
          if (item.type === 'script' && item.name === name) {
            return item
          }
          if (item.type === 'folder' && item.contents) {
            const found = findScript(item.contents, name)
            if (found) return found
          }
        }
        return null
      }

      const script = findScript(folder.contents || [], scriptName)
      if (!script) {
        throw new Error(`Script "${scriptName}" not found in folder "${folderName}"`)
      }

      console.log(`✅ Found script: ${script.name} (ID: ${script.id})`)

      // Create the run
      console.log(`\n🚀 Creating run...`)
      const run = await createRun(script.id)

      console.log('\n✅ Run created successfully!')
      console.log('='.repeat(60))
      console.log(`📋 Run ID: ${run.id || run._id || 'N/A'}`)
      console.log(`📄 Script: ${scriptName} (${script.id})`)
      console.log(`📁 Folder: ${folderName}`)
      console.log(`📦 Project: ${projectName}`)
      console.log('='.repeat(60))

    } catch (error) {
      console.error('\n❌ Error:', (error as Error).message)
      process.exit(1)
    }
  }

  findAndCreateRun()
}
