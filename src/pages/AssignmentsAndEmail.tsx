import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Mail,
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import { apiGet } from '../utils/api'
import { assignAndSendEmail } from '../api/assignAndSendEmail'
import { markEmailSent, hasEmailSent, getEmailRecipient } from '../utils/emailTracking'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

interface RunProgress {
  pass?: number
  fail?: number
  block?: number
  total?: number
}

interface Run {
  id: string
  runId: number | string
  runNumber: number | string
  state: string
  tester: string | null
  scriptId: number | string
  scriptName: string
  projectId: number | string
  projectName: string
  folderId: number | string | null
  folderName: string | null
  created?: string
  progress?: RunProgress
  testerEmail?: string | null
}

interface Release {
  id: number | string
  name: string
  runs: Run[]
}

interface AssignmentsAndEmailProps {
  embedded?: boolean
}

// Get initials from email
function getInitials(email: string | undefined): string {
  if (!email) return '?'
  const parts = email.split('@')[0].split('.')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

// Determine run state from API data
function getRunState(run: Record<string, unknown>): string {
  if (run.state) return run.state as string

  const progress = run.progress as RunProgress | undefined
  if (progress) {
    const { pass = 0, fail = 0, block = 0, total = 0 } = progress
    const completed = pass + fail + block
    if (total > 0 && completed === total) return 'completed'
    if (completed > 0) return 'started'
  }
  return 'new'
}

// Stat box component
function StatBox({
  title,
  value,
  color,
}: {
  title: string
  value: number
  color?: string
}) {
  return (
    <div className="text-center">
      <div className={cn('text-2xl font-semibold', color || 'text-gray-800')}>{value}</div>
      <div className="text-sm text-gray-500">{title}</div>
    </div>
  )
}

export default function AssignmentsAndEmail({ embedded = false }: AssignmentsAndEmailProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', path: '/', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key: 'divider1', label: 'Test Execution', type: 'divider' },
    { key: 'create-run', label: 'Create Run', path: '/create-run', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
    { key: 'assignments', label: 'Assignments & Email', path: '/assignments', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { key: 'test-suites', label: 'Test Suites', path: '/test-suites', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'divider2', type: 'separator' },
    { key: 'reports', label: 'Reports', path: '#', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', disabled: true, badge: 'FUTURE' },
    { key: 'settings', label: 'Settings', path: '/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ]

  const handleSignOut = () => {
    logout()
    navigate('/login')
  }

  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>('latest')
  const [selectedTestSuiteId, setSelectedTestSuiteId] = useState<string>('all')
  const [stateFilter, setStateFilter] = useState<string>('new')
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set())
  const [runAssignments, setRunAssignments] = useState<Record<string, string>>({})
  const [bulkTester, setBulkTester] = useState<string>('')
  const [selectedRunsCache, setSelectedRunsCache] = useState<Record<string, Run>>({})
  const [sendingEmails, setSendingEmails] = useState(false)
  const [sendingRunIds, setSendingRunIds] = useState<Set<string>>(new Set())
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(false)
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)

  // Load projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/v1/projects'),
  })

  const projects: Project[] = projectsData?.projects || []

  // Auto-select Testpad Api Testing project
  useEffect(() => {
    if (selectedProject === null && projects.length > 0) {
      const testpadApiProject = projects.find((p) =>
        p.name.toLowerCase().includes('testpad api testing')
      )
      if (testpadApiProject) {
        setSelectedProject(testpadApiProject)
      }
    }
  }, [projects, selectedProject])

  const activeProject =
    selectedProject ||
    projects.find((p) => p.name.toLowerCase().includes('testpad api testing')) ||
    null

  // Fetch folders
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
  const allFolders: FolderItem[] = foldersData?.folders || []
  const latestReleaseId = folderReleases.length > 0 ? folderReleases[0].id : null

  // Fetch historical testers
  const { data: historicalTestersData } = useQuery({
    queryKey: ['historicalTesters', activeProject?.id],
    queryFn: async () => {
      if (!activeProject || folderReleases.length === 0) return []

      const testerSet = new Set<string>()

      const getAllScripts = (items: FolderItem[]): FolderItem[] => {
        const scripts: FolderItem[] = []
        for (const item of items) {
          if (item.type === 'script') {
            scripts.push(item)
          } else if (item.type === 'folder' && item.contents) {
            scripts.push(...getAllScripts(item.contents))
          }
        }
        return scripts
      }

      const allScripts = getAllScripts(allFolders)
      const MAX_CONCURRENT = 20

      for (let i = 0; i < allScripts.length; i += MAX_CONCURRENT) {
        const batch = allScripts.slice(i, i + MAX_CONCURRENT)
        const results = await Promise.allSettled(
          batch.map((script) => apiGet(`/api/v1/scripts/${script.id}`))
        )

        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value) {
            const scriptDetails = result.value?.script || result.value
            if (scriptDetails.runs && Array.isArray(scriptDetails.runs)) {
              scriptDetails.runs.forEach((run: Record<string, unknown>) => {
                const headers = run.headers as Record<string, string> | undefined
                const testerFromHeaders = headers?._tester
                if (
                  testerFromHeaders &&
                  testerFromHeaders.includes('@') &&
                  testerFromHeaders !== 'anyone' &&
                  testerFromHeaders.toLowerCase() !== 'guest'
                ) {
                  testerSet.add(testerFromHeaders)
                }
                const assignee = run.assignee as { email?: string } | undefined
                const testerFromAssignee = assignee?.email
                if (testerFromAssignee && testerFromAssignee.includes('@')) {
                  testerSet.add(testerFromAssignee)
                }
                if (run.label && typeof run.label === 'string') {
                  const parts = run.label.split(' / ')
                  if (parts.length >= 2) {
                    const email = parts[1].trim()
                    if (
                      email.includes('@') &&
                      email !== 'anyone' &&
                      email.toLowerCase() !== 'guest'
                    ) {
                      testerSet.add(email)
                    }
                  }
                }
              })
            }
          }
        })
      }

      return Array.from(testerSet).sort()
    },
    enabled: !!activeProject && folderReleases.length > 0 && allFolders.length > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  })

  const historicalTesters: string[] = historicalTestersData || []

  // Determine which release to load
  const releaseToLoad = useMemo(() => {
    if (selectedReleaseId === 'latest' || selectedReleaseId === null) {
      return folderReleases[0] || null
    }
    if (selectedReleaseId === 'all') {
      return 'all' as const
    }
    return folderReleases.find((r) => String(r.id) === selectedReleaseId) || null
  }, [selectedReleaseId, folderReleases])

  const fetchRunsForRelease = useCallback(async () => {
    if (!activeProject || !releaseToLoad) return []

    const allRuns: Run[] = []
    const MAX_CONCURRENT_SCRIPTS = 30

    const getScriptsFromFolder = (
      folder: Folder
    ): { script: FolderItem; folder: Folder }[] => {
      const scripts: { script: FolderItem; folder: Folder }[] = []
      if (folder.contents) {
        for (const item of folder.contents) {
          if (item.type === 'script') {
            scripts.push({ script: item, folder })
          }
        }
      }
      return scripts
    }

    const getAllScriptsFromFolders = (
      folders: FolderItem[]
    ): { script: FolderItem; folder: Folder }[] => {
      const scripts: { script: FolderItem; folder: Folder }[] = []
      for (const folder of folders) {
        if (folder.type === 'folder' && folder.contents) {
          for (const item of folder.contents) {
            if (item.type === 'script') {
              scripts.push({ script: item, folder: folder as unknown as Folder })
            }
          }
        }
      }
      return scripts
    }

    let scriptsWithFolders: { script: FolderItem; folder: Folder }[] = []
    if (releaseToLoad === 'all') {
      scriptsWithFolders = getAllScriptsFromFolders(allFolders)
    } else {
      scriptsWithFolders = getScriptsFromFolder(releaseToLoad as Folder)
    }

    for (let i = 0; i < scriptsWithFolders.length; i += MAX_CONCURRENT_SCRIPTS) {
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

          if (scriptDetails.runs && Array.isArray(scriptDetails.runs)) {
            scriptDetails.runs.forEach((run: Record<string, unknown>) => {
              const state = getRunState(run)

              let testerEmail: string | null = null
              const headers = run.headers as Record<string, string> | undefined
              const testerFromHeaders = headers?._tester
              const assignee = run.assignee as { email?: string } | undefined
              const testerFromAssignee = assignee?.email

              if (
                testerFromHeaders &&
                testerFromHeaders !== 'anyone' &&
                testerFromHeaders !== 'guest'
              ) {
                testerEmail = testerFromHeaders
              } else if (testerFromAssignee && testerFromAssignee.includes('@')) {
                testerEmail = testerFromAssignee
              }

              const uniqueId = `${script.id}-${run.id}`

              allRuns.push({
                id: uniqueId,
                runId: run.id as number,
                runNumber: (headers?._run || run.id) as number,
                state,
                tester: testerEmail,
                scriptId: script.id,
                scriptName: script.name,
                projectId: activeProject.id,
                projectName: activeProject.name,
                folderId: folder?.id || null,
                folderName: folder?.name || null,
                created: (run.created || headers?._createdDate) as string | undefined,
                progress: run.progress as RunProgress | undefined,
              })
            })
          }
        }
      })
    }

    return allRuns.sort(
      (a, b) => (Number(b.runNumber) || 0) - (Number(a.runNumber) || 0)
    )
  }, [activeProject, releaseToLoad, allFolders])

  const {
    data: runsData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [
      'runsForRelease',
      activeProject?.id,
      releaseToLoad === 'all' ? 'all' : (releaseToLoad as Folder)?.id,
    ],
    queryFn: fetchRunsForRelease,
    enabled: !!activeProject && !!releaseToLoad,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const allRuns: Run[] = runsData || []
  const releases = folderReleases

  const effectiveReleaseId = useMemo(() => {
    if (selectedReleaseId === 'latest' && releases.length > 0) {
      return String(releases[0].id)
    }
    if (selectedReleaseId === 'all') {
      return 'all'
    }
    return selectedReleaseId
  }, [selectedReleaseId, releases])

  // Get unique test suites
  const testSuites = useMemo(() => {
    const suiteMap = new Map<number | string, { id: number | string; name: string }>()
    allRuns.forEach((run) => {
      if (!suiteMap.has(run.scriptId)) {
        suiteMap.set(run.scriptId, {
          id: run.scriptId,
          name: run.scriptName,
        })
      }
    })
    return Array.from(suiteMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allRuns])

  // Get unique testers
  const allTesters = useMemo(() => {
    const testerSet = new Set(historicalTesters)
    allRuns.forEach((run) => {
      if (run.tester && run.tester.includes('@')) {
        testerSet.add(run.tester)
      }
    })
    Object.values(runAssignments).forEach((email) => {
      if (email && email.includes('@')) testerSet.add(email)
    })
    return Array.from(testerSet).sort()
  }, [historicalTesters, allRuns, runAssignments])

  // Filter runs
  const filteredRuns = useMemo(() => {
    const filtered = allRuns.filter((run) => {
      if (selectedTestSuiteId !== 'all' && String(run.scriptId) !== selectedTestSuiteId) {
        return false
      }
      if (stateFilter !== 'all' && run.state !== stateFilter) {
        return false
      }
      return true
    })

    return filtered.sort((a, b) => {
      const suiteCompare = a.scriptName.localeCompare(b.scriptName)
      if (suiteCompare !== 0) return suiteCompare
      return (Number(b.runNumber) || 0) - (Number(a.runNumber) || 0)
    })
  }, [allRuns, selectedTestSuiteId, stateFilter])

  // Stats
  const stats = useMemo(() => {
    const total = allRuns.length
    const newRuns = allRuns.filter((r) => r.state === 'new').length
    const started = allRuns.filter((r) => r.state === 'started').length
    const completed = allRuns.filter((r) => r.state === 'completed').length
    const assigned = allRuns.filter((r) => r.tester).length
    const unassigned = allRuns.filter((r) => !r.tester).length
    return { total, newRuns, started, completed, assigned, unassigned }
  }, [allRuns])

  // Handlers
  const toggleRunSelection = (runId: string, runInfo: Run | null = null) => {
    setSelectedRunIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(runId)) {
        newSet.delete(runId)
        setSelectedRunsCache((prevCache) => {
          const newCache = { ...prevCache }
          delete newCache[runId]
          return newCache
        })
      } else {
        newSet.add(runId)
        if (runInfo) {
          setSelectedRunsCache((prevCache) => ({
            ...prevCache,
            [runId]: runInfo,
          }))
        }
      }
      return newSet
    })
  }

  const selectAllNew = () => {
    const newRuns = filteredRuns.filter((r) => r.state === 'new')
    const newRunIds = newRuns.map((r) => r.id)

    setSelectedRunIds((prev) => {
      const newSet = new Set(prev)
      newRunIds.forEach((id) => newSet.add(id))
      return newSet
    })

    setSelectedRunsCache((prevCache) => {
      const newCache = { ...prevCache }
      newRuns.forEach((run) => {
        newCache[run.id] = run
      })
      return newCache
    })
  }

  const clearSelection = () => {
    setSelectedRunIds(new Set())
    setSelectedRunsCache({})
    setRunAssignments({})
  }

  const applyBulkTester = () => {
    if (!bulkTester) {
      toast.warning('Please select a user first')
      return
    }
    const newAssignments = { ...runAssignments }
    selectedRunIds.forEach((runId) => {
      const run = allRuns.find((r) => r.id === runId) || selectedRunsCache[runId]
      if (run && run.state === 'new') {
        newAssignments[runId] = bulkTester
      }
    })
    setRunAssignments(newAssignments)
    toast.success(`Applied ${bulkTester.split('@')[0]} to ${selectedRunIds.size} runs`)
  }

  const setRunTester = (runId: string, email: string) => {
    setRunAssignments((prev) => ({
      ...prev,
      [runId]: email,
    }))
  }

  // Combine current runs with cached selected runs
  const allSelectedRuns = useMemo(() => {
    const runsMap: Record<string, Run> = {}
    Object.values(selectedRunsCache).forEach((run) => {
      runsMap[run.id] = run
    })
    allRuns.forEach((run) => {
      if (selectedRunIds.has(run.id)) {
        runsMap[run.id] = run
      }
    })
    return Object.values(runsMap)
  }, [allRuns, selectedRunsCache, selectedRunIds])

  const handleSendEmails = async () => {
    const runsToSend = allSelectedRuns.filter(
      (run) =>
        selectedRunIds.has(run.id) && run.state === 'new' && runAssignments[run.id]
    )

    if (runsToSend.length === 0) {
      toast.warning('No runs ready to send. Select runs and assign testers.')
      return
    }

    setSendingEmails(true)
    let successCount = 0
    let errorCount = 0

    for (const run of runsToSend) {
      const testerEmail = runAssignments[run.id]
      setSendingRunIds((prev) => new Set([...prev, run.id]))

      try {
        await assignAndSendEmail(run.scriptId, run.runId, testerEmail, run.scriptName)
        markEmailSent(Number(run.scriptId), Number(run.runId), testerEmail)
        successCount++
        setSelectedRunIds((prev) => {
          const newSet = new Set(prev)
          newSet.delete(run.id)
          return newSet
        })
        setSelectedRunsCache((prev) => {
          const newCache = { ...prev }
          delete newCache[run.id]
          return newCache
        })
        setRunAssignments((prev) => {
          const newAssignments = { ...prev }
          delete newAssignments[run.id]
          return newAssignments
        })
      } catch (error) {
        errorCount++
        console.error(`Failed to send email for run ${run.id}:`, error)
      }

      setSendingRunIds((prev) => {
        const newSet = new Set(prev)
        newSet.delete(run.id)
        return newSet
      })
    }

    setSendingEmails(false)

    if (successCount > 0) {
      toast.success(`Successfully sent ${successCount} email(s)`)
    }
    if (errorCount > 0) {
      toast.error(`Failed to send ${errorCount} email(s)`)
    }

    refetch()
  }

  // Counts
  const readyToSendCount = allSelectedRuns.filter(
    (run) =>
      selectedRunIds.has(run.id) && run.state === 'new' && runAssignments[run.id]
  ).length

  const selectedNewCount = allSelectedRuns.filter(
    (run) => selectedRunIds.has(run.id) && run.state === 'new'
  ).length

  const visibleSelectedCount = filteredRuns.filter(
    (run) => selectedRunIds.has(run.id) && run.state === 'new'
  ).length

  const totalNewRuns = allRuns.filter((r) => r.state === 'new').length

  // Group selected runs by release for summary
  const allSelectedRunsByRelease = useMemo(() => {
    const selectedRuns = allSelectedRuns.filter(
      (run) => selectedRunIds.has(run.id) && run.state === 'new'
    )

    const grouped: Record<string, Release> = {}
    selectedRuns.forEach((run) => {
      const releaseKey = String(run.folderId || 'unknown')
      const releaseName = run.folderName || 'Unknown Release'
      if (!grouped[releaseKey]) {
        grouped[releaseKey] = {
          id: releaseKey,
          name: releaseName,
          runs: [],
        }
      }
      grouped[releaseKey].runs.push({
        ...run,
        testerEmail: runAssignments[run.id] || null,
      })
    })

    return Object.values(grouped).sort((a, b) => b.name.localeCompare(a.name))
  }, [allSelectedRuns, selectedRunIds, runAssignments])

  // Group ready-to-send runs by release for confirmation modal
  const selectedRunsByRelease = useMemo(() => {
    const runsReadyToSend = allSelectedRuns.filter(
      (run) =>
        selectedRunIds.has(run.id) && run.state === 'new' && runAssignments[run.id]
    )

    const grouped: Record<string, Release> = {}
    runsReadyToSend.forEach((run) => {
      const releaseKey = String(run.folderId || 'unknown')
      const releaseName = run.folderName || 'Unknown Release'
      if (!grouped[releaseKey]) {
        grouped[releaseKey] = {
          id: releaseKey,
          name: releaseName,
          runs: [],
        }
      }
      grouped[releaseKey].runs.push({
        ...run,
        testerEmail: runAssignments[run.id],
      })
    })

    return Object.values(grouped).sort((a, b) => b.name.localeCompare(a.name))
  }, [allSelectedRuns, selectedRunIds, runAssignments])

  // Loading state
  if (isLoading && allRuns.length === 0) {
    const loadingContent = (
      <div className="p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
        <p className="mt-4 text-muted-foreground">Loading runs...</p>
      </div>
    )

    if (embedded) return loadingContent

    return (
      <div className="flex h-screen bg-gray-50">
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
                    if (item.disabled) { e.preventDefault(); return }
                    e.preventDefault()
                    navigate(item.path!)
                  }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive ? 'bg-blue-600 text-white' : item.disabled ? 'text-gray-500 cursor-not-allowed' : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  {item.label}
                  {item.badge && <span className="ml-auto text-xs bg-yellow-600 text-white px-1.5 py-0.5 rounded">{item.badge}</span>}
                </a>
              )
            })}
          </nav>
          <div className="p-4 border-t border-gray-700">
            <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </aside>
        <main className="flex-1 overflow-auto p-6">{loadingContent}</main>
      </div>
    )
  }

  const content = (
    <TooltipProvider>
      <div>
        {/* Header */}
        {!embedded && (
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/')}
                className="text-gray-600"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">Run Management</h1>
            </div>
            <div className="flex border-b border-gray-200">
              <button
                className="px-4 py-2 text-sm font-medium border-b-2 -mb-px border-transparent text-gray-500 hover:text-gray-700"
                onClick={() => navigate('/create-run')}
              >
                Create Runs
              </button>
              <button
                className="px-4 py-2 text-sm font-medium border-b-2 -mb-px border-blue-500 text-blue-600"
              >
                Assign & Email
              </button>
            </div>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-6 gap-4 mb-6">
          <Card>
            <CardContent className="py-4">
              <StatBox title="Total Runs" value={stats.total} />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <StatBox title="Assigned" value={stats.assigned} color="text-green-500" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <StatBox title="Unassigned" value={stats.unassigned} color="text-red-500" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <StatBox title="New" value={stats.newRuns} color="text-yellow-500" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <StatBox title="Started" value={stats.started} color="text-blue-500" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <StatBox title="Completed" value={stats.completed} color="text-green-500" />
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Project:</span>
                <Select
                  value={String(activeProject?.id || '')}
                  onValueChange={(value) => {
                    const project = projects.find((p) => String(p.id) === value)
                    setSelectedProject(project || null)
                    setSelectedReleaseId('latest')
                    setSelectedTestSuiteId('all')
                    setSelectedRunIds(new Set())
                    setRunAssignments({})
                  }}
                >
                  <SelectTrigger className={cn(
                    "w-[180px]",
                    activeProject && "bg-cyan-50 border-cyan-400"
                  )}>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Release:</span>
                <Select
                  value={effectiveReleaseId || selectedReleaseId}
                  onValueChange={(value) => {
                    setSelectedReleaseId(value)
                    setSelectedTestSuiteId('all')
                  }}
                >
                  <SelectTrigger className={cn(
                    "w-[180px]",
                    effectiveReleaseId && effectiveReleaseId !== 'all' && "bg-cyan-50 border-cyan-400"
                  )}>
                    <SelectValue placeholder="Select release" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Releases</SelectItem>
                    {releases.map((r) => (
                      <SelectItem key={r.id} value={String(r.id)}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Test Suite:</span>
                <Select value={selectedTestSuiteId} onValueChange={setSelectedTestSuiteId}>
                  <SelectTrigger className={cn(
                    "w-[200px]",
                    selectedTestSuiteId && selectedTestSuiteId !== 'all' && "bg-cyan-50 border-cyan-400"
                  )}>
                    <SelectValue placeholder="All Test Suites" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Test Suites</SelectItem>
                    {testSuites.map((ts) => (
                      <SelectItem key={ts.id} value={String(ts.id)}>
                        {ts.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">State:</span>
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger className={cn(
                    "w-[180px]",
                    stateFilter && stateFilter !== 'all' && "bg-cyan-50 border-cyan-400"
                  )}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New (ready to assign)</SelectItem>
                    <SelectItem value="all">All States</SelectItem>
                    <SelectItem value="started">Started</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Batch Assignment Section */}
        <Card className="mb-6 bg-blue-50 border-blue-200">
          <CardContent className="py-4">
            <div className="mb-4 flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-500" />
              <span className="font-semibold text-blue-500">Batch Assignment</span>
              <span className="text-muted-foreground">— Assign multiple runs at once</span>
            </div>

            {/* Select All + Apply */}
            <div className="bg-white/80 p-4 rounded-lg border flex items-center gap-4 flex-wrap mb-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-white rounded border">
                <span className="text-2xl font-bold text-blue-500">{selectedNewCount}</span>
                <div>
                  <p className="text-sm text-gray-600 leading-tight">selected</p>
                  <p className="text-xs text-gray-400">
                    {selectedNewCount !== visibleSelectedCount
                      ? `(${visibleSelectedCount} visible)`
                      : `of ${totalNewRuns} new`}
                  </p>
                </div>
              </div>

              {selectedNewCount > 0 && (
                <Button variant="outline" onClick={clearSelection}>
                  Clear ({selectedNewCount})
                </Button>
              )}

              <Select value={bulkTester} onValueChange={setBulkTester}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Choose tester..." />
                </SelectTrigger>
                <SelectContent>
                  {allTesters.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm',
                  readyToSendCount > 0
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                )}
              >
                {readyToSendCount > 0 ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                {readyToSendCount} ready to send
              </div>

              <Button
                onClick={applyBulkTester}
                disabled={!bulkTester || selectedRunIds.size === 0}
              >
                Apply to {selectedNewCount} Selected
              </Button>
            </div>

            {/* Runs Table */}
            <div className="bg-white rounded-lg overflow-hidden border">
              {/* Header */}
              <div className="grid grid-cols-[40px_80px_1fr_100px_250px] px-4 py-3 border-b-2 font-semibold text-sm">
                <div></div>
                <div>Run #</div>
                <div>Test Suite</div>
                <div>State</div>
                <div>Assign To</div>
              </div>

              {/* Rows */}
              <div className="max-h-[400px] overflow-y-auto">
                {filteredRuns.length === 0 ? (
                  <p className="text-center py-10 text-muted-foreground">No runs found</p>
                ) : (
                  filteredRuns.map((run) => {
                    const isNew = run.state === 'new'
                    const isSelected = selectedRunIds.has(run.id)
                    const assignedTester = runAssignments[run.id] || ''
                    const isSending = sendingRunIds.has(run.id)
                    const emailWasSent = hasEmailSent(Number(run.scriptId), Number(run.runId))
                    const emailRecipient = emailWasSent
                      ? getEmailRecipient(Number(run.scriptId), Number(run.runId))
                      : null

                    return (
                      <div
                        key={run.id}
                        className={cn(
                          'grid grid-cols-[40px_80px_1fr_100px_250px] px-4 py-3 border-b items-center',
                          isNew
                            ? isSelected
                              ? 'bg-blue-50'
                              : 'bg-white'
                            : 'bg-gray-50 opacity-60'
                        )}
                      >
                        <div>
                          {isNew ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleRunSelection(run.id, run)}
                            />
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Checkbox disabled />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {run.state === 'started'
                                  ? 'Already started - cannot reassign'
                                  : 'Already completed'}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-blue-500">#{run.runNumber}</span>
                        </div>
                        <div>
                          <p className="font-medium">{run.scriptName}</p>
                          <div className="flex gap-1.5 mt-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                            >
                              {run.projectName}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px]',
                                String(run.folderId) === String(latestReleaseId)
                                  ? 'bg-green-50 text-green-700 border-green-200'
                                  : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                              )}
                            >
                              {String(run.folderId) === String(latestReleaseId) && 'Latest '}
                              {run.folderName}
                            </Badge>
                          </div>
                        </div>
                        <div>
                          {run.state === 'new' ? (
                            emailWasSent ? (
                              <div className="flex flex-col gap-1">
                                <Badge className="bg-green-500 text-xs">
                                  <CheckCircle className="h-3 w-3 mr-1" /> Email Sent
                                </Badge>
                                {emailRecipient && (
                                  <span className="text-[10px] text-muted-foreground">
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
                            ) : (
                              <Badge variant="secondary" className="bg-orange-100">
                                New
                              </Badge>
                            )
                          ) : run.state === 'started' ? (
                            <Badge variant="outline" className="text-blue-500 border-blue-200">
                              <Clock className="h-3 w-3 mr-1" /> Started
                            </Badge>
                          ) : run.state === 'completed' ? (
                            <Badge className="bg-green-500">
                              <CheckCircle className="h-3 w-3 mr-1" /> Completed
                            </Badge>
                          ) : null}
                        </div>
                        <div>
                          {isNew ? (
                            <Select
                              value={assignedTester || emailRecipient || ''}
                              onValueChange={(value) => setRunTester(run.id, value)}
                              disabled={isSending}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select tester..." />
                              </SelectTrigger>
                              <SelectContent>
                                {allTesters.map((t) => (
                                  <SelectItem key={t} value={t}>
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Select value={run.tester || ''} disabled>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                </Select>
                              </TooltipTrigger>
                              <TooltipContent>
                                {run.state === 'started'
                                  ? 'Already started'
                                  : 'Already completed'}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Summary Panel */}
            {selectedNewCount > 0 && (
              <div className="mt-5 bg-white border-2 border-blue-500 rounded-lg overflow-hidden shadow-sm">
                <div
                  onClick={() => setSummaryPanelOpen(!summaryPanelOpen)}
                  className="grid grid-cols-3 items-center px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 cursor-pointer"
                >
                  <span className="font-semibold text-white text-sm">
                    {selectedNewCount} runs selected{' '}
                    {readyToSendCount > 0 && `(${readyToSendCount} ready to send)`}
                  </span>
                  <div className="flex justify-center">
                    <span className="text-white font-bold uppercase tracking-wide flex items-center gap-2">
                      {summaryPanelOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {summaryPanelOpen ? 'COLLAPSE' : 'EXPAND'}
                    </span>
                  </div>
                  <div></div>
                </div>

                {summaryPanelOpen && (
                  <div className="p-4 max-h-[250px] overflow-y-auto bg-gray-50">
                    {allSelectedRunsByRelease.map((release, idx) => (
                      <div
                        key={release.id}
                        className={cn(
                          'bg-white rounded-md border overflow-hidden',
                          idx < allSelectedRunsByRelease.length - 1 && 'mb-4'
                        )}
                      >
                        <div
                          className={cn(
                            'px-3 py-2 border-b text-sm font-semibold',
                            String(release.id) === String(latestReleaseId)
                              ? 'bg-green-50 text-green-700'
                              : 'bg-yellow-50 text-yellow-700'
                          )}
                        >
                          {String(release.id) === String(latestReleaseId) && 'Latest '}
                          {release.name} — {release.runs.length} run
                          {release.runs.length > 1 ? 's' : ''}
                        </div>
                        <div className="px-3 py-2">
                          {release.runs.map((run, runIdx) => (
                            <div
                              key={run.id}
                              className={cn(
                                'flex items-center gap-3 py-2',
                                runIdx < release.runs.length - 1 && 'border-b'
                              )}
                            >
                              <span className="text-blue-500 font-bold min-w-[40px]">
                                #{run.runNumber}
                              </span>
                              <span className="flex-1 font-medium">{run.scriptName}</span>
                              {run.testerEmail ? (
                                <span className="text-green-600 text-sm font-medium bg-green-50 px-2 py-0.5 rounded border border-green-200">
                                  → {run.testerEmail}
                                </span>
                              ) : (
                                <span className="text-yellow-600 text-xs bg-yellow-50 px-2 py-0.5 rounded border border-yellow-200">
                                  No tester assigned
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Footer Actions */}
            <div className="flex justify-between items-center mt-4 p-4 bg-white rounded-lg border border-blue-500">
              <div>
                <p className="text-sm">
                  <span className="font-bold text-blue-500 text-lg">{selectedNewCount}</span>{' '}
                  <span className="text-gray-600">selected total</span>
                  {selectedNewCount !== visibleSelectedCount && (
                    <span className="text-gray-400 text-xs ml-1">
                      ({visibleSelectedCount} visible)
                    </span>
                  )}
                </p>
                <p className="text-sm text-green-500 mt-1 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  {readyToSendCount} have tester assigned
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="lg"
                      disabled={readyToSendCount === 0}
                      onClick={() => setConfirmModalOpen(true)}
                      className={cn(
                        'font-semibold',
                        readyToSendCount > 0 && 'bg-green-500 hover:bg-green-600'
                      )}
                    >
                      <Send className="mr-2 h-4 w-4" />
                      Assign & Send ({readyToSendCount})
                    </Button>
                  </span>
                </TooltipTrigger>
                {readyToSendCount === 0 && (
                  <TooltipContent>
                    Select a user first, then click &apos;Apply to Selected&apos;
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          </CardContent>
        </Card>

        {/* Confirmation Modal */}
        <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
          <DialogContent className="max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Confirm Assignment & Send</DialogTitle>
              <DialogDescription>
                You are about to assign and send emails to the following{' '}
                {readyToSendCount} run{readyToSendCount > 1 ? 's' : ''}:
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[400px] overflow-y-auto">
              {selectedRunsByRelease.map((release) => (
                <div
                  key={release.id}
                  className="border rounded-lg mb-3 overflow-hidden shadow-sm"
                >
                  <div
                    className={cn(
                      'px-3 py-2 border-b flex justify-between items-center',
                      String(release.id) === String(latestReleaseId)
                        ? 'bg-green-50'
                        : 'bg-yellow-50'
                    )}
                  >
                    <Badge
                      className={cn(
                        'text-white',
                        String(release.id) === String(latestReleaseId)
                          ? 'bg-green-500'
                          : 'bg-yellow-500'
                      )}
                    >
                      {String(release.id) === String(latestReleaseId) && 'Latest '}
                      {release.name}
                    </Badge>
                    <span className="font-semibold">
                      {release.runs.length} run{release.runs.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="px-3 py-2 bg-white">
                    {release.runs.map((run, idx) => (
                      <div
                        key={run.id}
                        className={cn(
                          'flex items-center gap-3 py-2.5',
                          idx < release.runs.length - 1 && 'border-b'
                        )}
                      >
                        <span className="text-blue-500 font-bold text-sm min-w-[45px]">
                          #{run.runNumber}
                        </span>
                        <span className="flex-1 font-medium">{run.scriptName}</span>
                        <span className="text-green-600 text-sm font-semibold bg-green-50 px-2.5 py-1 rounded border border-green-200">
                          → {run.testerEmail}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setConfirmModalOpen(false)
                  handleSendEmails()
                }}
                disabled={sendingEmails}
                className="bg-green-500 hover:bg-green-600"
              >
                {sendingEmails && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="mr-2 h-4 w-4" />
                Confirm & Send ({readyToSendCount})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Warning Note */}
        <Alert className="border-yellow-400 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Important Note</AlertTitle>
          <AlertDescription className="text-yellow-700">
            This app does not sync with Testpad&apos;s native assignment system. Runs marked
            as &quot;New&quot; may have already been assigned through Testpad directly. The
            &quot;New&quot; state only indicates that testing has not started yet.
          </AlertDescription>
        </Alert>
      </div>
    </TooltipProvider>
  )

  if (embedded) return content

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
        {content}
      </main>
    </div>
  )
}
