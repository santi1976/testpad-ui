import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  ChevronDown,
  ChevronUp,
  Loader2,
  ArrowLeft,
  ArrowRight,
  X,
} from 'lucide-react'
import { apiGet } from '../utils/api'
import { useGlobalTesters } from '../contexts/TestersContext'
import { normalizeTester, sortTesters } from '../utils/normalizeTester'
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
  DialogContent as UIDialogContent,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Sidebar } from '../components/layout/Sidebar'
import { Project, Folder, FolderItem, Run, RunProgress, TesterGroup } from '@/types'
import {
  getInitials,
  displayNameFromEmail,
  getAvatarColor,
  AVATAR_COLORS
} from '@/utils/helpers'

// Local Helpers
function getRunState(run: Record<string, unknown>): string {
  if (run.state) return run.state as string
  const progress = run.progress as RunProgress | undefined
  if (progress) {
    const { pass = 0, fail = 0, block = 0, total = 0 } = progress
    const completed = (pass || 0) + (fail || 0) + (block || 0)
    if (total > 0 && completed === total) return 'completed'
    if (completed > 0) return 'started'
  }
  return 'new'
}

const WORKLOAD_COLORS = ['#22c55e', '#3b82f6', '#7c3aed', '#f59e0b', '#ec4899', '#0ea5e9', '#ef4444', '#059669']

const EXCLUDED_STORAGE_KEY = 'testpad_excluded_testers'

function loadExcludedTesters(): Set<string> {
  try {
    const stored = localStorage.getItem(EXCLUDED_STORAGE_KEY)
    if (stored) return new Set(JSON.parse(stored))
  } catch { /* ignore */ }
  return new Set()
}

function saveExcludedTesters(excluded: Set<string>) {
  localStorage.setItem(EXCLUDED_STORAGE_KEY, JSON.stringify([...excluded]))
}

// ─── Main Component ─────────────────────────────────────────────────────────
import { useState, useMemo, useCallback, useEffect } from 'react'

interface AssignmentsAndEmailProps {
  embedded?: boolean
}

export default function AssignmentsAndEmail({ embedded = false }: AssignmentsAndEmailProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  function getEffectiveTester(run: Run, assignments: Record<string, string>): string | null {
    if (run.id in assignments) {
      return assignments[run.id] || null
    }
    return null
  }

  // ─── State ──────────────────────────────────────────────────────────────
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedReleaseId, setSelectedReleaseId] = useState<string>('latest')
  const [selectedTestSuiteId, setSelectedTestSuiteId] = useState<string>('all')
  const [stateFilter, setStateFilter] = useState<string>('new')
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set())
  const [runAssignments, setRunAssignments] = useState<Record<string, string>>({})
  const [bulkTester, setBulkTester] = useState<string>('')
  const [sendingEmails, setSendingEmails] = useState(false)
  const [sendingRunIds, setSendingRunIds] = useState<Set<string>>(new Set())
  const [sendProgress, setSendProgress] = useState<{ current: number; total: number; sentRunIds: Set<string> }>({ current: 0, total: 0, sentRunIds: new Set() })
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [confirmTester, setConfirmTester] = useState<string | null>(null)
  const [excludedTesters, setExcludedTesters] = useState<Set<string>>(loadExcludedTesters)
  const [sentSectionOpen, setSentSectionOpen] = useState(false)

  // ─── Data Fetching ──────────────────────────────────────────────────────
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/v1/projects'),
  })

  const projects: Project[] = (projectsData as any)?.projects || []

  useEffect(() => {
    if (selectedProject === null && projects.length > 0) {
      const testpadApiProject = projects.find((p) =>
        p.name.toLowerCase().includes('testpad api testing')
      )
      if (testpadApiProject) setSelectedProject(testpadApiProject)
    }
  }, [projects, selectedProject])

  useEffect(() => {
    const navState = location.state as { projectId?: string | number; releaseId?: string } | null
    if (navState?.projectId && projects.length > 0) {
      const project = projects.find((p) => String(p.id) === String(navState.projectId))
      if (project) {
        setSelectedProject(project)
        if (navState.releaseId) {
          setSelectedReleaseId(navState.releaseId)
        }
        setSelectedTestSuiteId('all')
        window.history.replaceState({}, '')
      }
    }
  }, [projects, location.state])

  const activeProject =
    selectedProject ||
    projects.find((p) => p.name.toLowerCase().includes('testpad api testing')) ||
    null

  const { data: foldersData } = useQuery({
    queryKey: ['projectFolders', activeProject?.id],
    queryFn: async () => {
      if (!activeProject) return { folders: [], releases: [] }
      const response = await apiGet(`/api/v1/projects/${activeProject.id}/folders`) as { folders: FolderItem[] }
      const folders = response?.folders || []
      const releases = folders
        .filter((item: FolderItem) => item.type === 'folder')
        .map((folder: FolderItem) => ({ id: folder.id, name: folder.name, contents: folder.contents } as Folder))
        .sort((a: Folder, b: Folder) => String(b.name).localeCompare(String(a.name)))
      return { folders, releases }
    },
    enabled: !!activeProject,
    staleTime: 5 * 60 * 1000,
  })

  const folderReleases: Folder[] = foldersData?.releases || []
  const allFolders: FolderItem[] = foldersData?.folders || []
  const latestReleaseId = folderReleases.length > 0 ? folderReleases[0].id : null

  const { testers: historicalTesters, isLoading: testersLoading } = useGlobalTesters()

  const releaseToLoad = useMemo(() => {
    if (selectedReleaseId === 'latest' || selectedReleaseId === null) return folderReleases[0] || null
    if (selectedReleaseId === 'all') return 'all' as const
    return folderReleases.find((r) => String(r.id) === selectedReleaseId) || null
  }, [selectedReleaseId, folderReleases])

  const fetchRunsForRelease = useCallback(async () => {
    if (!activeProject || !releaseToLoad) return []
    const allRuns: Run[] = []
    const MAX_CONCURRENT_SCRIPTS = 30

    const getScriptsFromFolder = (folder: Folder): { script: FolderItem; folder: Folder }[] => {
      const scripts: { script: FolderItem; folder: Folder }[] = []
      if (folder.contents) {
        for (const item of folder.contents) {
          if (item.type === 'script') scripts.push({ script: item, folder })
        }
      }
      return scripts
    }

    const getAllScriptsFromFolders = (folders: FolderItem[]): { script: FolderItem; folder: Folder }[] => {
      const scripts: { script: FolderItem; folder: Folder }[] = []
      for (const folder of folders) {
        if (folder.type === 'folder' && folder.contents) {
          for (const item of folder.contents) {
            if (item.type === 'script') scripts.push({ script: item, folder: folder as unknown as Folder })
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
          const { script, folder, scriptData } = result.value as { script: FolderItem; folder: Folder; scriptData: any }
          const scriptDetails = scriptData?.script || scriptData
          if (scriptDetails.runs && Array.isArray(scriptDetails.runs)) {
            scriptDetails.runs.forEach((run: any) => {
              const state = getRunState(run)
              let testerEmail: string | null = null
              const headers = run.headers as Record<string, string> | undefined
              const testerFromHeaders = headers?._tester
              const assignee = run.assignee as { email?: string } | undefined
              const testerFromAssignee = assignee?.email
              if (testerFromHeaders && testerFromHeaders !== 'anyone' && testerFromHeaders.toLowerCase() !== 'guest') {
                testerEmail = testerFromHeaders
              } else if (testerFromAssignee && testerFromAssignee !== 'anyone' && testerFromAssignee.toLowerCase() !== 'guest') {
                testerEmail = testerFromAssignee
              }
              allRuns.push({
                id: `${script.id}-${run.id}`,
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

    return allRuns.sort((a, b) => (Number(b.runNumber) || 0) - (Number(a.runNumber) || 0))
  }, [activeProject, releaseToLoad, allFolders])

  const { data: runsData, isLoading, refetch } = useQuery({
    queryKey: ['runsForRelease', activeProject?.id, releaseToLoad === 'all' ? 'all' : (releaseToLoad as Folder)?.id],
    queryFn: fetchRunsForRelease,
    enabled: !!activeProject && !!releaseToLoad,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const allRuns: Run[] = runsData || []
  const releases = folderReleases

  const effectiveReleaseId = useMemo(() => {
    if (selectedReleaseId === 'latest' && releases.length > 0) return String(releases[0].id)
    if (selectedReleaseId === 'all') return 'all'
    return selectedReleaseId
  }, [selectedReleaseId, releases])

  const testSuites = useMemo(() => {
    const suiteMap = new Map<number | string, { id: number | string; name: string }>()
    allRuns.forEach((run) => {
      if (!suiteMap.has(run.scriptId)) suiteMap.set(run.scriptId, { id: run.scriptId, name: run.scriptName })
    })
    return Array.from(suiteMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allRuns])

  // ─── Testers (filtered by excluded) ────────────────────────────────────
  const allTesters = useMemo(() => {
    const testerSet = new Set(historicalTesters)
    allRuns.forEach((run) => {
      const normalized = normalizeTester(run.tester)
      if (normalized) testerSet.add(normalized)
    })
    Object.values(runAssignments).forEach((email) => {
      const normalized = normalizeTester(email)
      if (normalized) testerSet.add(normalized)
    })
    return sortTesters(Array.from(testerSet))
  }, [historicalTesters, allRuns, runAssignments])

  const availableTesters = useMemo(
    () => allTesters.filter((t) => !excludedTesters.has(t)),
    [allTesters, excludedTesters]
  )

  // ─── Run Categorization ────────────────────────────────────────────────
  const isLatestRelease = useCallback(
    (run: Run) => String(run.folderId) === String(latestReleaseId),
    [latestReleaseId]
  )

  const suiteFilterFn = useCallback(
    (run: Run) => selectedTestSuiteId === 'all' || String(run.scriptId) === selectedTestSuiteId,
    [selectedTestSuiteId]
  )

  const sentRuns = useMemo(
    () => allRuns.filter((run) => suiteFilterFn(run) && hasEmailSent(String(run.scriptId), String(run.runId))),
    [allRuns, suiteFilterFn]
  )

  const unassignedRuns = useMemo(() => {
    return allRuns
      .filter((run) => {
        if (!suiteFilterFn(run)) return false
        if (hasEmailSent(String(run.scriptId), String(run.runId))) return false
        if (stateFilter !== 'all' && run.state !== stateFilter) return false
        return !getEffectiveTester(run, runAssignments)
      })
      .sort((a, b) => {
        const relA = a.folderName || ''
        const relB = b.folderName || ''
        const relCmp = relB.localeCompare(relA) // latest first
        if (relCmp !== 0) return relCmp
        const suiteCmp = a.scriptName.localeCompare(b.scriptName)
        if (suiteCmp !== 0) return suiteCmp
        return (Number(a.runNumber) || 0) - (Number(b.runNumber) || 0)
      })
  }, [allRuns, suiteFilterFn, stateFilter, runAssignments])

  const assignedRuns = useMemo(
    () =>
      allRuns.filter((run) => {
        if (!suiteFilterFn(run)) return false
        if (hasEmailSent(String(run.scriptId), String(run.runId))) return false
        if (stateFilter !== 'all' && run.state !== stateFilter) return false
        return !!getEffectiveTester(run, runAssignments)
      }),
    [allRuns, suiteFilterFn, stateFilter, runAssignments]
  )

  // ─── Grouped data ──────────────────────────────────────────────────────
  const buildTesterGroups = useCallback(
    (runs: Run[], getTester: (run: Run) => string | null): TesterGroup[] => {
      const grouped: Record<string, Run[]> = {}
      runs.forEach((run) => {
        const tester = getTester(run)
        if (!tester) return
        if (!grouped[tester]) grouped[tester] = []
        grouped[tester].push(run)
      })
      return Object.entries(grouped)
        .map(([email, runs]) => {
          const byRelease: Record<string, Run[]> = {}
          runs.forEach((run) => {
            const rel = run.folderName || 'Unknown'
            if (!byRelease[rel]) byRelease[rel] = []
            byRelease[rel].push(run)
          })
          const releaseGroups = Object.entries(byRelease)
            .map(([name, relRuns]) => ({
              name,
              folderId: relRuns[0]?.folderId ?? null,
              isLatest: isLatestRelease(relRuns[0]),
              runs: relRuns.sort((a, b) => a.scriptName.localeCompare(b.scriptName) || (Number(a.runNumber) || 0) - (Number(b.runNumber) || 0)),
            }))
            .sort((a, b) => (a.isLatest === b.isLatest ? a.name.localeCompare(b.name) : a.isLatest ? -1 : 1))
          return {
            email,
            displayName: displayNameFromEmail(email),
            initials: getInitials(email),
            runs,
            releaseGroups,
            totalRuns: runs.length,
          }
        })
        .sort((a, b) => a.email.localeCompare(b.email))
    },
    [isLatestRelease]
  )

  // assignedByTester: filtered by suite (for right split panel)
  const assignedByTester = useMemo(
    () => buildTesterGroups(assignedRuns, (run) => getEffectiveTester(run, runAssignments)),
    [assignedRuns, runAssignments, buildTesterGroups]
  )

  // allAssignedRuns: ignores suite filter (for tester cards + Send All)
  const allAssignedRuns = useMemo(
    () =>
      allRuns.filter((run) => {
        if (hasEmailSent(String(run.scriptId), String(run.runId))) return false
        if (stateFilter !== 'all' && run.state !== stateFilter) return false
        return !!getEffectiveTester(run, runAssignments)
      }),
    [allRuns, stateFilter, runAssignments]
  )

  // allAssignedByTester: unfiltered by suite (for tester cards + Send All + confirmation)
  const allAssignedByTester = useMemo(
    () => buildTesterGroups(allAssignedRuns, (run) => getEffectiveTester(run, runAssignments)),
    [allAssignedRuns, runAssignments, buildTesterGroups]
  )

  const sentByTester = useMemo(
    () =>
      buildTesterGroups(sentRuns, (run) => {
        const recipient = getEmailRecipient(String(run.scriptId), String(run.runId))
        return recipient || run.tester || 'unknown'
      }),
    [sentRuns, buildTesterGroups]
  )

  const maxRunsPerTester = useMemo(
    () => Math.max(...allAssignedByTester.map((g) => g.totalRuns), 1),
    [allAssignedByTester]
  )

  // ─── Handlers ──────────────────────────────────────────────────────────
  const toggleRunSelection = (runId: string) => {
    setSelectedRunIds((prev) => {
      const next = new Set(prev)
      if (next.has(runId)) next.delete(runId)
      else next.add(runId)
      return next
    })
  }

  const toggleSelectAllUnassigned = () => {
    const allIds = unassignedRuns.map((r) => r.id)
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedRunIds.has(id))
    if (allSelected) {
      setSelectedRunIds((prev) => {
        const next = new Set(prev)
        allIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedRunIds((prev) => {
        const next = new Set(prev)
        allIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  const clearSelection = () => {
    setSelectedRunIds(new Set())
  }

  const applyBulkTester = () => {
    if (!bulkTester) {
      toast.warning('Select a tester first')
      return
    }
    const newAssignments = { ...runAssignments }
    let count = 0
    selectedRunIds.forEach((runId) => {
      const run = unassignedRuns.find((r) => r.id === runId)
      if (run) {
        newAssignments[runId] = bulkTester
        count++
      }
    })
    setRunAssignments(newAssignments)
    setSelectedRunIds(new Set())
    if (count > 0) {
      toast.success(`Assigned ${bulkTester.split('@')[0]} to ${count} runs`)
    }
  }

  const unassignRun = (runId: string) => {
    setRunAssignments((prev) => {
      const next = { ...prev }
      next[runId] = ''
      return next
    })
  }

  const toggleExcludeTester = (email: string) => {
    setExcludedTesters((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      saveExcludedTesters(next)
      return next
    })
  }

  // ─── Email Sending ─────────────────────────────────────────────────────
  const handleSendEmails = async (forTester?: string) => {
    // CRITICAL: Validate user has all required credentials before attempting to send
    if (!user?.email || !user?.password) {
      console.error('[handleSendEmails] ❌ Missing user credentials:', {
        email: user?.email ? '✅' : '❌ MISSING',
        password: user?.password ? '✅' : '❌ MISSING'
      })
      toast.error('Session expired or invalid. Please logout and login again with your Testpad password.')
      return
    }
    
    console.log('[handleSendEmails] ✅ User credentials verified:', {
      email: user.email,
      passwordLength: user.password.length
    })

    const runsToSend = allAssignedRuns.filter((run) => {
      const tester = getEffectiveTester(run, runAssignments)
      if (!tester) return false
      if (forTester && tester !== forTester) return false
      return run.state === 'new'
    })

    if (runsToSend.length === 0) {
      toast.warning('No runs ready to send.')
      return
    }

    const DELAY_BETWEEN_EMAILS_MS = 500
    const MAX_RETRIES = 3
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    const sendWithRetry = async (
      run: Run,
      testerEmail: string,
      attempt: number = 1
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        await assignAndSendEmail(
          run.scriptId,
          run.runId!,
          testerEmail,
          run.scriptName,
          user?.email,
          user?.password
        )
        return { success: true }
      } catch (error) {
        const errMsg = (error as Error).message
        if (attempt < MAX_RETRIES) {
          console.warn(`[Email] Retry ${attempt}/${MAX_RETRIES} for run #${run.runNumber}: ${errMsg}`)
          await delay(DELAY_BETWEEN_EMAILS_MS * attempt)
          return sendWithRetry(run, testerEmail, attempt + 1)
        }
        console.error(`[Email] FAILED after ${MAX_RETRIES} attempts: run #${run.runNumber}: ${errMsg}`)
        return { success: false, error: errMsg }
      }
    }

    setSendingEmails(true)
    setSendProgress({ current: 0, total: runsToSend.length, sentRunIds: new Set() })
    let successCount = 0
    let errorCount = 0
    const failedRuns: { runNumber: number; tester: string; error: string }[] = []
    const totalToSend = runsToSend.length

    console.log(`[Email Batch] Starting send of ${totalToSend} emails...`)

    for (let i = 0; i < runsToSend.length; i++) {
      const run = runsToSend[i]
      const testerEmail = getEffectiveTester(run, runAssignments)!
      setSendingRunIds((prev) => new Set([...prev, run.id]))

      if (totalToSend > 10) {
        toast.loading(`Sending ${i + 1} of ${totalToSend}...`, { id: 'email-progress' })
      }

      const result = await sendWithRetry(run, testerEmail)

      if (result.success) {
        console.log(`[Email ${i + 1}/${totalToSend}] run #${run.runNumber} → ${testerEmail}`)
        markEmailSent(String(run.scriptId), String(run.runId), testerEmail)
        successCount++
        setSendProgress((prev) => {
          const next = new Set(prev.sentRunIds)
          next.add(run.id)
          return { current: i + 1, total: totalToSend, sentRunIds: next }
        })
        setRunAssignments((prev) => {
          const next = { ...prev }
          delete next[run.id]
          return next
        })
      } else {
        errorCount++
        failedRuns.push({ runNumber: run.runNumber as number, tester: testerEmail, error: result.error || 'Unknown' })
      }

      setSendingRunIds((prev) => {
        const next = new Set(prev)
        next.delete(run.id)
        return next
      })

      if (i < runsToSend.length - 1) await delay(DELAY_BETWEEN_EMAILS_MS)
    }

    toast.dismiss('email-progress')
    setSendingEmails(false)
    setSendProgress({ current: 0, total: 0, sentRunIds: new Set() })

    console.log(`[Email Batch] Sent: ${successCount}/${totalToSend}`)
    if (failedRuns.length > 0) {
      failedRuns.forEach((f) => console.log(`  - Run #${f.runNumber} → ${f.tester}: ${f.error}`))
    }

    if (successCount > 0) toast.success(`Sent ${successCount} of ${totalToSend} emails`)
    if (errorCount > 0) {
      const failedList = failedRuns.map((f) => `#${f.runNumber}`).join(', ')
      toast.error(`Failed ${errorCount}: runs ${failedList}`, { duration: 10000 })
    }

    refetch()
  }

  // ─── Counts ────────────────────────────────────────────────────────────
  const selectedCount = useMemo(
    () => unassignedRuns.filter((r) => selectedRunIds.has(r.id)).length,
    [unassignedRuns, selectedRunIds]
  )

  const totalAssigned = allAssignedRuns.length
  const totalUnassigned = unassignedRuns.length
  const totalSent = sentRuns.length


  // ─── Loading State ─────────────────────────────────────────────────────
  if (isLoading && allRuns.length === 0) {
    const loadingContent = (
      <div className="p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-500" />
        <p className="mt-4 text-muted-foreground">Loading runs...</p>
      </div>
    )
    if (embedded) return loadingContent
    return (
      <div className="flex h-screen bg-slate-100">
        <Sidebar activeKey="assignments" />
        <main className="flex-1 overflow-auto p-6">{loadingContent}</main>
      </div>
    )
  }

  // ─── Confirmation modal runs ───────────────────────────────────────────
  const confirmRuns = confirmTester
    ? allAssignedRuns.filter((r) => getEffectiveTester(r, runAssignments) === confirmTester && r.state === 'new')
    : allAssignedRuns.filter((r) => r.state === 'new' && !!getEffectiveTester(r, runAssignments))

  const confirmGroups = buildTesterGroups(confirmRuns, (run) => getEffectiveTester(run, runAssignments))

  // ─── Content ───────────────────────────────────────────────────────────
  const content = (
    <TooltipProvider>
      <div>
        {/* Header */}
        {!embedded && (
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <Button variant="outline" size="sm" onClick={() => navigate('/')} className="text-gray-600">
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
              <button className="px-4 py-2 text-sm font-medium border-b-2 -mb-px border-blue-500 text-blue-600">
                Assign & Email
              </button>
            </div>
          </div>
        )}

        {/* ── Filters ─────────────────────────────────────────────────── */}
        <Card className="mb-5">
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
                  <SelectTrigger className={cn('w-[180px]', activeProject && 'bg-cyan-50 border-cyan-400')}>
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
                  <SelectTrigger className={cn('w-[180px]', effectiveReleaseId && effectiveReleaseId !== 'all' && 'bg-cyan-50 border-cyan-400')}>
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
                  <SelectTrigger className={cn('w-[200px]', selectedTestSuiteId !== 'all' && 'bg-cyan-50 border-cyan-400')}>
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
                  <SelectTrigger className={cn('w-[180px]', stateFilter !== 'all' && 'bg-cyan-50 border-cyan-400')}>
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

        {/* ── Excluded Testers ────────────────────────────────────────── */}
        {excludedTesters.size > 0 && (
          <div className="flex items-start gap-1.5 px-4 py-3 bg-red-50 border border-red-200 rounded-lg mb-4 flex-wrap">
            <span className="text-xs font-semibold text-red-600 whitespace-nowrap pt-0.5">
              Excluded ({excludedTesters.size}):
            </span>
            {[...excludedTesters].map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1 bg-white border border-red-200 rounded-full px-2 py-0.5 text-[10px] text-red-600"
              >
                {email.split('@')[0]}@
                <button onClick={() => toggleExcludeTester(email)} className="hover:text-red-800">
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Add exclusion button */}
        <div className="flex items-center gap-2 mb-4">
          <SearchableSelect
            options={allTesters
              .filter((t) => !excludedTesters.has(t))
              .map((t) => ({ value: t, label: t }))}
            value=""
            onValueChange={(email) => {
              if (email) toggleExcludeTester(email)
            }}
            placeholder="Exclude a tester..."
            searchPlaceholder="Search testers..."
            emptyMessage="No testers found."
            triggerClassName="w-[200px] h-8 text-xs"
          />
          <span className="text-xs text-gray-400">Excluded testers won&apos;t appear in assignment dropdowns</span>
        </div>

        {/* ── Sent Section ────────────────────────────────────────────── */}
        {totalSent > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg mb-5 overflow-hidden">
            <button
              onClick={() => setSentSectionOpen(!sentSectionOpen)}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-green-100/50 transition-colors"
            >
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span className="text-xs font-bold text-green-800">{totalSent} runs already sent:</span>
              <span className="text-[11px] text-green-700 flex-1 truncate">
                {sentByTester.map((g) => `${g.email.split('@')[0]}@ (${g.totalRuns})`).join(', ')}
              </span>
              {sentSectionOpen ? (
                <ChevronUp className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
              )}
            </button>

            {sentSectionOpen && (
              <div className="border-t border-green-200 px-4 py-3 max-h-[400px] overflow-y-auto">
                {sentByTester.map((group) => (
                  <div key={group.email} className="mb-3 last:mb-0">
                    <div className="text-xs font-semibold text-green-800 pb-1 border-b border-green-200">
                      {group.displayName} — {group.email.split('@')[0]}@ ({group.totalRuns})
                    </div>
                    {group.releaseGroups.map((rg) => (
                      <div key={rg.name} className="ml-2 mt-1">
                        <div className="text-[10px] font-medium text-green-600">{rg.name}</div>
                        {rg.runs.map((run) => (
                          <div key={run.id} className="flex items-center gap-2 py-0.5 text-[11px] text-green-700">
                            <span className="text-blue-500 font-semibold">#{run.runNumber}</span>
                            <span className="flex-1">{run.scriptName}</span>
                            <span className="text-orange-600 font-bold text-[11px]">
                              → {getEmailRecipient(String(run.scriptId), String(run.runId)) || run.tester || '?'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Split Panel ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-[1fr_40px_1fr] items-stretch mb-6" style={{ minHeight: '700px' }}>
          {/* LEFT: Unassigned */}
          <div className="rounded-xl border-[3px] border-orange-400 bg-white flex flex-col overflow-hidden shadow-lg" style={{ maxHeight: '700px' }}>
            <div className="px-4 py-3 bg-orange-50 border-b border-orange-200 flex items-center justify-between flex-shrink-0">
              <span className="text-base font-bold text-orange-900">Unassigned</span>
              <span className="text-xs font-bold bg-orange-500 text-white min-w-[28px] h-7 flex items-center justify-center rounded-full font-mono">
                {totalUnassigned}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {unassignedRuns.length === 0 ? (
                <p className="text-center py-10 text-sm text-gray-400">No unassigned runs</p>
              ) : (
                unassignedRuns.map((run: Run) => (
                  <div
                    key={run.id}
                    className={cn(
                      'flex items-center gap-3 px-5 py-2.5 min-h-[46px] border-b border-gray-100 text-sm hover:bg-orange-50/50 cursor-pointer transition-colors',
                      selectedRunIds.has(run.id) && 'bg-orange-50'
                    )}
                    onClick={() => toggleRunSelection(run.id)}
                  >
                    <Checkbox
                      checked={selectedRunIds.has(run.id)}
                      className="h-3.5 w-3.5 pointer-events-none flex-shrink-0"
                    />
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-2 py-0.5 flex-shrink-0 font-bold font-mono',
                        isLatestRelease(run) ? 'bg-green-50 text-green-700 border-green-300' : 'bg-orange-50 text-orange-700 border-orange-300'
                      )}
                    >
                      {run.folderName}
                    </Badge>
                    <span className="text-gray-700 truncate min-w-0 flex-1 font-medium">{run.scriptName}</span>
                    <span className="text-orange-600 font-bold whitespace-nowrap flex-shrink-0 text-sm font-mono">Run #{run.runNumber}</span>
                  </div>
                ))
              )}
            </div>
            <div className="px-4 py-3 border-t-2 border-gray-200 bg-gray-50 flex items-center gap-3 flex-shrink-0">
              <label className="text-xs text-gray-600 cursor-pointer flex items-center gap-1.5 flex-shrink-0 font-medium">
                <Checkbox
                  checked={unassignedRuns.length > 0 && unassignedRuns.every((r: Run) => selectedRunIds.has(r.id))}
                  onCheckedChange={toggleSelectAllUnassigned}
                  className="h-4 w-4"
                />
                Select All
              </label>
              <SearchableSelect
                options={availableTesters.map((t) => ({ value: t, label: t }))}
                value={bulkTester}
                onValueChange={setBulkTester}
                placeholder={testersLoading ? 'Loading...' : 'Assign to...'}
                searchPlaceholder="Search testers..."
                emptyMessage={testersLoading ? 'Loading...' : 'No tester found.'}
                triggerClassName="flex-1 min-w-0 h-9 text-sm"
                disabled={testersLoading}
              />
              <Button
                onClick={applyBulkTester}
                disabled={!bulkTester || selectedCount === 0}
                className="bg-orange-500 hover:bg-orange-600 text-sm font-bold h-10 min-w-[200px] px-5 flex-shrink-0 shadow-md"
              >
                Assign {selectedCount} to {bulkTester ? displayNameFromEmail(bulkTester) : '...'} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex items-center justify-center">
            <ArrowRight className="h-8 w-8 text-gray-400" />
          </div>

          {/* RIGHT: Assigned */}
          <div className="rounded-xl border-[3px] border-green-500 bg-white flex flex-col overflow-hidden shadow-lg" style={{ maxHeight: '700px' }}>
            <div className="px-4 py-3 bg-green-100 border-b border-green-200 flex items-center justify-between flex-shrink-0">
              <span className="text-base font-bold text-green-800">Assigned</span>
              <span className="text-xs font-bold bg-green-600 text-white min-w-[28px] h-7 flex items-center justify-center rounded-full font-mono">
                {totalAssigned}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {assignedByTester.length === 0 ? (
                <p className="text-center py-10 text-sm text-gray-400">No assigned runs yet</p>
              ) : (
                assignedByTester.map((group: TesterGroup) => (
                  <div key={group.email}>
                    <div className="flex items-center justify-between py-2.5 border-b-2 border-gray-200 mt-2 first:mt-0">
                      <span className="text-sm font-bold text-gray-800">
                        {group.displayName} <span className="text-gray-400 font-normal text-xs">— {group.email} ({group.totalRuns})</span>
                      </span>
                      <button
                        onClick={() => {
                          const next = { ...runAssignments }
                          group.runs.forEach((r) => { next[r.id] = '' })
                          setRunAssignments(next)
                        }}
                        className="w-7 h-7 rounded-md border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 hover:border-red-400 flex items-center justify-center flex-shrink-0 transition-colors"
                        disabled={sendingEmails}
                        title={`Unassign all from ${group.displayName}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {group.releaseGroups.map((rg) => (
                      <div key={rg.name}>
                        <div
                          className="text-[10px] font-bold font-mono mt-2 ml-1 px-2 py-1 rounded inline-block border text-orange-700 bg-orange-50 border-orange-300"
                        >
                          {rg.name}{rg.isLatest && ' -latest-'}
                        </div>
                        {rg.runs.map((run) => (
                          <div
                            key={run.id}
                            className={cn(
                              'flex items-center gap-2.5 py-2 px-3 mb-1.5 rounded-lg bg-green-50 border border-green-200 text-sm',
                              sendingRunIds.has(run.id) && 'opacity-50'
                            )}
                          >
                            <Badge
                              variant="outline"
                              className="text-[10px] px-2 py-0.5 flex-shrink-0 font-bold font-mono bg-green-50 text-green-700 border-green-300"
                            >
                              {run.folderName}
                            </Badge>
                            <span className="flex-1 text-gray-700 truncate font-medium">{run.scriptName}</span>
                            <span className="text-green-700 font-bold whitespace-nowrap flex-shrink-0 font-mono">Run #{run.runNumber}</span>
                            <button
                              onClick={() => unassignRun(run.id)}
                              className="w-6 h-6 rounded-full border border-gray-200 bg-white text-gray-400 hover:text-red-500 hover:border-red-300 hover:bg-red-50 transition-colors flex-shrink-0 flex items-center justify-center"
                              disabled={sendingEmails}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Tester Cards (always show all, ignores suite filter) ──── */}
        {allAssignedByTester.length > 0 && (
          <>
            <h3 className="text-base font-bold text-gray-900 mb-3">
              Assigned by Tester ({allAssignedByTester.length} active) — Ready to Send
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3 mb-6">
              {allAssignedByTester.map((group) => {
                const workloadPct = Math.round((group.totalRuns / maxRunsPerTester) * 100)
                return (
                  <div key={group.email} className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden flex flex-col shadow-lg" style={{ height: '300px' }}>
                    {/* Card Header */}
                    <div className="px-4 py-3 flex items-center justify-between border-b-2 border-gray-200 bg-gray-50 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold',
                            getAvatarColor(group.email)
                          )}
                        >
                          {group.initials}
                        </div>
                        <div>
                          <div className="font-semibold text-[13px]">{group.displayName}</div>
                          <div className="text-[10px] text-gray-400">{group.email}</div>
                        </div>
                      </div>
                      <span className="text-xl font-bold font-mono text-green-700">{group.totalRuns}</span>
                      <button
                        onClick={() => {
                          const next = { ...runAssignments }
                          group.runs.forEach((r) => { next[r.id] = '' })
                          setRunAssignments(next)
                        }}
                        className="w-7 h-7 rounded-full border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 hover:border-red-400 flex items-center justify-center flex-shrink-0 transition-colors ml-2"
                        disabled={sendingEmails}
                        title={`Unassign all from ${group.displayName}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Card Body — fixed height, internal scroll */}
                    <div className="px-3.5 py-1 flex-1 overflow-y-auto">
                      {group.runs.map((run) => {
                        const isSending = sendingRunIds.has(run.id)
                        const wasSent = sendProgress.sentRunIds.has(run.id)
                        return (
                          <div key={run.id} className={cn(
                            'flex items-center gap-2 py-1.5 text-xs border-b border-gray-100 last:border-0 transition-all',
                            isSending && 'bg-orange-50',
                            wasSent && 'bg-green-50'
                          )}>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[9px] px-1.5 py-0 flex-shrink-0 font-bold font-mono',
                                'bg-green-50 text-green-700 border-green-300'
                              )}
                            >
                              {run.folderName}
                            </Badge>
                            <span className="flex-1 text-gray-600 truncate">{run.scriptName}</span>
                            <span className="text-green-700 font-bold whitespace-nowrap flex-shrink-0 font-mono text-xs">Run #{run.runNumber}</span>
                            {isSending && <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500 flex-shrink-0" />}
                            {wasSent && <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
                          </div>
                        )
                      })}
                    </div>

                    {/* Card Footer */}
                    <div className="px-4 py-3 border-t-2 border-gray-200 bg-gray-50 flex flex-col gap-2 flex-shrink-0">
                      {sendingEmails && sendProgress.total > 0 && group.runs.some((r) => sendingRunIds.has(r.id) || sendProgress.sentRunIds.has(r.id)) && (
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all duration-500"
                            style={{ width: `${Math.round((sendProgress.current / sendProgress.total) * 100)}%` }}
                          />
                        </div>
                      )}
                      <div className="flex items-center">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-3">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${workloadPct}%`,
                              backgroundColor: WORKLOAD_COLORS[allTesters.indexOf(group.email) % WORKLOAD_COLORS.length],
                            }}
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            setConfirmTester(group.email)
                            setConfirmModalOpen(true)
                          }}
                          disabled={sendingEmails || group.runs.filter((r) => r.state === 'new').length === 0}
                          className={cn(
                            'text-xs h-8 px-4 font-bold transition-all',
                            sendingEmails && group.runs.some((r) => sendingRunIds.has(r.id))
                              ? 'bg-orange-500 hover:bg-orange-600'
                              : 'bg-green-500 hover:bg-green-600'
                          )}
                        >
                          {sendingEmails && group.runs.some((r) => sendingRunIds.has(r.id)) ? (
                            <>
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                              Sending {sendProgress.current}/{sendProgress.total}...
                            </>
                          ) : (
                            <>Send {group.runs.filter((r) => r.state === 'new').length}</>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Send All Bar ────────────────────────────────────────────── */}
        {totalAssigned > 0 && (
          <div className="bg-green-50 border-[3px] border-green-500 rounded-xl px-6 py-5 flex items-center justify-between flex-wrap gap-3 mb-5 shadow-lg">
            <div>
              <div className="text-[15px] font-semibold">
                Send all: <span className="text-green-600">{totalAssigned} runs</span> to{' '}
                <span className="text-green-600">{allAssignedByTester.length} testers</span>
              </div>
              <div className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                {allAssignedByTester.map((g) => `${g.displayName} (${g.totalRuns})`).join(' · ')}
              </div>
              <div className="text-[11px] text-gray-400">
                {totalUnassigned} unassigned in pool · {totalSent} already sent · {excludedTesters.size} testers excluded
              </div>
            </div>
            <Button
              size="lg"
              onClick={() => {
                setConfirmTester(null)
                setConfirmModalOpen(true)
              }}
              disabled={sendingEmails || allAssignedRuns.filter((r) => r.state === 'new').length === 0}
              className={cn(
                'font-bold text-sm px-7 transition-all',
                sendingEmails ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-500 hover:bg-green-600'
              )}
            >
              {sendingEmails ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending {sendProgress.current}/{sendProgress.total}...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send All {allAssignedRuns.filter((r) => r.state === 'new').length} Assignments
                </>
              )}
            </Button>
          </div>
        )}

        {/* ── Confirmation Modal ──────────────────────────────────────── */}
        <Dialog open={confirmModalOpen} onOpenChange={setConfirmModalOpen}>
          <DialogContent className="max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Confirm Assignment & Send</DialogTitle>
              <DialogDescription>
                {confirmTester
                  ? `Send ${confirmRuns.length} run${confirmRuns.length > 1 ? 's' : ''} to ${displayNameFromEmail(confirmTester)}:`
                  : `Send ${confirmRuns.length} run${confirmRuns.length > 1 ? 's' : ''} to ${confirmGroups.length} tester${confirmGroups.length > 1 ? 's' : ''}:`}
              </DialogDescription>
            </DialogHeader>

            <div className="max-h-[400px] overflow-y-auto">
              {confirmGroups.map((group) => (
                <div key={group.email} className="border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="px-3 py-2 border-b bg-green-50 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold',
                          getAvatarColor(group.email)
                        )}
                      >
                        {group.initials}
                      </div>
                      <span className="font-semibold text-sm text-green-800">{group.displayName}</span>
                      <span className="text-xs text-green-600">{group.email}</span>
                    </div>
                    <span className="font-semibold text-sm">{group.totalRuns} run{group.totalRuns > 1 ? 's' : ''}</span>
                  </div>
                  <div className="px-3 py-2 bg-white">
                    {group.releaseGroups.map((rg: any) => (
                      <div key={rg.name}>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[9px] mb-1 mt-1',
                            rg.isLatest ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          )}
                        >
                          {rg.name}
                        </Badge>
                        {rg.runs.map((run: Run, idx: number) => (
                          <div
                            key={run.id}
                            className={cn('flex items-center gap-3 py-2', idx < rg.runs.length - 1 && 'border-b')}
                          >
                            <span className="text-blue-500 font-bold text-sm min-w-[45px]">#{run.runNumber}</span>
                            <span className="flex-1 font-medium text-sm">{run.scriptName}</span>
                          </div>
                        ))}
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
                  handleSendEmails(confirmTester || undefined)
                }}
                disabled={sendingEmails}
                className="bg-green-500 hover:bg-green-600"
              >
                {sendingEmails && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Send className="mr-2 h-4 w-4" />
                Confirm & Send ({confirmRuns.length})
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Warning ─────────────────────────────────────────────────── */}
        <Alert className="border-yellow-400 bg-yellow-50">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle className="text-yellow-800">Important Note</AlertTitle>
          <AlertDescription className="text-yellow-700">
            This app does not sync with Testpad&apos;s native assignment system. Runs marked as &quot;New&quot; may have
            already been assigned through Testpad directly. The &quot;New&quot; state only indicates that testing has not
            started yet.
          </AlertDescription>
        </Alert>
      </div>
    </TooltipProvider>
  )

  if (embedded) return content

  // ─── Full Page Layout ──────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar activeKey="assignments" />
      <main className="flex-1 overflow-auto p-6">{content}</main>
    </div>
  )
}
