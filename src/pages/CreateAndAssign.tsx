import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Check,
  Send,
  Search,
  X,
  Loader2,
} from 'lucide-react'
import { apiGet } from '../utils/api'
import { assignAndSendEmail } from '../api/assignAndSendEmail'
import { markEmailSent, hasEmailSent, getEmailRecipient } from '../utils/emailTracking'
import { normalizeTester, sortTesters } from '../utils/normalizeTester'
import { useGlobalTesters } from '../contexts/TestersContext'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Sidebar } from '@/components/layout/Sidebar'
import { getInitials, getAvatarColor } from '@/utils/helpers'
import { Project, Folder, FolderItem } from '@/types'

interface Script extends FolderItem {
  folder?: Folder | null
}

interface CreatedRun {
  id?: string | number
  _id?: string | number
  scriptId: number | string
  scriptName: string
  projectName: string
  folderName?: string | null
  folderId?: number | string | null
  status: 'success' | 'error'
  error?: string
  assignedTo?: string
  emailSent?: boolean
}

interface CreateAndAssignProps {
  embedded?: boolean
}

// API helper to create run
async function createRunAPI(scriptId: number | string): Promise<Record<string, unknown>> {
  let token: string | null = null
  try {
    const storedUser = localStorage.getItem('testpad_user')
    if (storedUser) {
      const userData = JSON.parse(storedUser)
      if (userData.apiToken) token = userData.apiToken
    }
  } catch {
    // ignore
  }
  if (!token) token = import.meta.env.VITE_TESTPAD_API_TOKEN
  if (!token) throw new Error('API token not found')

  const response = await fetch(`/api/v1/scripts/${scriptId}/runs`, {
    method: 'POST',
    headers: {
      Authorization: `apikey ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API Error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  return data.run || data
}


export default function CreateAndAssign({ embedded = false }: CreateAndAssignProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { user, logout } = useAuth()

  const handleSignOut = () => {
    logout()
    navigate('/login')
  }

  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null)
  const [selectedScriptIds, setSelectedScriptIds] = useState<Set<number | string>>(new Set())
  const [scriptSearchTerm, setScriptSearchTerm] = useState('')
  const [createdRuns, setCreatedRuns] = useState<CreatedRun[]>([])
  const [runAssignments, setRunAssignments] = useState<Record<string, string>>({})
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, string>>({})
  const [assigningRunId, setAssigningRunId] = useState<string | number | null>(null)
  const [quickAssignTester, setQuickAssignTester] = useState('')
  const [isQuickAssigning, setIsQuickAssigning] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [selectedReleaseFilter, setSelectedReleaseFilter] = useState<string | null>(null)

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/v1/projects'),
  })
  const projects: Project[] = (projectsData as any)?.projects || []

  // Auto-select Testpad Api Testing project
  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      const testpadApiProject = projects.find((p) =>
        p.name.toLowerCase().includes('testpad api testing')
      )
      if (testpadApiProject) setSelectedProject(testpadApiProject)
    }
  }, [projects, selectedProject])

  // Load folders
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ['folders', selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject?.id) return { folders: [] }
      return await apiGet(`/api/v1/projects/${selectedProject.id}/folders`)
    },
    enabled: !!selectedProject?.id,
  })

  const folders: Folder[] = useMemo(() => {
    if (!foldersData) return []
    if (Array.isArray(foldersData)) return foldersData as any
    const data = foldersData as any
    return data.folders || data.data?.folders || []
  }, [foldersData])

  // Auto-select first folder
  useEffect(() => {
    if (selectedProject && folders.length > 0 && !selectedFolder) {
      setSelectedFolder(folders[0])
    }
  }, [selectedProject, folders, selectedFolder])

  // Collect all scripts with folder info
  const allScripts: Script[] = useMemo(() => {
    function collectScripts(items: FolderItem[], parentFolder: Folder | null = null): Script[] {
      const scripts: Script[] = []
      for (const item of items) {
        if (item.type === 'script') {
          scripts.push({ ...item, folder: parentFolder })
        } else if (item.type === 'folder' && item.contents) {
          scripts.push(...collectScripts(item.contents, item as unknown as Folder))
        }
      }
      return scripts
    }
    return collectScripts(folders)
  }, [folders])

  const latestReleaseId = folders.length > 0 ? folders[0].id : null

  // Auto-select latest release when folders load
  useEffect(() => {
    if (folders.length > 0 && selectedReleaseFilter === null) {
      setSelectedReleaseFilter(String(folders[0].id))
    }
  }, [folders, selectedReleaseFilter])

  // Filter scripts by selected release
  const scriptsFilteredByRelease = useMemo(() => {
    if (selectedReleaseFilter === 'all') return allScripts
    const targetFolderId = selectedReleaseFilter || latestReleaseId
    return allScripts.filter((script) => String(script.folder?.id) === String(targetFolderId))
  }, [allScripts, selectedReleaseFilter, latestReleaseId])

  // Fetch run counts for scripts
  const { data: scriptRunCounts } = useQuery({
    queryKey: ['scriptRunCounts', selectedProject?.id, selectedReleaseFilter],
    queryFn: async () => {
      if (!selectedProject || scriptsFilteredByRelease.length === 0) return {}

      const counts: Record<string, number> = {}
      const MAX_CONCURRENT = 20

      for (let i = 0; i < scriptsFilteredByRelease.length; i += MAX_CONCURRENT) {
        const batch = scriptsFilteredByRelease.slice(i, i + MAX_CONCURRENT)
        const results = await Promise.allSettled(
          batch.map((script) => apiGet(`/api/v1/scripts/${script.id}`))
        )

        results.forEach((result, idx) => {
          const script = batch[idx]
          if (result.status === 'fulfilled' && result.value) {
            const scriptData = (result.value as any)?.script || result.value
            const runsCount = (scriptData as any).runs?.length || 0
            counts[String(script.id)] = runsCount + 1
          } else {
            counts[String(script.id)] = 1
          }
        })
      }

      return counts
    },
    enabled: !!selectedProject && scriptsFilteredByRelease.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Filter scripts by search
  const filteredScripts = useMemo(() => {
    if (!scriptSearchTerm) return scriptsFilteredByRelease
    const term = scriptSearchTerm.toLowerCase()
    return scriptsFilteredByRelease.filter(
      (script) =>
        script.name.toLowerCase().includes(term) || script.id.toString().includes(term)
    )
  }, [scriptsFilteredByRelease, scriptSearchTerm])

  // Selected scripts array
  const selectedScripts = useMemo(() => {
    return allScripts.filter((s) => selectedScriptIds.has(s.id))
  }, [allScripts, selectedScriptIds])

  // Get testers from global context (loaded once, cached in localStorage)
  const { testers: allTestersData, isLoading: testersLoading } = useGlobalTesters()

  // Extract users (normalized, emails first then names)
  const users = useMemo(() => {
    const userSet = new Set<string>()
    if (allTestersData && Array.isArray(allTestersData)) {
      allTestersData.forEach((email) => userSet.add(email))
    }
    Object.values(runAssignments).forEach((email) => {
      const normalized = normalizeTester(email)
      if (normalized) userSet.add(normalized)
    })
    return sortTesters(Array.from(userSet))
  }, [allTestersData, runAssignments])

  // Flag para saber si mostrar el dropdown de testers
  const testersReady = !testersLoading && users.length > 0

  // Create runs mutation
  const createRunsMutation = useMutation({
    mutationFn: async (scriptIds: (number | string)[]) => {
      const runs: CreatedRun[] = []
      const runPromises = scriptIds.map(async (scriptId) => {
        try {
          const run = await createRunAPI(scriptId)
          const script = allScripts.find((s) => s.id === scriptId)
          return {
            ...run,
            scriptId,
            scriptName: script?.name || `Script ${scriptId}`,
            projectName: selectedProject?.name || 'Unknown Project',
            folderName: script?.folder?.name || null,
            folderId: script?.folder?.id || null,
            status: 'success' as const,
          }
        } catch (error) {
          const script = allScripts.find((s) => s.id === scriptId)
          return {
            scriptId,
            scriptName: script?.name || `Script ${scriptId}`,
            projectName: selectedProject?.name || 'Unknown Project',
            folderName: script?.folder?.name || null,
            folderId: script?.folder?.id || null,
            status: 'error' as const,
            error: (error as Error).message,
          }
        }
      })

      const results = await Promise.allSettled(runPromises)
      results.forEach((result) => {
        if (result.status === 'fulfilled') runs.push(result.value as CreatedRun)
      })

      return runs
    },
    onSuccess: (runs) => {
      setCreatedRuns(runs)
      setCurrentStep(1)

      const successCount = runs.filter((r) => r.status === 'success').length
      const errorCount = runs.filter((r) => r.status === 'error').length

      if (successCount > 0) {
        toast.success(
          `${successCount} run(s) created${errorCount > 0 ? `, ${errorCount} failed` : ''}`
        )
      } else {
        toast.error('Failed to create runs')
      }

      queryClient.invalidateQueries({ queryKey: ['allRuns'] })
      queryClient.invalidateQueries({ queryKey: ['scriptRunCounts'] })
    },
    onError: (error) => {
      toast.error(`Error: ${(error as Error).message}`)
    },
  })

  // Handlers
  const handleCreateRuns = () => {
    if (selectedScriptIds.size === 0) {
      toast.warning('Please select at least one script')
      return
    }
    createRunsMutation.mutate(Array.from(selectedScriptIds))
  }

  const handleAssignAndSend = async (
    runId: string | number,
    testerEmail: string,
    scriptId: number | string,
    scriptName: string
  ) => {
    if (!testerEmail || !testerEmail.includes('@')) {
      toast.error('Invalid email address')
      return
    }

    setAssigningRunId(runId)

    try {
      await assignAndSendEmail(scriptId, runId, testerEmail, scriptName, user?.email, user?.password)
      markEmailSent(String(scriptId), String(runId), testerEmail)
      setRunAssignments((prev) => ({ ...prev, [runId]: testerEmail }))
      setPendingAssignments((prev) => {
        const u = { ...prev }
        delete u[String(runId)]
        return u
      })
      setCreatedRuns((prevRuns) =>
        prevRuns.map((r) =>
          (r.id || r._id) === runId ? { ...r, assignedTo: testerEmail, emailSent: true } : r
        )
      )
      toast.success(`Invitation sent to ${testerEmail}`)
    } catch (error) {
      toast.error(`Error: ${(error as Error).message}`)
    } finally {
      setAssigningRunId(null)
    }
  }

  const handleQuickAssignAll = async () => {
    if (!quickAssignTester || !quickAssignTester.includes('@')) {
      toast.warning('Please select a valid tester')
      return
    }

    const unassignedRuns = createdRuns.filter(
      (r) => r.status === 'success' && !runAssignments[String(r.id || r._id)]
    )

    if (unassignedRuns.length === 0) {
      toast.info('All runs already assigned')
      return
    }

    setIsQuickAssigning(true)
    let successCount = 0

    for (const run of unassignedRuns) {
      const runId = run.id || run._id
      try {
        await assignAndSendEmail(run.scriptId, runId!, quickAssignTester, run.scriptName, user?.email, user?.password)
        markEmailSent(String(run.scriptId), String(runId), quickAssignTester)
        setRunAssignments((prev) => ({ ...prev, [String(runId)]: quickAssignTester }))
        setCreatedRuns((prevRuns) =>
          prevRuns.map((r) =>
            (r.id || r._id) === runId
              ? { ...r, assignedTo: quickAssignTester, emailSent: true }
              : r
          )
        )
        successCount++
      } catch {
        // ignore
      }
    }

    setIsQuickAssigning(false)
    setQuickAssignTester('')
    if (successCount > 0) toast.success(`${successCount} invitation(s) sent`)
  }

  const toggleScript = (scriptId: number | string) => {
    setSelectedScriptIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(scriptId)) {
        newSet.delete(scriptId)
      } else {
        newSet.add(scriptId)
      }
      return newSet
    })
  }

  const selectAllScripts = () => {
    setSelectedScriptIds(new Set(filteredScripts.map((s) => s.id)))
  }

  const clearAllScripts = () => {
    setSelectedScriptIds(new Set())
  }

  // Stats
  const assignedCount = createdRuns.filter(
    (r) => r.status === 'success' && runAssignments[String(r.id || r._id)]
  ).length
  const totalSuccessRuns = createdRuns.filter((r) => r.status === 'success').length

  const content = (
    <>
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

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              className="px-4 py-2 text-sm font-medium border-b-2 -mb-px border-orange-500 text-orange-600"
            >
              Create Runs
            </button>
            <button
              className="px-4 py-2 text-sm font-medium border-b-2 -mb-px border-transparent text-gray-500 hover:text-gray-700"
              onClick={() => navigate('/assignments')}
            >
              Assign & Email
            </button>
          </div>
        </div>
      )}

      {/* Stepper */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold',
              currentStep >= 0 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
            )}>
              1
            </div>
            <div>
              <p className="font-medium text-gray-900">Select Scripts</p>
              <p className="text-sm text-gray-500">Choose scripts to test</p>
            </div>
          </div>
          <div className="flex-1 mx-8 h-px bg-gray-200" />
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold',
              currentStep >= 1 ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
            )}>
              2
            </div>
            <div>
              <p className={cn('font-medium', currentStep >= 1 ? 'text-gray-900' : 'text-gray-400')}>
                Assign & Send
              </p>
              <p className="text-sm text-gray-400">Assign testers</p>
            </div>
          </div>
        </div>
      </div>

      {/* Step 0: Select Scripts */}
      {currentStep === 0 && (
        <Card className="border-gray-200">
          <CardHeader className="pb-2">
            <h2 className="text-base font-semibold text-gray-900">
              Step 1: Select Scripts to Create Runs
            </h2>
          </CardHeader>
          <CardContent>
            {/* Filters Row */}
            <div className="flex gap-4 mb-4 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Project:</span>
                <Select
                  value={String(selectedProject?.id || '')}
                  onValueChange={(value) => {
                    const project = projects.find((p) => String(p.id) === value)
                    setSelectedProject(project || null)
                    setSelectedFolder(null)
                    setSelectedReleaseFilter(null)
                    setSelectedScriptIds(new Set())
                  }}
                >
                  <SelectTrigger className={cn(
                    "w-[160px]",
                    selectedProject && "bg-cyan-50 border-cyan-400"
                  )}>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={String(project.id)}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Release:</span>
                <Select
                  value={selectedReleaseFilter || ''}
                  onValueChange={(value) => {
                    setSelectedReleaseFilter(value)
                    setSelectedScriptIds(new Set())
                  }}
                  disabled={!selectedProject || foldersLoading}
                >
                  <SelectTrigger className={cn(
                    "w-[200px]",
                    selectedReleaseFilter && "bg-cyan-50 border-cyan-400"
                  )}>
                    <SelectValue placeholder="Select release" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Releases</SelectItem>
                    {folders.map((folder, index) => (
                      <SelectItem key={folder.id} value={String(folder.id)}>
                        <span className="flex items-center gap-2">
                          {folder.name}
                          {index === 0 && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 border border-green-400 rounded font-medium">
                              Latest
                            </span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Two Columns */}
            <div className="grid grid-cols-2 gap-4">
              {/* Left: Available Scripts */}
              <div className="border-2 border-gray-200 rounded-xl overflow-hidden shadow-lg">
                <div className="px-4 py-3 bg-gray-50 border-b-2 border-gray-200 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={
                        selectedScriptIds.size === filteredScripts.length &&
                        filteredScripts.length > 0
                      }
                      onCheckedChange={(checked) =>
                        checked ? selectAllScripts() : clearAllScripts()
                      }
                    />
                    <span className="font-semibold text-sm">
                      Available Scripts ({filteredScripts.length})
                    </span>
                    {selectedScriptIds.size > 0 && (
                      <Badge variant="secondary" className="ml-2">
                        {selectedScriptIds.size} selected
                      </Badge>
                    )}
                  </div>
                  <Button variant="link" size="sm" onClick={selectAllScripts}>
                    Select All
                  </Button>
                </div>

                {/* Search */}
                <div className="p-3 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search test suites..."
                      value={scriptSearchTerm}
                      onChange={(e) => setScriptSearchTerm(e.target.value)}
                      className="pl-10 border-2 border-orange-300 focus:border-orange-500 focus:ring-orange-500"
                    />
                  </div>
                  {scriptSearchTerm && (
                    <p className="mt-2 text-sm text-gray-500">
                      Showing <strong>{filteredScripts.length}</strong> of{' '}
                      {scriptsFilteredByRelease.length} scripts
                    </p>
                  )}
                </div>

                {/* List */}
                <div className="h-[400px] overflow-y-auto">
                  {filteredScripts.length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground">No scripts</p>
                  ) : (
                    filteredScripts.map((script) => {
                      const isSelected = selectedScriptIds.has(script.id)
                      const isLatestRelease = script.folder?.id === latestReleaseId
                      const nextRunNumber = scriptRunCounts?.[String(script.id)] || 1

                      return (
                        <div
                          key={script.id}
                          onClick={() => toggleScript(script.id)}
                          className={cn(
                            'px-4 py-3 cursor-pointer border-b border-gray-100 hover:bg-orange-50/50 transition-colors',
                            isSelected && 'bg-orange-50 border-l-[3px] border-l-orange-400'
                          )}
                        >
                          <div className="flex items-start">
                            <Checkbox checked={isSelected} className="mr-2 mt-1" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-medium text-sm text-gray-900">{script.name}</span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] font-bold font-mono',
                                    isLatestRelease ? 'bg-green-50 text-green-700 border-green-300' : 'bg-orange-50 text-orange-700 border-orange-300'
                                  )}
                                >
                                  {script.folder?.name || 'Unknown'}
                                </Badge>
                                <span className="text-xs text-orange-600 font-bold font-mono">
                                  Run #{nextRunNumber}
                                </span>
                              </div>
                              <p className="text-xs text-gray-500">
                                {selectedProject?.name}
                              </p>
                            </div>
                            <span className="text-[10px] text-muted-foreground">
                              ID: {script.id}
                            </span>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Right: Selected Scripts */}
              <div
                className={cn(
                  'rounded-xl overflow-hidden shadow-lg',
                  selectedScripts.length > 0 ? 'border-[3px] border-green-500' : 'border-2 border-gray-200'
                )}
              >
                <div
                  className={cn(
                    'px-4 py-3 border-b-2 flex justify-between items-center',
                    selectedScripts.length > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    <span className="font-semibold text-sm">
                      Selected Scripts ({selectedScripts.length})
                    </span>
                  </div>
                  {selectedScripts.length > 0 && (
                    <Button
                      variant="link"
                      size="sm"
                      className="text-red-500"
                      onClick={clearAllScripts}
                    >
                      Clear All
                    </Button>
                  )}
                </div>

                <div className="h-[400px] overflow-y-auto bg-white">
                  {selectedScripts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                      <svg className="h-16 w-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p>Click scripts on the left to add</p>
                    </div>
                  ) : (
                    selectedScripts.map((script) => {
                      const isLatestRelease = script.folder?.id === latestReleaseId
                      const nextRunNumber = scriptRunCounts?.[String(script.id)] || 1

                      return (
                        <div
                          key={script.id}
                          className="px-4 py-3 border-b border-gray-100 border-l-4 border-l-green-500"
                        >
                          <div className="flex items-start">
                            <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-sm text-gray-900">{script.name}</span>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px] font-bold font-mono',
                                    isLatestRelease ? 'bg-green-50 text-green-700 border-green-300' : 'bg-orange-50 text-orange-700 border-orange-300'
                                  )}
                                >
                                  {script.folder?.name}
                                </Badge>
                                <span className="text-xs text-orange-600 font-bold font-mono">
                                  Run #{nextRunNumber}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {selectedProject?.name}
                              </p>
                            </div>
                            <X
                              className="h-4 w-4 text-red-500 cursor-pointer mt-0.5"
                              onClick={() => toggleScript(script.id)}
                            />
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="p-3 bg-gray-50 border-t">
                  <p className="font-medium text-sm text-gray-700">{selectedScripts.length} scripts selected</p>
                  <p className="text-xs text-gray-500">
                    {selectedScripts.length} run(s) will be created
                  </p>
                </div>

                <div className="p-4 border-t-2 border-gray-200">
                  <Button
                    onClick={handleCreateRuns}
                    disabled={selectedScripts.length === 0 || createRunsMutation.isPending}
                    className={cn(
                      'w-full h-12 text-base font-bold shadow-md',
                      selectedScripts.length > 0 ? 'bg-orange-500 hover:bg-orange-600' : ''
                    )}
                    variant={selectedScripts.length > 0 ? 'default' : 'outline'}
                  >
                    {createRunsMutation.isPending && (
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    )}
                    <Plus className="mr-2 h-5 w-5" />
                    Create {selectedScripts.length} Run(s)
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Assign & Send */}
      {currentStep === 1 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Step 2: Assign Testers & Send Invitations</CardTitle>
              <div className="flex items-center gap-2">
                <Badge
                  variant={assignedCount === totalSuccessRuns ? 'default' : 'secondary'}
                  className={assignedCount === totalSuccessRuns ? 'bg-green-500' : ''}
                >
                  {assignedCount} / {totalSuccessRuns} assigned
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCurrentStep(0)
                    setCreatedRuns([])
                    setSelectedScriptIds(new Set())
                    setRunAssignments({})
                    setPendingAssignments({})
                  }}
                >
                  Create More Runs
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate('/assignments', {
                    state: {
                      projectId: selectedProject?.id,
                      releaseId: selectedReleaseFilter,
                    }
                  })}
                  className="bg-orange-500 hover:bg-orange-600"
                >
                  Batch Assignments
                  <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Quick Assign */}
            <Alert className="mb-4">
              <AlertDescription>
                <div className="flex flex-col gap-2">
                  <p className="font-semibold">
                    Quick Assign: Assign all unassigned runs to the same tester
                  </p>
                  <div className="flex gap-2">
                    <SearchableSelect
                      options={users.map((user) => ({ value: user, label: user }))}
                      value={quickAssignTester}
                      onValueChange={setQuickAssignTester}
                      placeholder={testersLoading ? "Loading testers..." : "Search tester..."}
                      searchPlaceholder="Search tester..."
                      emptyMessage={testersLoading ? "Loading..." : "No tester found."}
                      triggerClassName="w-[300px]"
                      disabled={testersLoading}
                    />
                    <Button
                      onClick={handleQuickAssignAll}
                      disabled={
                        !quickAssignTester ||
                        !quickAssignTester.includes('@') ||
                        assignedCount === totalSuccessRuns ||
                        isQuickAssigning
                      }
                    >
                      {isQuickAssigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <Send className="mr-2 h-4 w-4" />
                      Assign All & Send ({totalSuccessRuns - assignedCount})
                    </Button>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            <p className="text-sm text-muted-foreground mb-4">Or assign individually</p>

            <div className="rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">Run #</TableHead>
                    <TableHead>Test Suite</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead className="w-[400px]">Assign To</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {createdRuns
                    .filter((r) => r.status === 'success')
                    .map((record) => {
                      const runId = record.id || record._id
                      const currentAssignment =
                        runAssignments[String(runId)] || record.assignedTo
                      const pendingSelection = pendingAssignments[String(runId)] || ''
                      const isAssigning = assigningRunId === runId
                      const emailWasSent =
                        record.emailSent ||
                        hasEmailSent(String(record.scriptId), String(runId))
                      const emailRecipient = emailWasSent
                        ? getEmailRecipient(String(record.scriptId), String(runId))
                        : null

                      return (
                        <TableRow key={String(runId) || String(record.scriptId)}>
                          <TableCell>
                            <Badge variant="secondary">#{runId || 'N/A'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium mb-1">{record.scriptName}</div>
                            <div className="flex gap-1 flex-wrap">
                              {record.projectName && (
                                <Badge variant="outline" className="text-[10px]">
                                  {record.projectName}
                                </Badge>
                              )}
                              {record.folderName && (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'text-[10px]',
                                    record.folderId === latestReleaseId
                                      ? 'bg-green-50 text-green-700'
                                      : 'bg-yellow-50 text-yellow-700'
                                  )}
                                >
                                  {record.folderName}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {emailWasSent ? (
                              <div className="flex flex-col gap-1">
                                <Badge className="bg-green-500 text-xs">
                                  <Check className="h-3 w-3 mr-1" /> Email Sent
                                </Badge>
                                {emailRecipient && (
                                  <span className="text-[10px] text-muted-foreground">
                                    To: {emailRecipient.split('@')[0]}
                                  </span>
                                )}
                                <Badge variant="outline" className="text-[9px]">
                                  Status: NEW
                                </Badge>
                              </div>
                            ) : currentAssignment ? (
                              <Badge className="bg-green-500">
                                <Check className="h-3 w-3 mr-1" /> Sent
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-orange-100">
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {currentAssignment ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarFallback className={cn("text-xs text-white", getAvatarColor(currentAssignment))}>
                                    {getInitials(currentAssignment)}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm">{currentAssignment}</span>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <SearchableSelect
                                  options={users.map((user) => ({ value: user, label: user }))}
                                  value={pendingSelection}
                                  onValueChange={(val) =>
                                    setPendingAssignments((prev) => ({
                                      ...prev,
                                      [String(runId)]: val,
                                    }))
                                  }
                                  placeholder={testersLoading ? "Loading testers..." : "Search tester..."}
                                  searchPlaceholder="Search tester..."
                                  emptyMessage={testersLoading ? "Loading..." : "No tester found."}
                                  disabled={isAssigning || testersLoading}
                                  triggerClassName="flex-1"
                                />
                                <Button
                                  disabled={
                                    !pendingSelection ||
                                    !pendingSelection.includes('@') ||
                                    isAssigning
                                  }
                                  onClick={() =>
                                    handleAssignAndSend(
                                      runId!,
                                      pendingSelection,
                                      record.scriptId,
                                      record.scriptName
                                    )
                                  }
                                >
                                  {isAssigning && (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  )}
                                  <Send className="mr-2 h-4 w-4" />
                                  Send
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            </div>

            {assignedCount === totalSuccessRuns && totalSuccessRuns > 0 && (
              <Alert className="mt-4 bg-green-50 border-green-200">
                <Check className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-700">
                  All runs have been assigned! All invitations have been sent.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )

  if (embedded) return content

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar activeKey="create-run" />
      <main className="flex-1 overflow-auto p-6">{content}</main>
    </div>
  )
}
