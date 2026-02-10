import { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react'
import { apiGet } from '../utils/api'
import { normalizeTester, sortTesters } from '../utils/normalizeTester'

const STORAGE_KEY = 'testpad_testers_global'
const RECENT_RUNS_LIMIT = 3
const MIN_VALID_CACHE = 5

interface TestersContextType {
  testers: string[]
  isLoading: boolean
  refresh: () => Promise<void>
}

const TestersContext = createContext<TestersContextType | null>(null)

interface TestersProviderProps {
  children: ReactNode
}

function addTester(testerSet: Set<string>, tester: string | null | undefined) {
  if (!tester || typeof tester !== 'string') return
  const normalized = normalizeTester(tester)
  if (normalized) {
    testerSet.add(normalized)
  }
}

async function fetchAllTesters(): Promise<string[]> {
  const projectsResponse = await apiGet<{ projects?: { id: string | number; name?: string }[] }>('/api/v1/projects')
  const projects = projectsResponse?.projects || []

  const project = projects.find((p: any) => p.name === 'Bitfinex')
  if (!project) return []

  const testerSet = new Set<string>()
  const MAX_CONCURRENT = 30

  const foldersResponse = await apiGet<{ folders?: any[] }>(`/api/v1/projects/${project.id}/folders`)
  const folders = foldersResponse?.folders || []

  const getAllScripts = (items: any[]): any[] => {
    const scripts: any[] = []
    for (const item of items) {
      if (item.type === 'script') scripts.push(item)
      else if (item.type === 'folder' && item.contents) {
        scripts.push(...getAllScripts(item.contents))
      }
    }
    return scripts
  }

  const scripts = getAllScripts(folders)

  for (let i = 0; i < scripts.length; i += MAX_CONCURRENT) {
    const batch = scripts.slice(i, i + MAX_CONCURRENT)
    const results = await Promise.allSettled(
      batch.map((script) => apiGet(`/api/v1/scripts/${script.id}`))
    )

    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        const scriptDetails = (result.value as any)?.script || result.value
        if (scriptDetails.runs && Array.isArray(scriptDetails.runs)) {
          const recentRuns = scriptDetails.runs.slice(0, RECENT_RUNS_LIMIT)
          recentRuns.forEach((run: any) => {
            // Only extract emails - all are sent as Guest
            addTester(testerSet, run.headers?._tester)
            addTester(testerSet, run.assignee?.email)

            if (run.label && typeof run.label === 'string') {
              const parts = run.label.split(' / ')
              if (parts.length >= 2) {
                addTester(testerSet, parts[1].trim())
              }
            }
          })
        }
      }
    })
  }

  return sortTesters(Array.from(testerSet))
}

export function TestersProvider({ children }: TestersProviderProps) {
  const [testers, setTesters] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const hasFetched = useRef(false)

  const refresh = async () => {
    setIsLoading(true)
    try {
      const sorted = await fetchAllTesters()
      setTesters(sorted)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted))
    } catch {
      // ignore
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length >= MIN_VALID_CACHE) {
          setTesters(parsed)
          setIsLoading(false)
          return
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    }

    refresh()
  }, [])

  useEffect(() => {
    const handleLogin = () => {
      hasFetched.current = false
      refresh()
    }
    window.addEventListener('testpad-login', handleLogin)
    return () => window.removeEventListener('testpad-login', handleLogin)
  }, [])

  return (
    <TestersContext.Provider value={{ testers, isLoading, refresh }}>
      {children}
    </TestersContext.Provider>
  )
}

export function useGlobalTesters(): TestersContextType {
  const context = useContext(TestersContext)
  if (!context) {
    throw new Error('useGlobalTesters must be used within TestersProvider')
  }
  return context
}

export function clearTestersCache() {
  localStorage.removeItem(STORAGE_KEY)
}
