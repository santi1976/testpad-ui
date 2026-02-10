import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  User,
  CheckCircle,
  XCircle,
  PauseCircle,
  Clock,
  AlertTriangle,
  ArrowLeft,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { apiGet } from '../utils/api'
import { useGlobalTesters } from '../contexts/TestersContext'
import { normalizeTester, sortTesters } from '../utils/normalizeTester'
import { hasEmailSent, getEmailRecipient } from '../utils/emailTracking'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { cn } from '@/lib/utils'
import { SearchableSelect } from '@/components/ui/searchable-select'

// Create URL-friendly slug from name
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Types
interface Project {
  id: number | string
  name: string
}

interface Folder {
  id: number | string
  name: string
  type?: string
  contents?: FolderItem[]
}

interface FolderItem {
  id: number | string
  name: string
  type: 'folder' | 'script'
  contents?: FolderItem[]
}

interface UserInfo {
  email: string
  date?: string | null
  runNumber?: string | number | null
  isGuest: boolean
}

interface RunProgress {
  total: number
  pass: number
  fail: number
  block: number
  query?: number
}

interface Test {
  id: string | number
  name?: string
  text?: string
  status?: string
}

interface TestIssue {
  id: string
  number: number
  text: string
  status: 'fail' | 'block'
}

interface Run {
  id: string | number
  project: Project
  folder: Folder | null
  script: { id: string | number; name: string }
  userInfo: UserInfo | null
  progress: RunProgress | null
  tests: Test[]
  results: Record<string, string | { result: string }>
  state: string | null
  created: string
  headers?: Record<string, string>
  assignee?: { id?: string; email?: string; name?: string }
  label?: string
  fielddata?: Array<{ raw?: string }>
  fields?: Record<string, string>
  data?: {
    fielddata?: Array<{ raw?: string }>
    fields?: Record<string, string>
    emailSentTo?: string
  }
  emailSentTo?: string
}

interface ScriptGroup {
  script: { id: string | number; name: string }
  project: Project
  folder: Folder | null
  runs: Run[]
}

// Format elapsed time
function formatElapsedTime(created: string | undefined): string {
  if (!created) return 'N/A'
  try {
    const start = new Date(created)
    const now = new Date()
    const diff = Math.floor((now.getTime() - start.getTime()) / 1000)

    const hours = Math.floor(diff / 3600)
    const minutes = Math.floor((diff % 3600) / 60)
    const seconds = diff % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
  } catch {
    return 'N/A'
  }
}

// Get initials from email for avatar
function getInitials(email: string | undefined): string {
  if (!email) return '?'
  const parts = email.split('@')[0].split('.')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

// Get tests with issues (failed or blocked) from a run
function getTestsWithIssues(run: Run): TestIssue[] {
  const issues: TestIssue[] = []
  if (!run.results || !run.tests) return issues

  Object.entries(run.results).forEach(([testId, result]) => {
    const status = typeof result === 'object' ? result?.result : result
    if (status === 'fail' || status === 'block' || status === 'failed' || status === 'blocked') {
      const test = run.tests.find((t) => String(t.id) === String(testId))
      const testIndex = run.tests.findIndex((t) => String(t.id) === String(testId))

      if (test) {
        issues.push({
          id: testId,
          number: testIndex + 1,
          text: test.text || test.name || 'Unknown test',
          status: status === 'fail' || status === 'failed' ? 'fail' : 'block',
        })
      }
    }
  })

  issues.sort((a, b) => a.number - b.number)
  return issues
}

// Helper function to calculate progress from results if progress is not available
function calculateProgressFromResults(
  results: Record<string, string | { result: string }>,
  tests: Test[]
): RunProgress | null {
  if (!results || !tests) return null
  const total = tests.length
  let pass = 0
  let fail = 0
  let block = 0

  Object.values(results).forEach((result) => {
    const status = typeof result === 'object' ? result?.result : result
    if (status === 'pass' || status === 'passed') pass++
    else if (status === 'fail' || status === 'failed') fail++
    else if (status === 'block' || status === 'blocked') block++
  })

  return { total, pass, fail, block, query: 0 }
}

export default function TestRuns() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [selectedState, setSelectedState] = useState<string>('all')
  const [selectedTestSuite, setSelectedTestSuite] = useState<string | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string>('latest')
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)
  const [selectedRunByScript, setSelectedRunByScript] = useState<Record<string, string | number>>({})
  const [hasManuallySelectedProject, setHasManuallySelectedProject] = useState(false)
  const [isCriticalAlertsClosed, setIsCriticalAlertsClosed] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'horizontal'>('grid')
  const [expandedScripts, setExpandedScripts] = useState<Record<string, boolean>>({})
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({})
  const [progressiveRuns, setProgressiveRuns] = useState<Run[]>([])
  const [isLoadingProgressive, setIsLoadingProgressive] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', path: '/', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key: 'divider1', label: 'Test Execution', type: 'divider' },
    { key: 'create-run', label: 'Create Run', path: '/create-run', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
    { key: 'assignments', label: 'Assignments & Email', path: '/assignments', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { key: 'divider-management', label: 'Test Management', type: 'divider' },
    { key: 'test-suites', label: 'Test Suites', path: '/test-suites', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'test-runs', label: 'Test Runs', path: '/test-runs', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'divider2', type: 'separator' },
    { key: 'reports', label: 'Reports', path: '#', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', disabled: true, badge: 'FUTURE' },
    { key: 'settings', label: 'Settings', path: '/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ]

  const handleSignOut = () => {
    logout()
    navigate('/login')
  }

  // Cache key for localStorage
  const getCacheKey = () => {
    const projectId = selectedProject?.id || 'all'
    const folderId = selectedFolder || 'all'
    return `dashboard_runs_${projectId}_${folderId}`
  }

  // Load projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/v1/projects'),
  })

  const projects: Project[] = projectsData?.projects || []

  // Compute activeProject
  const activeProject =
    selectedProject ||
    projects.find((p) => p.name.toLowerCase().includes('testpad api testing')) ||
    null

  // Auto-select the last project by default
  useEffect(() => {
    if (projects.length > 0 && !selectedProject && !hasManuallySelectedProject) {
      const testpadApiProject = projects.find((p) =>
        p.name.toLowerCase().includes('testpad api testing')
      )
      const defaultProject = testpadApiProject || projects[projects.length - 1]
      if (defaultProject) {
        setSelectedProject(defaultProject)
      }
    }
  }, [projects.length])

  // Fetch folders first to get releases
  const { data: foldersData } = useQuery({
    queryKey: ['projectFolders', activeProject?.id],
    queryFn: async () => {
      if (!activeProject) return { folders: [], releases: [] }
      const response = await apiGet(`/api/v1/projects/${activeProject.id}/folders`)
      const folders = response?.folders || []

      const releases = folders
        .filter((item: FolderItem) => item.type === 'folder')
        .map((folder: FolderItem) => ({
          id: folder.id,
          name: folder.name,
          contents: folder.contents,
        }))
        .sort((a: Folder, b: Folder) => String(b.name).localeCompare(String(a.name)))

      return { folders, releases }
    },
    enabled: !!activeProject,
    staleTime: 5 * 60 * 1000,
  })

  const folderReleases: Folder[] = foldersData?.releases || []
  const allFoldersData: FolderItem[] = foldersData?.folders || []

  // Get testers from global context (loaded once, cached in localStorage)
  const { testers: historicalTesters, isLoading: testersLoading } = useGlobalTesters()

  // Resolve effective folder ID
  const effectiveFolderId = useMemo(() => {
    if (selectedFolder === 'latest' && folderReleases.length > 0) {
      return String(folderReleases[0].id)
    }
    return selectedFolder
  }, [selectedFolder, folderReleases])

  // Determine which release to load
  const releaseToLoad = useMemo(() => {
    if (selectedFolder === 'latest' || selectedFolder === null) {
      return folderReleases[0] || null
    }
    if (selectedFolder === 'all') {
      return 'all' as const
    }
    return folderReleases.find((r) => String(r.id) === selectedFolder) || null
  }, [selectedFolder, folderReleases])

  // Progressive loading effect
  useEffect(() => {
    let cancelled = false

    const loadRuns = async () => {
      if (!activeProject || !releaseToLoad) {
        return
      }

      setIsLoadingProgressive(true)

      const oldCacheKey = `dashboard_runs_${activeProject?.id}`
      localStorage.removeItem(oldCacheKey)

      try {
        const cacheKey = getCacheKey()
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached)
            const cacheAge = Date.now() - timestamp
            const maxAge = 5 * 60 * 1000

            if (cacheAge < maxAge && data.length > 0) {
              if (!cancelled) {
                setProgressiveRuns(data)
                setIsLoadingProgressive(false)
                setError(null)
              }
              return
            }
          } catch {
            // Invalid cache, continue to fetch
          }
        }

        const allRuns: Run[] = []
        const MAX_CONCURRENT_SCRIPTS = 30

        const getScriptsFromFolder = (
          folder: Folder,
          parentFolder: Folder | null = null
        ): { script: FolderItem; folder: Folder }[] => {
          const scripts: { script: FolderItem; folder: Folder }[] = []
          const effectiveFolder = parentFolder || folder
          if (folder.contents) {
            for (const item of folder.contents) {
              if (item.type === 'script') {
                scripts.push({ script: item, folder: effectiveFolder })
              } else if (item.type === 'folder' && item.contents) {
                scripts.push(
                  ...getScriptsFromFolder(item as unknown as Folder, effectiveFolder)
                )
              }
            }
          }
          return scripts
        }

        const getAllScriptsWithFolder = (
          items: FolderItem[],
          parentFolder: Folder | null = null
        ): { script: FolderItem; folder: Folder | null }[] => {
          const scripts: { script: FolderItem; folder: Folder | null }[] = []
          for (const item of items) {
            if (item.type === 'script') {
              scripts.push({ script: item, folder: parentFolder })
            } else if (item.type === 'folder' && item.contents) {
              scripts.push(
                ...getAllScriptsWithFolder(item.contents, item as unknown as Folder)
              )
            }
          }
          return scripts
        }

        let scriptsWithFolders: { script: FolderItem; folder: Folder | null }[] = []
        if (releaseToLoad === 'all') {
          scriptsWithFolders = getAllScriptsWithFolder(allFoldersData)
        } else {
          scriptsWithFolders = getScriptsFromFolder(releaseToLoad as Folder)
        }

        for (let i = 0; i < scriptsWithFolders.length; i += MAX_CONCURRENT_SCRIPTS) {
          if (cancelled) break

          const batch = scriptsWithFolders.slice(i, i + MAX_CONCURRENT_SCRIPTS)
          const results = await Promise.allSettled(
            batch.map(async ({ script, folder }) => {
              const scriptData = await apiGet(`/api/v1/scripts/${script.id}`)
              return { script, folder, scriptData }
            })
          )

          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
              const { script, folder, scriptData } = result.value
              const scriptDetails = scriptData?.script || scriptData

              if (
                scriptDetails.runs &&
                Array.isArray(scriptDetails.runs) &&
                scriptDetails.runs.length > 0
              ) {
                scriptDetails.runs.forEach((run: Run) => {
                  let userInfo: UserInfo | null = null
                  const testerEmail = run.headers?._tester || (run.headers as Record<string, string>)?.tester
                  const isGuestByTester = testerEmail && testerEmail.toLowerCase() === 'guest'
                  const isGuestByAssignee =
                    run.assignee?.id === '_guest' ||
                    run.assignee?.id === '0' ||
                    run.assignee?.name === 'guest'
                  const isGuestRun = isGuestByTester || isGuestByAssignee

                  if (isGuestRun) {
                    let guestEmail: string | null = null
                    if (run.assignee?.email && run.assignee.email.includes('@')) {
                      guestEmail = run.assignee.email
                    } else if (run.fielddata?.[1]?.raw) {
                      guestEmail = run.fielddata[1].raw
                    } else if (run.fields?.['1']) {
                      guestEmail = run.fields['1']
                    } else if (run.data?.fielddata?.[1]?.raw) {
                      guestEmail = run.data.fielddata[1].raw
                    } else if (run.data?.fields?.['1']) {
                      guestEmail = run.data.fields['1']
                    } else if (run.emailSentTo) {
                      guestEmail = run.emailSentTo
                    } else if (run.data?.emailSentTo) {
                      guestEmail = run.data.emailSentTo
                    } else if (run.label) {
                      const parts = run.label.split(' / ')
                      if (parts.length >= 2 && parts[1]?.includes('@')) {
                        guestEmail = parts[1]
                      }
                    }

                    if (guestEmail && guestEmail.includes('@')) {
                      userInfo = {
                        email: guestEmail,
                        date: run.headers?._createdDate || null,
                        runNumber: run.headers?._run || run.id || null,
                        isGuest: true,
                      }
                    } else {
                      userInfo = {
                        email: 'guest',
                        date: run.headers?._createdDate || null,
                        runNumber: run.headers?._run || run.id || null,
                        isGuest: true,
                      }
                    }
                  } else if (testerEmail && testerEmail !== 'anyone') {
                    userInfo = {
                      email: testerEmail,
                      date: run.headers?._createdDate || null,
                      runNumber: run.headers?._run || run.id || null,
                      isGuest: false,
                    }
                  } else if (run.label) {
                    const parts = run.label.split(' / ')
                    if (
                      parts.length >= 2 &&
                      parts[1] &&
                      parts[1] !== 'anyone' &&
                      parts[1].toLowerCase() !== 'guest'
                    ) {
                      userInfo = {
                        email: parts[1],
                        date: parts[2] || null,
                        runNumber: parts[0] || null,
                        isGuest: false,
                      }
                    }
                  }

                  allRuns.push({
                    ...run,
                    id: run.id || run.headers?._run || `run-${Math.random()}`,
                    project: { id: activeProject.id, name: activeProject.name },
                    folder: folder ? { id: folder.id, name: folder.name } : null,
                    script: { id: scriptDetails.id, name: scriptDetails.name },
                    userInfo: userInfo,
                    progress:
                      run.progress ||
                      (run.results
                        ? calculateProgressFromResults(run.results, scriptDetails.tests)
                        : null),
                    tests: scriptDetails.tests || [],
                    results: run.results || {},
                    state: run.state || null,
                    created:
                      run.created || run.headers?._createdDate || new Date().toISOString(),
                  })
                })
              }
            }
          })

          if (!cancelled && allRuns.length > 0) {
            setProgressiveRuns([...allRuns])
          }
        }

        if (!cancelled) {
          setProgressiveRuns(allRuns)
          setIsLoadingProgressive(false)
          setError(null)

          const cacheKey = getCacheKey()
          localStorage.setItem(
            cacheKey,
            JSON.stringify({
              data: allRuns,
              timestamp: Date.now(),
            })
          )
        }
      } catch (err) {
        if (!cancelled) {
          setIsLoadingProgressive(false)
          setError(err as Error)
        }
      }
    }

    loadRuns()

    return () => {
      cancelled = true
    }
  }, [activeProject?.id, releaseToLoad, allFoldersData])

  const allRuns = progressiveRuns
  const isLoading = isLoadingProgressive && progressiveRuns.length === 0

  // Filter runs
  const filteredRuns = allRuns.filter((run) => {
    if (selectedProject) {
      const selectedId = Number(selectedProject.id)
      const runProjectId = Number(run.project.id)

      if (isNaN(selectedId) || isNaN(runProjectId) || selectedId !== runProjectId) {
        return false
      }
    }

    if (selectedUser && selectedUser !== 'all' && run.userInfo?.email !== selectedUser) {
      return false
    }

    if (
      selectedTestSuite &&
      selectedTestSuite !== 'all' &&
      String(run.script?.id) !== selectedTestSuite
    ) {
      return false
    }

    if (effectiveFolderId && effectiveFolderId !== 'all' && effectiveFolderId !== 'latest') {
      if (String(run.folder?.id) !== effectiveFolderId) {
        return false
      }
    }

    if (selectedState !== 'all') {
      const progress = run.progress || { total: 0, pass: 0, fail: 0, block: 0 }
      const total = progress.total || 0
      const pass = progress.pass || 0
      const fail = progress.fail || 0
      const block = progress.block || 0
      const completedCount = pass + fail + block

      let effectiveState = 'new'
      if (total > 0 && completedCount === total) {
        effectiveState = 'completed'
      } else if (completedCount > 0) {
        effectiveState = 'started'
      }

      const hasIssues = block > 0 || fail > 0

      if (selectedState === 'active' && effectiveState !== 'started') return false
      if (selectedState === 'completed' && effectiveState !== 'completed') return false
      if (selectedState === 'blocked' && !hasIssues) return false
    }

    return true
  })

  // Get unique users list (normalized, emails first then names)
  const users = useMemo(() => {
    const userSet = new Set(historicalTesters)
    allRuns.forEach((run) => {
      const normalized = normalizeTester(run.userInfo?.email)
      if (normalized) userSet.add(normalized)
    })
    return sortTesters(Array.from(userSet))
  }, [historicalTesters, allRuns])

  // Get unique test suites list
  const testSuites = useMemo(() => {
    const suites = new Map<string | number, { id: string | number; name: string }>()
    allRuns.forEach((run) => {
      if (run.script?.id && run.script?.name) {
        suites.set(run.script.id, {
          id: run.script.id,
          name: run.script.name,
        })
      }
    })
    return Array.from(suites.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allRuns])

  const folders = folderReleases

  // Group runs by script
  const runsByScript = useMemo(() => {
    const grouped: Record<string, ScriptGroup> = {}
    filteredRuns.forEach((run) => {
      const scriptId = String(run.script?.id)
      if (!scriptId) return

      if (
        selectedTestSuite &&
        run.userInfo?.isGuest &&
        (run.userInfo?.email === 'guest' ||
          !run.userInfo?.email ||
          run.userInfo.email === String(run.id))
      ) {
        let guestEmail: string | null = null

        if (run.assignee?.email && run.assignee.email.includes('@')) {
          guestEmail = run.assignee.email
        } else if (run.fielddata?.[1]?.raw) {
          guestEmail = run.fielddata[1].raw
        } else if (run.fields?.['1']) {
          guestEmail = run.fields['1']
        } else if (run.data?.fielddata?.[1]?.raw) {
          guestEmail = run.data.fielddata[1].raw
        } else if (run.data?.fields?.['1']) {
          guestEmail = run.data.fields['1']
        } else if (run.emailSentTo) {
          guestEmail = run.emailSentTo
        } else if (run.data?.emailSentTo) {
          guestEmail = run.data.emailSentTo
        }

        if (guestEmail && guestEmail.includes('@') && run.userInfo) {
          run.userInfo.email = guestEmail
        }
      }

      if (!grouped[scriptId]) {
        grouped[scriptId] = {
          script: run.script,
          project: run.project,
          folder: run.folder,
          runs: [],
        }
      }

      grouped[scriptId].runs.push(run)
    })

    Object.keys(grouped).forEach((scriptId) => {
      grouped[scriptId].runs.sort((a, b) => {
        const aRunNum = parseInt(String(a.userInfo?.runNumber || a.id || 0))
        const bRunNum = parseInt(String(b.userInfo?.runNumber || b.id || 0))
        if (aRunNum !== bRunNum) {
          return aRunNum - bRunNum
        }

        const aDate = new Date(a.created || 0)
        const bDate = new Date(b.created || 0)
        return aDate.getTime() - bDate.getTime()
      })
    })

    return grouped
  }, [filteredRuns, selectedTestSuite])

  // Get the selected run for each script
  const getSelectedRunForScript = (scriptId: string, runs: Run[]): Run | null => {
    if (!runs || runs.length === 0) return null
    const selectedRunId = selectedRunByScript[scriptId]
    if (selectedRunId) {
      const run = runs.find(
        (r) => r.id === selectedRunId || String(r.userInfo?.runNumber) === String(selectedRunId)
      )
      if (run) return run
    }
    return runs[0]
  }

  // Calculate global statistics
  const stats = useMemo(() => {
    const selectedRuns = Object.values(runsByScript)
      .map((group) => getSelectedRunForScript(String(group.script.id), group.runs))
      .filter(Boolean) as Run[]

    return {
      total: selectedRuns.length,
      active: selectedRuns.filter((r) => r.state === 'started').length,
      completed: selectedRuns.filter((r) => r.state === 'completed').length,
      withFailures: selectedRuns.filter((r) => r.progress && r.progress.fail > 0).length,
      withBlocks: selectedRuns.filter((r) => r.progress && r.progress.block > 0).length,
    }
  }, [runsByScript, selectedRunByScript])

  // Get runs with critical alerts
  const criticalRuns = filteredRuns.filter(
    (run) =>
      (run.progress && run.progress.fail > 0) || (run.progress && run.progress.block > 0)
  )

  // State color helper
  const getStateVariant = (
    run: Run
  ): 'default' | 'secondary' | 'destructive' | 'outline' => {
    if (run.state === 'completed') return 'default'
    if (run.progress && run.progress.fail > 0) return 'destructive'
    if (run.progress && run.progress.block > 0) return 'secondary'
    if (run.state === 'started') return 'outline'
    return 'secondary'
  }

  // State icon helper
  const getStateIcon = (run: Run) => {
    if (run.state === 'completed') return <CheckCircle className="h-3 w-3" />
    if (run.progress && run.progress.fail > 0) return <XCircle className="h-3 w-3" />
    if (run.progress && run.progress.block > 0) return <PauseCircle className="h-3 w-3" />
    if (run.state === 'started') return <Clock className="h-3 w-3" />
    return null
  }

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return 'N/A'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    } catch {
      return 'N/A'
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Navigation Sidebar */}
      <aside className="w-64 text-white flex flex-col flex-shrink-0" style={{ backgroundColor: '#121827' }}>
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-bold text-lg">Testpad Admin</h2>
          <p className="text-xs text-gray-400 mt-1">{user?.email || 'user@bitfinex.com'}</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            if (item.type === 'divider') {
              return (
                <div key={item.key} className="pt-2">
                  <p className="px-4 text-xs text-gray-500 uppercase tracking-wider mb-2">{item.label}</p>
                </div>
              )
            }
            if (item.type === 'separator') {
              return <div key={item.key} className="border-t border-gray-700 my-4" />
            }
            const isActive = location.pathname === item.path
            return (
              <a
                key={item.key}
                href={item.disabled ? undefined : item.path}
                onClick={(e) => {
                  if (item.disabled) {
                    e.preventDefault()
                    return
                  }
                  e.preventDefault()
                  navigate(item.path!)
                }}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : item.disabled
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {item.label}
                {item.badge && (
                  <span className="ml-auto text-xs bg-yellow-600 text-white px-1.5 py-0.5 rounded">{item.badge}</span>
                )}
              </a>
            )
          })}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Test Runs</h1>
            <p className="text-gray-600">Monitor and manage all test executions</p>
          </div>

          {/* Global Metrics Panel */}
          <Card className="mb-6">
            <CardContent className="py-4">
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-500">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total Runs</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-500">{stats.active}</p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-yellow-500">{stats.withBlocks}</p>
                  <p className="text-sm text-muted-foreground">With Blocks</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-red-500">{stats.withFailures}</p>
                  <p className="text-sm text-muted-foreground">With Failures</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Critical Alerts */}
          {criticalRuns.length > 0 && !isCriticalAlertsClosed && (
            <div className="mb-3 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-400 rounded-md shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="font-semibold text-sm text-orange-700">
                    {criticalRuns.length} run{criticalRuns.length > 1 ? 's' : ''} with
                    critical issues
                  </span>
                </div>
                <div className="flex gap-2 items-center">
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 h-auto text-xs text-blue-500"
                    onClick={() => {
                      setSelectedState('blocked')
                      setIsCriticalAlertsClosed(true)
                    }}
                  >
                    Filter
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-0 h-4 w-4"
                    onClick={() => setIsCriticalAlertsClosed(true)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {criticalRuns.map((run, index) => {
                  const uniqueKey = `${run.project?.id || 'p'}-${run.script?.id || 's'}-${run.id || index}`
                  const displayName =
                    run.userInfo?.isGuest &&
                    run.userInfo?.email &&
                    run.userInfo.email !== 'guest' &&
                    run.userInfo.email.includes('@')
                      ? `Guest (${run.userInfo.email.split('@')[0]})`
                      : run.userInfo?.email?.split('@')[0] || 'Unknown'

                  return (
                    <button
                      key={uniqueKey}
                      onClick={() => {
                        setSelectedRun(run)
                        setIsCriticalAlertsClosed(true)
                      }}
                      className="px-2 py-1 bg-white border border-yellow-200 rounded text-xs hover:bg-yellow-50 hover:border-yellow-300 transition-colors"
                    >
                      <span className="font-medium">{displayName}</span>
                      <span className="text-gray-500"> - {run.script?.name || 'Unknown'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick Filter */}
          <Card className="mb-4">
            <CardContent className="py-3">
              <Button
                variant={selectedState === 'blocked' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setSelectedState(selectedState === 'blocked' ? 'all' : 'blocked')
                }}
              >
                Only with Issues
              </Button>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Project:</span>
                  <Select
                    value={String(activeProject?.id || 'all')}
                    onValueChange={(value) => {
                      setHasManuallySelectedProject(true)
                      if (value === 'all') {
                        setSelectedProject(null)
                      } else {
                        const project = projects.find((p) => String(p.id) === value)
                        setSelectedProject(project || null)
                      }
                      setSelectedFolder('latest')
                      setSelectedTestSuite(null)
                      setSelectedRun(null)
                    }}
                  >
                    <SelectTrigger className={cn(
                      "w-[200px]",
                      selectedProject && "bg-cyan-50 border-cyan-400"
                    )}>
                      <SelectValue placeholder="All projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All projects</SelectItem>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={String(project.id)}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">User:</span>
                  <SearchableSelect
                    options={[
                      { value: 'all', label: 'All users' },
                      ...users.map((user) => ({ value: user, label: user }))
                    ]}
                    value={selectedUser}
                    onValueChange={setSelectedUser}
                    placeholder={testersLoading ? "Loading..." : "All users"}
                    searchPlaceholder="Search users..."
                    emptyMessage={testersLoading ? "Loading..." : "No user found."}
                    triggerClassName="w-[200px]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Test Suite:</span>
                  <SearchableSelect
                    options={[
                      { value: 'all', label: 'All test suites' },
                      ...testSuites.map((suite) => ({ value: String(suite.id), label: suite.name }))
                    ]}
                    value={selectedTestSuite || 'all'}
                    onValueChange={(value) => {
                      setSelectedTestSuite(value === 'all' ? null : value)
                    }}
                    placeholder="All test suites"
                    searchPlaceholder="Search test suites..."
                    triggerClassName="w-[200px]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Folder/Release:</span>
                  <Select
                    value={effectiveFolderId || selectedFolder || 'all'}
                    onValueChange={(value) => {
                      setSelectedFolder(value === 'all' ? 'all' : value)
                      setSelectedTestSuite(null)
                      setSelectedRun(null)
                    }}
                  >
                    <SelectTrigger className={cn(
                      "w-[200px]",
                      selectedFolder && selectedFolder !== 'all' && selectedFolder !== 'latest' && "bg-cyan-50 border-cyan-400"
                    )}>
                      <SelectValue placeholder="All folders" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All folders</SelectItem>
                      {folders.map((folder) => (
                        <SelectItem key={folder.id} value={String(folder.id)}>
                          {folder.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Status:</span>
                  <Select value={selectedState} onValueChange={setSelectedState}>
                    <SelectTrigger className={cn(
                      "w-[160px]",
                      selectedState && selectedState !== 'all' && "bg-cyan-50 border-cyan-400"
                    )}>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="active">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="blocked">With Issues</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedProject(null)
                    setSelectedUser('all')
                    setSelectedState('all')
                    setSelectedTestSuite(null)
                    setSelectedFolder('latest')
                    setHasManuallySelectedProject(false)
                  }}
                >
                  Reset Filters
                </Button>

                <div className="ml-auto flex items-center gap-3">
                  <LayoutGrid
                    className={cn(
                      'h-5 w-5 cursor-pointer transition-colors',
                      viewMode === 'grid' ? 'text-blue-500' : 'text-gray-400'
                    )}
                    onClick={() => setViewMode('grid')}
                  />
                  <List
                    className={cn(
                      'h-5 w-5 cursor-pointer transition-colors',
                      viewMode === 'horizontal' ? 'text-blue-500' : 'text-gray-400'
                    )}
                    onClick={() => setViewMode('horizontal')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Layout */}
          <div className="flex gap-4">
            {/* Main Content */}
            <div className="flex-1">
              {/* Loading */}
              {isLoading && progressiveRuns.length === 0 && (
                <div className="text-center py-10">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
                  <p className="mt-4 text-muted-foreground">
                    Loading runs from all projects...
                  </p>
                </div>
              )}

              {/* Loading more */}
              {isLoadingProgressive && progressiveRuns.length > 0 && (
                <div className="text-center py-5">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-500" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Loading more runs... ({progressiveRuns.length} loaded so far)
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p>{error?.message || 'An error occurred'}</p>
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 mt-2"
                      onClick={() => {
                        setError(null)
                        setProgressiveRuns([])
                        setIsLoadingProgressive(true)
                        const currentProject = selectedProject
                        setSelectedProject(null)
                        setTimeout(() => setSelectedProject(currentProject), 10)
                      }}
                    >
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Results count */}
              {!isLoading && !error && filteredRuns.length > 0 && (
                <p className="mb-4 text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-blue-500">{filteredRuns.length}</span>{' '}
                  run{filteredRuns.length !== 1 ? 's' : ''}
                  {allRuns.length !== filteredRuns.length && (
                    <span> of {allRuns.length} total</span>
                  )}
                </p>
              )}

              {/* Cards */}
              {(!isLoading || progressiveRuns.length > 0) && !error && (
                <>
                  {filteredRuns.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="font-semibold text-lg mb-2">
                        {allRuns.length === 0
                          ? 'No runs found in the system'
                          : 'No runs match the selected filters'}
                      </p>
                      {allRuns.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm text-muted-foreground mb-2">
                            There are {allRuns.length} run{allRuns.length !== 1 ? 's' : ''}{' '}
                            available, but none match your current filter combination.
                          </p>
                          <Button
                            variant="link"
                            onClick={() => {
                              setSelectedProject(null)
                              setSelectedUser('all')
                              setSelectedState('all')
                              setSelectedTestSuite(null)
                              setSelectedFolder('latest')
                              setHasManuallySelectedProject(false)
                            }}
                          >
                            Reset all filters
                          </Button>
                        </div>
                      )}
                      {allRuns.length === 0 && (
                        <p className="text-sm text-muted-foreground mt-2">
                          Create some test runs to get started.
                        </p>
                      )}
                    </div>
                  ) : viewMode === 'horizontal' ? (
                    // Horizontal view
                    <div className="space-y-4">
                      {Object.values(runsByScript).map((scriptGroup) => {
                        const scriptId = String(scriptGroup.script.id)
                        const runs = scriptGroup.runs
                        const isExpanded = expandedScripts[scriptId] || false

                        let totalPass = 0
                        let totalFail = 0
                        let totalBlock = 0
                        let totalTests = 0

                        runs.forEach((r) => {
                          const p = r.progress || { pass: 0, fail: 0, block: 0, total: 0 }
                          totalPass += p.pass || 0
                          totalFail += p.fail || 0
                          totalBlock += p.block || 0
                          totalTests += p.total || 0
                        })

                        const totalPercentage =
                          totalTests > 0 ? Math.round((totalPass / totalTests) * 100) : 0
                        const firstRun = runs[0]
                        if (!firstRun) return null

                        return (
                          <Card
                            key={`${firstRun.project?.id || 'p'}-${scriptId}`}
                            className={cn(
                              selectedRun?.script?.id === scriptGroup.script.id &&
                                'ring-2 ring-blue-500'
                            )}
                          >
                            <CardContent className="py-4">
                              {/* Header */}
                              <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="p-0 h-6 w-6"
                                    onClick={() => {
                                      setExpandedScripts((prev) => ({
                                        ...prev,
                                        [scriptId]: !prev[scriptId],
                                      }))
                                    }}
                                  >
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </Button>
                                  <span
                                    className="font-semibold cursor-pointer hover:text-blue-500"
                                    onClick={() => {
                                      const slug = createSlug(firstRun.script.name)
                                      sessionStorage.setItem('testSuiteContext', JSON.stringify({
                                        scriptId: scriptId,
                                        scriptName: firstRun.script.name,
                                      }))
                                      navigate(`/test-suite/${slug}`, {
                                        state: {
                                          project: firstRun.project,
                                          folder: firstRun.folder,
                                          scriptId: scriptId,
                                        },
                                      })
                                    }}
                                  >
                                    {firstRun.script.name}
                                  </span>
                                </div>
                                <Badge
                                  variant={
                                    totalFail > 0
                                      ? 'destructive'
                                      : totalBlock > 0
                                        ? 'secondary'
                                        : 'default'
                                  }
                                >
                                  {totalPass}/{totalTests} {totalPercentage}%
                                </Badge>
                              </div>

                              {/* Summary bar */}
                              <div className="mb-4">
                                <div className="flex items-center gap-6 mb-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-green-500" />
                                    <span className="text-sm">Pass {totalPass}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500" />
                                    <span className="text-sm">Fail {totalFail}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                                    <span className="text-sm">Blocked {totalBlock}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-purple-600" />
                                    <span className="text-sm">Query 0</span>
                                  </div>
                                </div>
                                <Progress value={totalPercentage} className="h-2" />
                                <p className="text-xs text-muted-foreground mt-1">
                                  {totalPass}/{totalTests} {totalPercentage}%
                                </p>
                              </div>

                              {/* Expanded runs list */}
                              {isExpanded && (
                                <div className="mt-4 pt-4 border-t">
                                  {runs.map((run) => {
                                    const progress = run.progress || {
                                      total: 0,
                                      pass: 0,
                                      fail: 0,
                                      block: 0,
                                    }
                                    const runTotal = progress.total || 0
                                    const runPass = progress.pass || 0
                                    const runFail = progress.fail || 0
                                    const runBlock = progress.block || 0
                                    const runPercentage =
                                      runTotal > 0
                                        ? Math.round((runPass / runTotal) * 100)
                                        : 0

                                    return (
                                      <div
                                        key={run.id || run.userInfo?.runNumber}
                                        className="flex items-center gap-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50"
                                        onClick={() => setSelectedRun(run)}
                                      >
                                        <div className="w-10 text-center">
                                          <span className="font-semibold">
                                            {run.userInfo?.runNumber || run.id}
                                          </span>
                                        </div>
                                        <div className="flex-1">
                                          <p className="font-semibold text-sm">
                                            {run.userInfo?.isGuest &&
                                            run.userInfo?.email &&
                                            run.userInfo.email !== 'guest' &&
                                            run.userInfo.email.includes('@')
                                              ? `Guest (${run.userInfo.email.split('@')[0]})`
                                              : run.userInfo?.email?.split('@')[0] || 'Unknown'}
                                          </p>
                                          <p className="text-xs text-muted-foreground">
                                            {formatDate(run.created)}
                                          </p>
                                        </div>
                                        <div className="flex-[2]">
                                          <Progress value={runPercentage} className="h-1.5" />
                                        </div>
                                        <div className="flex gap-4 min-w-[200px]">
                                          <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-full bg-green-500" />
                                            <span className="text-sm">{runPass}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-full bg-red-500" />
                                            <span className="text-sm">{runFail}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-full bg-yellow-500" />
                                            <span className="text-sm">{runBlock}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <div className="w-2 h-2 rounded-full bg-purple-600" />
                                            <span className="text-sm">0</span>
                                          </div>
                                        </div>
                                        <div className="min-w-[80px] text-right">
                                          <span className="text-sm">
                                            {runPass}/{runTotal} {runPercentage}%
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  ) : (
                    // Grid view
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Object.values(runsByScript).map((scriptGroup) => {
                        const scriptId = String(scriptGroup.script.id)
                        const runs = scriptGroup.runs
                        const run = getSelectedRunForScript(scriptId, runs)

                        if (!run) return null

                        const progress = run.progress || { total: 0, pass: 0, fail: 0, block: 0 }
                        const total = progress.total || 0
                        const passed = progress.pass || 0
                        const failed = progress.fail || 0
                        const blocked = progress.block || 0

                        let percentage = 0
                        if (total > 0) {
                          percentage = Math.round((passed / total) * 100)
                        }

                        let runState: string
                        if (percentage === 100) {
                          runState = 'completed'
                        } else if (percentage > 0) {
                          runState = 'started'
                        } else {
                          runState = 'new'
                        }
                        run.state = runState

                        const isSelected = selectedRun?.script?.id === scriptGroup.script.id
                        const hasIssues = failed > 0 || blocked > 0
                        const totalIssues = failed + blocked
                        const issuesExpanded = expandedIssues[scriptId] || false
                        const testsWithIssues = hasIssues ? getTestsWithIssues(run) : []

                        const uniqueKey = `${run.project?.id || 'p'}-${scriptId}`

                        return (
                          <div key={uniqueKey} className="relative">
                            <Card
                              className={cn(
                                'cursor-pointer transition-all hover:shadow-md',
                                isSelected && 'ring-2 ring-blue-500',
                                hasIssues && !isSelected && 'border-red-300'
                              )}
                              onClick={() => setSelectedRun(run)}
                            >
                              <CardContent className="p-4">
                                {/* Badge for issues */}
                                {hasIssues && (
                                  <div className="absolute -top-2 -right-2">
                                    <Badge variant={failed > 0 ? 'destructive' : 'secondary'}>
                                      {totalIssues} Issue{totalIssues > 1 ? 's' : ''}
                                    </Badge>
                                  </div>
                                )}

                                {/* Header with user */}
                                <div className="flex justify-between items-center mb-3">
                                  <div className="flex items-center gap-2">
                                    <Avatar className="h-6 w-6">
                                      <AvatarFallback className="bg-blue-500 text-white text-xs">
                                        {getInitials(run.userInfo?.email)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="text-xs font-semibold">
                                        {run.userInfo?.isGuest &&
                                        run.userInfo?.email &&
                                        run.userInfo.email !== 'guest' &&
                                        run.userInfo.email.includes('@')
                                          ? `Guest (${run.userInfo.email.split('@')[0]})`
                                          : run.userInfo?.email?.split('@')[0] || 'Unknown'}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground">
                                        {run.project.name}
                                        {run.folder && ` / ${run.folder.name}`}
                                      </p>
                                    </div>
                                  </div>
                                  {(() => {
                                    const emailWasSent = hasEmailSent(
                                      run.script.id as number,
                                      run.id as number
                                    )
                                    const isNew = run.state === 'new' || runState === 'new'

                                    if (isNew && emailWasSent) {
                                      const emailRecipient = getEmailRecipient(
                                        run.script.id as number,
                                        run.id as number
                                      )
                                      return (
                                        <div className="flex flex-col items-end gap-1">
                                          <Badge
                                            variant="default"
                                            className="bg-green-500 text-[10px]"
                                          >
                                            <CheckCircle className="h-2 w-2 mr-1" />
                                            Email Sent
                                          </Badge>
                                          {emailRecipient && (
                                            <span className="text-[9px] text-muted-foreground">
                                              To: {emailRecipient.split('@')[0]}
                                            </span>
                                          )}
                                          <Badge
                                            variant="secondary"
                                            className="text-[9px] bg-orange-100"
                                          >
                                            Status: NEW
                                          </Badge>
                                        </div>
                                      )
                                    }

                                    return (
                                      <Badge
                                        variant={getStateVariant(run)}
                                        className="text-[10px]"
                                      >
                                        {getStateIcon(run)}
                                        <span className="ml-1">{run.state || 'unknown'}</span>
                                      </Badge>
                                    )
                                  })()}
                                </div>

                                {/* Test Suite with Run Selector */}
                                <div className="mb-3">
                                  <div className="flex justify-between items-center mb-2">
                                    <span
                                      className="text-sm font-semibold text-blue-500 cursor-pointer hover:underline"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        const slug = createSlug(run.script.name)
                                        sessionStorage.setItem('testSuiteContext', JSON.stringify({
                                          scriptId: run.script.id,
                                          scriptName: run.script.name,
                                        }))
                                        navigate(`/test-suite/${slug}`, {
                                          state: {
                                            project: run.project,
                                            folder: run.folder,
                                            scriptId: run.script.id,
                                          },
                                        })
                                      }}
                                    >
                                      {run.script.name}
                                    </span>
                                    {runs.length > 1 && (
                                      <Select
                                        value={String(run.id || run.userInfo?.runNumber)}
                                        onValueChange={(value) => {
                                          setSelectedRunByScript((prev) => ({
                                            ...prev,
                                            [scriptId]: value,
                                          }))
                                        }}
                                      >
                                        <SelectTrigger
                                          className="w-[100px] h-6 text-[10px]"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {runs.map((r) => (
                                            <SelectItem
                                              key={r.id || r.userInfo?.runNumber}
                                              value={String(r.id || r.userInfo?.runNumber)}
                                              className="text-xs"
                                            >
                                              Run #{r.userInfo?.runNumber || r.id}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </div>
                                  {runs.length > 1 && (
                                    <p className="text-[10px] text-muted-foreground">
                                      {runs.length} run(s) available
                                    </p>
                                  )}
                                </div>

                                {/* Progress */}
                                <div className="mb-3">
                                  <Progress value={percentage} className="h-2" />
                                  <p className="text-xs text-right mt-1">{percentage}%</p>
                                </div>

                                {/* Counters */}
                                <div className="flex gap-1 flex-wrap mb-2">
                                  {passed > 0 && (
                                    <Badge
                                      variant="default"
                                      className="text-[10px] bg-green-500"
                                    >
                                      Pass {passed}
                                    </Badge>
                                  )}
                                  {failed > 0 && (
                                    <Badge variant="destructive" className="text-[10px]">
                                      Fail {failed}
                                    </Badge>
                                  )}
                                  {blocked > 0 && (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] bg-yellow-100"
                                    >
                                      Block {blocked}
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-[10px]">
                                    Total {total}
                                  </Badge>
                                </div>

                                {/* Time or Issues button */}
                                {!hasIssues ? (
                                  <div className="pt-3 border-t">
                                    <p className="text-xs text-muted-foreground">
                                      Time: {formatElapsedTime(run.created)}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="pt-2 border-t">
                                    <Button
                                      variant={issuesExpanded ? 'default' : 'outline'}
                                      size="sm"
                                      className={cn(
                                        'w-full text-xs',
                                        failed > 0 &&
                                          !issuesExpanded &&
                                          'border-red-300 text-red-600 hover:bg-red-50'
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setExpandedIssues((prev) => ({
                                          ...prev,
                                          [scriptId]: !prev[scriptId],
                                        }))
                                      }}
                                    >
                                      <AlertTriangle className="h-3 w-3 mr-1" />
                                      {totalIssues} Issue{totalIssues > 1 ? 's' : ''} (
                                      {failed > 0 ? `${failed}F` : ''}
                                      {failed > 0 && blocked > 0 ? '/' : ''}
                                      {blocked > 0 ? `${blocked}B` : ''})
                                      {issuesExpanded ? (
                                        <ChevronUp className="h-3 w-3 ml-1" />
                                      ) : (
                                        <ChevronDown className="h-3 w-3 ml-1" />
                                      )}
                                    </Button>
                                  </div>
                                )}
                              </CardContent>
                            </Card>

                            {/* Floating issues panel */}
                            {hasIssues && issuesExpanded && (
                              <>
                                <div
                                  className="fixed inset-0 z-40"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setExpandedIssues((prev) => ({
                                      ...prev,
                                      [scriptId]: false,
                                    }))
                                  }}
                                />
                                <div
                                  className="absolute top-full left-0 right-0 z-50 bg-white border border-red-200 rounded-b-lg shadow-lg -mt-1 max-h-[250px] overflow-hidden"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div
                                    className={cn(
                                      'px-3 py-2 border-b flex justify-between items-center',
                                      failed > 0 ? 'bg-red-50' : 'bg-yellow-50'
                                    )}
                                  >
                                    <div className="flex gap-3">
                                      {failed > 0 && (
                                        <span className="text-xs text-red-500 flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-red-500" />
                                          {failed} Failed
                                        </span>
                                      )}
                                      {blocked > 0 && (
                                        <span className="text-xs text-yellow-600 flex items-center gap-1">
                                          <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                          {blocked} Blocked
                                        </span>
                                      )}
                                    </div>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="text-xs p-0 h-auto"
                                      onClick={() => {
                                        setSelectedRun(run)
                                        setExpandedIssues((prev) => ({
                                          ...prev,
                                          [scriptId]: false,
                                        }))
                                      }}
                                    >
                                      See all in panel
                                    </Button>
                                  </div>
                                  <div className="p-3 max-h-[180px] overflow-y-auto">
                                    {testsWithIssues.slice(0, 4).map((issue) => (
                                      <div
                                        key={issue.id}
                                        className={cn(
                                          'p-2 mb-2 rounded border-l-4',
                                          issue.status === 'fail'
                                            ? 'bg-red-50 border-red-500'
                                            : 'bg-yellow-50 border-yellow-500'
                                        )}
                                      >
                                        <div className="flex items-start gap-2">
                                          <Badge
                                            variant={
                                              issue.status === 'fail'
                                                ? 'destructive'
                                                : 'secondary'
                                            }
                                            className="text-[10px] shrink-0"
                                          >
                                            #{issue.number}
                                          </Badge>
                                          <span className="text-xs">
                                            {issue.text.length > 80
                                              ? issue.text.substring(0, 80) + '...'
                                              : issue.text}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                    {testsWithIssues.length > 4 && (
                                      <p className="text-center text-xs text-muted-foreground pt-2 border-t border-dashed">
                                        +{testsWithIssues.length - 4} more issue
                                        {testsWithIssues.length - 4 > 1 ? 's' : ''}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Side Panel */}
            <div className="w-[400px] shrink-0">
              <Card className="sticky top-4">
                <CardContent className="p-4">
                  {selectedRun ? (
                    <div>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-lg">Run Details</h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedRun(null)}
                        >
                          Close
                        </Button>
                      </div>

                      <hr className="my-3" />

                      {/* User Information */}
                      <Card className="mb-4">
                        <CardContent className="p-3">
                          <div className="flex items-center gap-3 mb-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="bg-blue-500 text-white">
                                {getInitials(selectedRun.userInfo?.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">
                                {selectedRun.userInfo?.isGuest &&
                                selectedRun.userInfo?.email &&
                                selectedRun.userInfo.email !== 'guest' &&
                                selectedRun.userInfo.email.includes('@')
                                  ? `Guest (${selectedRun.userInfo.email})`
                                  : selectedRun.userInfo?.email || 'Unknown'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {selectedRun.project.name}
                                {selectedRun.folder && ` / ${selectedRun.folder.name}`}
                              </p>
                            </div>
                          </div>
                          <Badge variant={getStateVariant(selectedRun)}>
                            {getStateIcon(selectedRun)}
                            <span className="ml-1">{selectedRun.state || 'unknown'}</span>
                          </Badge>
                        </CardContent>
                      </Card>

                      {/* Test Suite */}
                      <Card className="mb-4">
                        <CardContent className="p-3">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Test Suite
                          </p>
                          <p
                            className="text-blue-500 cursor-pointer hover:underline"
                            onClick={() => {
                              const slug = createSlug(selectedRun.script.name)
                              sessionStorage.setItem('testSuiteContext', JSON.stringify({
                                scriptId: selectedRun.script.id,
                                scriptName: selectedRun.script.name,
                              }))
                              navigate(`/test-suite/${slug}`, {
                                state: {
                                  project: selectedRun.project,
                                  folder: selectedRun.folder,
                                  scriptId: selectedRun.script.id,
                                },
                              })
                            }}
                          >
                            {selectedRun.script.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            Run #{selectedRun.userInfo?.runNumber || selectedRun.id}
                          </p>
                        </CardContent>
                      </Card>

                      {/* Progress */}
                      {selectedRun.progress && (
                        <Card className="mb-4">
                          <CardContent className="p-3">
                            <p className="font-semibold mb-4">Progress</p>

                            {/* Circular Progress placeholder - using regular progress */}
                            <div className="flex justify-center mb-4">
                              <div className="relative w-24 h-24 flex items-center justify-center">
                                <Progress
                                  value={
                                    selectedRun.state === 'completed'
                                      ? 100
                                      : selectedRun.progress?.total > 0
                                        ? Math.round(
                                            (selectedRun.progress.pass /
                                              selectedRun.progress.total) *
                                              100
                                          )
                                        : 0
                                  }
                                  className="h-3"
                                />
                              </div>
                            </div>

                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                              <div className="p-3 bg-gray-100 rounded text-center">
                                <p className="text-xs text-muted-foreground mb-1">Total</p>
                                <p className="text-xl font-bold">
                                  {selectedRun.progress.total || 0}
                                </p>
                              </div>
                              <div className="p-3 bg-green-50 border border-green-200 rounded text-center">
                                <p className="text-xs text-muted-foreground mb-1">Passed</p>
                                <p className="text-xl font-bold text-green-500">
                                  {selectedRun.progress.pass || 0}
                                </p>
                              </div>
                              {selectedRun.progress.fail > 0 && (
                                <div className="p-3 bg-red-50 border border-red-200 rounded text-center">
                                  <p className="text-xs text-muted-foreground mb-1">Failed</p>
                                  <p className="text-xl font-bold text-red-500">
                                    {selectedRun.progress.fail || 0}
                                  </p>
                                </div>
                              )}
                              {selectedRun.progress.block > 0 && (
                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-center">
                                  <p className="text-xs text-muted-foreground mb-1">Blocked</p>
                                  <p className="text-xl font-bold text-yellow-500">
                                    {selectedRun.progress.block || 0}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Summary */}
                            <div className="p-2 bg-gray-50 rounded border text-xs font-mono">
                              Pass:{' '}
                              <span className="text-green-500 font-bold">
                                {selectedRun.progress.pass || 0}
                              </span>{' '}
                              Fail:{' '}
                              <span className="text-red-500 font-bold">
                                {selectedRun.progress.fail || 0}
                              </span>{' '}
                              Block:{' '}
                              <span className="text-yellow-500 font-bold">
                                {selectedRun.progress.block || 0}
                              </span>{' '}
                              Total:{' '}
                              <span className="font-bold">
                                {selectedRun.progress.pass || 0}/{selectedRun.progress.total || 0}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Tests with Issues */}
                      {selectedRun.progress &&
                        (selectedRun.progress.fail > 0 || selectedRun.progress.block > 0) && (
                          <Card
                            className={cn(
                              'mb-4',
                              selectedRun.progress.fail > 0
                                ? 'bg-red-50 border-red-200'
                                : 'bg-yellow-50 border-yellow-200'
                            )}
                          >
                            <CardContent className="p-3">
                              <p
                                className={cn(
                                  'font-semibold text-sm mb-3',
                                  selectedRun.progress.fail > 0
                                    ? 'text-red-500'
                                    : 'text-yellow-600'
                                )}
                              >
                                Tests with Issues (
                                {(selectedRun.progress.fail || 0) +
                                  (selectedRun.progress.block || 0)}
                                )
                              </p>

                              <div className="flex gap-3 mb-3">
                                {selectedRun.progress.fail > 0 && (
                                  <span className="text-xs flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                                    {selectedRun.progress.fail} Failed
                                  </span>
                                )}
                                {selectedRun.progress.block > 0 && (
                                  <span className="text-xs flex items-center gap-1">
                                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                                    {selectedRun.progress.block} Blocked
                                  </span>
                                )}
                              </div>

                              <div className="max-h-[250px] overflow-y-auto">
                                {getTestsWithIssues(selectedRun).map((issue) => (
                                  <div
                                    key={issue.id}
                                    className={cn(
                                      'p-2 mb-2 bg-white rounded border-l-4',
                                      issue.status === 'fail'
                                        ? 'border-red-500'
                                        : 'border-yellow-500'
                                    )}
                                  >
                                    <div className="flex items-start gap-2">
                                      <Badge
                                        variant={
                                          issue.status === 'fail' ? 'destructive' : 'secondary'
                                        }
                                        className="text-[10px] shrink-0"
                                      >
                                        #{issue.number}{' '}
                                        {issue.status === 'fail' ? 'FAIL' : 'BLOCK'}
                                      </Badge>
                                      <span className="text-xs">{issue.text}</span>
                                    </div>
                                  </div>
                                ))}
                                {getTestsWithIssues(selectedRun).length === 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    Unable to identify specific failed tests
                                  </p>
                                )}
                              </div>

                              <div className="mt-3 pt-2 border-t">
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="p-0 text-xs"
                                  onClick={() => {
                                    const slug = createSlug(selectedRun.script.name)
                                    sessionStorage.setItem('testSuiteContext', JSON.stringify({
                                      scriptId: selectedRun.script.id,
                                      scriptName: selectedRun.script.name,
                                    }))
                                    navigate(`/test-suite/${slug}`, {
                                      state: {
                                        project: selectedRun.project,
                                        folder: selectedRun.folder,
                                        scriptId: selectedRun.script.id,
                                        runIndex: selectedRun.userInfo?.runNumber
                                          ? Number(selectedRun.userInfo.runNumber) - 1
                                          : 0,
                                        highlightIssues: true,
                                      },
                                    })
                                  }}
                                >
                                  View all tests with highlights
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )}

                      {/* Run Information */}
                      <Card className="mb-4">
                        <CardContent className="p-3">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">
                            Information
                          </p>
                          <div className="space-y-1 text-xs">
                            <p>
                              <span className="text-muted-foreground">Run ID: </span>
                              {selectedRun.id}
                            </p>
                            <p>
                              <span className="text-muted-foreground">Created: </span>
                              {selectedRun.created}
                            </p>
                            {selectedRun.userInfo?.date && (
                              <p>
                                <span className="text-muted-foreground">Date: </span>
                                {selectedRun.userInfo.date}
                              </p>
                            )}
                            <p>
                              <span className="text-muted-foreground">Elapsed Time: </span>
                              {formatElapsedTime(selectedRun.created)}
                            </p>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Test Cases */}
                      {selectedRun.tests &&
                        Array.isArray(selectedRun.tests) &&
                        selectedRun.tests.length > 0 && (
                          <Card>
                            <CardContent className="p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-3">
                                Test Cases ({selectedRun.tests.length})
                              </p>
                              <div className="max-h-[300px] overflow-y-auto">
                                {selectedRun.tests.slice(0, 50).map((test, index) => (
                                  <div
                                    key={test.id || index}
                                    className="py-1.5 border-b last:border-b-0"
                                  >
                                    <span className="text-xs">
                                      {index + 1}. {test.name || test.text || 'Test Case'}
                                    </span>
                                    {test.status && (
                                      <Badge
                                        variant={
                                          test.status === 'pass'
                                            ? 'default'
                                            : test.status === 'fail'
                                              ? 'destructive'
                                              : 'secondary'
                                        }
                                        className="ml-2 text-[10px]"
                                      >
                                        {test.status}
                                      </Badge>
                                    )}
                                  </div>
                                ))}
                                {selectedRun.tests.length > 50 && (
                                  <p className="text-xs text-muted-foreground mt-2">
                                    ... and {selectedRun.tests.length - 50} more
                                  </p>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        )}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-muted-foreground">
                      Select a run to view details
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
