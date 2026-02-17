import { useState, useEffect } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Home,
  AlertTriangle,
  XCircle,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import { apiGet } from '../utils/api'
import { Sidebar } from '../components/layout/Sidebar'
import { hasEmailSent } from '../utils/emailTracking'
import { Button } from '@/components/ui/button'
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

import {
  getInitials,
  formatDate,
  createSlug,
  getAvatarColor,
  extractTesterFromRun,
} from '@/utils/helpers'
import {
  Project,
  Folder,
  FolderItem,
  Run as GlobalRun,
  RunProgress as GlobalRunProgress,
} from '@/types'

// Types
interface Test {
  id: string | number
  name?: string
  text?: string
}

interface TestIssue {
  id: string
  number: number
  text: string
  status: 'fail' | 'block'
}

interface RunProgress extends GlobalRunProgress {
  total: number
  pass: number
  fail: number
  block: number
  query?: number
}

interface Run extends Omit<any, 'project' | 'folder' | 'script' | 'progress' | 'id'> {
  id: string | number
  label?: string
  created?: string
  state?: string
  progress?: RunProgress
  results?: Record<string, string | { result: string }>
  headers?: Record<string, string>
  assignee?: { email?: string }
}

interface Script {
  id: string | number
  name: string
  description?: string
  created?: string
  tests?: Test[]
  runs?: Run[]
}

interface UserInfo {
  runNumber?: string | null
  email?: string | null
  date?: string | null
  fullLabel?: string
}

interface RunInfo {
  run: Run
  id: string | number
  created?: string
  state?: string
  label?: string
  userInfo: UserInfo | null
  stats: {
    total: number
    passed: number
    failed: number
    blocked: number
    query: number
    notRun: number
    percentage: number
  }
  allRuns: Run[]
}

// Get a map of test ID to status for a run
function getStatusMap(run: Run): Record<string, string> {
  const statusMap: Record<string, string> = {}
  if (!run?.results) return statusMap

  Object.entries(run.results).forEach(([testId, result]) => {
    const rawStatus = typeof result === 'object' ? (result as any)?.result : result
    const status = String(rawStatus).toLowerCase()

    if (status.startsWith('pass')) statusMap[testId] = 'pass'
    else if (status.startsWith('fail')) statusMap[testId] = 'fail'
    else if (status.startsWith('block')) statusMap[testId] = 'block'
    else if (status.startsWith('query')) statusMap[testId] = 'query'
  })
  return statusMap
}

export default function TestSuiteDetails() {
  const { scriptName } = useParams<{ scriptName: string }>()
  const navigate = useNavigate()
  const location = useLocation()


  const [selectedRunIndex, setSelectedRunIndex] = useState(0)

  // Get scriptId from state or sessionStorage
  const getScriptId = (): string | null => {
    // First try from navigation state
    const state = location.state as { scriptId?: string | number } | null
    if (state?.scriptId) {
      return String(state.scriptId)
    }
    // Fallback to sessionStorage
    try {
      const stored = sessionStorage.getItem('testSuiteContext')
      if (stored) {
        const parsed = JSON.parse(stored)
        return String(parsed.scriptId)
      }
    } catch {
      // ignore
    }
    return null
  }

  const scriptId = getScriptId()

  const [testFilter, setTestFilter] = useState<'all' | 'failed' | 'blocked' | 'issues'>(
    'all'
  )

  const { project, folder, runIndex: initialRunIndex } = (location.state as {
    scriptId?: string | number
    project?: Project
    folder?: Folder
    runIndex?: number
    highlightIssues?: boolean
  }) || {}

  useEffect(() => {
    if (initialRunIndex !== undefined) {
      setSelectedRunIndex(initialRunIndex)
    }
  }, [initialRunIndex])

  const {
    data: scriptData,
    isLoading: scriptLoading,
    error: scriptError,
  } = useQuery({
    queryKey: ['script', scriptId],
    queryFn: () => apiGet(`/api/v1/scripts/${scriptId}`),
    enabled: !!scriptId,
  })

  // If no scriptId available, show error
  if (!scriptId) {
    return (
      <div className="flex h-screen bg-slate-100">
        <Sidebar activeKey="test-suites" />
        <main className="flex-1 overflow-auto p-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Test suite not found. Please navigate from the Test Suites page.
            </AlertDescription>
          </Alert>
          <Button className="mt-4" onClick={() => navigate('/test-suites')}>
            Go to Test Suites
          </Button>
        </main>
      </div>
    )
  }

  const script: any = (scriptData as any)?.script || scriptData

  // DEBUG: log actual values
  if (scriptData && script?.runs) {
    script.runs.forEach((r: Run, i: number) => {
      console.log(`[DEBUG] Run ${i}: id=${r.id}, label=${r.label}, state=${r.state}`)
      console.log(`[DEBUG] Run ${i} progress:`, JSON.stringify(r.progress))
      console.log(`[DEBUG] Run ${i} results keys:`, r.results ? Object.keys(r.results).length : 'NO RESULTS')
      if (r.results) {
        const sample = Object.entries(r.results).slice(0, 3)
        console.log(`[DEBUG] Run ${i} results sample:`, JSON.stringify(sample))
      }
    })
  }

  const selectedRun = script?.runs?.[selectedRunIndex] || script?.runs?.[0] || null

  const getSelectedRunInfo = (): RunInfo | null => {
    if (
      !script ||
      !script.runs ||
      !Array.isArray(script.runs) ||
      script.runs.length === 0
    ) {
      return null
    }

    const sortedRuns = [...script.runs].sort((a, b) => {
      const aId = parseInt(String(a.id || a.headers?._run || 0))
      const bId = parseInt(String(b.id || b.headers?._run || 0))
      return bId - aId
    })

    const currentRun = sortedRuns[selectedRunIndex] || sortedRuns[0]
    const runProgress: any = currentRun.progress || {}
    const tests = script.tests || []

    // Count from results if progress is missing or incomplete
    let passedFromResults = 0
    let failedFromResults = 0
    let blockedFromResults = 0
    if (currentRun.results) {
      Object.values(currentRun.results).forEach((result) => {
        const status = typeof result === 'object' ? (result as { result?: string })?.result : result
        if (status === 'pass' || status === 'passed') passedFromResults++
        else if (status === 'fail' || status === 'failed') failedFromResults++
        else if (status === 'block' || status === 'blocked') blockedFromResults++
      })
    }

    const total = runProgress.total || tests.length
    const passed = runProgress.pass || passedFromResults
    const failed = runProgress.fail || failedFromResults
    const blocked = runProgress.block || blockedFromResults
    const query = runProgress.query || 0
    const notRun = total - passed - failed - blocked - query

    let userInfo: UserInfo | null = null
    if (currentRun.label) {
      const parts = currentRun.label.split(' / ')
      if (parts.length >= 2) {
        userInfo = {
          runNumber: parts[0] || null,
          email: parts[1] || null,
          date: parts[2] || null,
          fullLabel: currentRun.label,
        }
      }
    }

    if (!userInfo?.email) {
      const testerEmail = extractTesterFromRun(currentRun)
      if (testerEmail && testerEmail.includes('@')) {
        userInfo = userInfo || {}
        userInfo.email = testerEmail
      }
    }

    return {
      run: currentRun,
      id: currentRun.id,
      created: currentRun.created || currentRun.headers?._createdDate,
      state: currentRun.state,
      label: currentRun.label,
      userInfo: userInfo,
      stats: {
        total,
        passed,
        failed,
        blocked,
        query,
        notRun: notRun > 0 ? notRun : 0,
        percentage: total > 0 ? Math.round((passed / total) * 100) : 0,
      },
      allRuns: sortedRuns,
    }
  }

  const runInfo = getSelectedRunInfo()

  const handleBackToFolder = () => {
    navigate('/', {
      state: {
        projectId: project?.id,
        showFolders: true,
        folder: folder,
      },
    })
  }

  const handleBackToProject = () => {
    navigate('/', {
      state: {
        projectId: project?.id,
        showFolders: false,
      },
    })
  }

  // Prepare filtered tests for table
  const getFilteredTests = () => {
    if (!script?.tests) return []

    const currentRun = runInfo?.run || selectedRun
    const statusMap = currentRun ? getStatusMap(currentRun) : {}

    let filteredTests = script.tests.map((test: any, index: number) => ({
      ...test,
      _index: index + 1,
      _status: statusMap[String(test.id)] || 'none',
    }))

    if (testFilter === 'failed') {
      filteredTests = filteredTests.filter((t: any) => t._status === 'fail')
    } else if (testFilter === 'blocked') {
      filteredTests = filteredTests.filter((t: any) => t._status === 'block')
    } else if (testFilter === 'issues') {
      filteredTests = filteredTests.filter((t: any) => t._status === 'fail' || t._status === 'block')
    }

    return filteredTests
  }

  const filteredTests = getFilteredTests()

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar activeKey="test-suites" />

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-[1400px] mx-auto w-full">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-sm mb-5">
            <a
              className="text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1 cursor-pointer"
              onClick={() => navigate('/test-suites')}
            >
              <Home className="h-4 w-4" />
              {project?.name || 'Projects'}
            </a>
            {folder && (
              <>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
                <a
                  className="text-orange-600 hover:text-orange-700 font-medium cursor-pointer"
                  onClick={handleBackToFolder}
                >
                  {folder.name}
                </a>
              </>
            )}
            {script && (
              <>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
                <span className="text-gray-700 font-semibold">{script.name || 'Test Suite'}</span>
              </>
            )}
          </nav>

          {/* Header */}
          <div className="mb-5">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h1 className="text-2xl font-extrabold text-gray-900">{script?.name || 'Test Suite Details'}</h1>
                {script?.id && (
                  <p className="text-xs text-gray-400 mt-0.5 font-mono">ID: {script.id}</p>
                )}
              </div>
              <div className="flex gap-2">
                {folder && (
                  <button className="px-4 py-2 text-sm font-medium border-2 border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition-colors" onClick={handleBackToFolder}>
                    Back to Release
                  </button>
                )}
                <button className="px-4 py-2 text-sm font-medium border-2 border-gray-300 rounded-lg bg-white hover:bg-gray-50 text-gray-700 transition-colors" onClick={handleBackToProject}>
                  Back to Project
                </button>
              </div>
            </div>

            {/* Run Progress Card */}
            {runInfo && runInfo.stats && (
              <div className="bg-white border-2 border-gray-200 rounded-xl shadow-md p-5 mb-5">
                {/* Top: Suite info + Run selector */}
                <div className="flex justify-between items-start mb-5">
                  <div>
                    <p className="font-bold text-lg text-gray-900">
                      {script?.name || 'Test Suite'}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {folder && (
                        <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-300">
                          {folder.name}
                        </span>
                      )}
                      {project && (
                        <span className="text-xs text-gray-400">
                          {project.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {runInfo.allRuns && runInfo.allRuns.length > 1 && (
                    <Select
                      value={String(selectedRunIndex)}
                      onValueChange={(v) => setSelectedRunIndex(parseInt(v))}
                    >
                      <SelectTrigger className="w-[240px] border-2 border-gray-300 font-medium focus:ring-2 focus:ring-orange-400 focus:border-orange-400">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {runInfo.allRuns.map((run, index) => {
                          const runLabel = run.label || `Run #${run.id || index + 1}`
                          const parts = runLabel.split(' / ')
                          const runNumber = parts[0] || `#${run.id || index + 1}`
                          const email =
                            parts[1] ||
                            run.headers?._tester ||
                            run.assignee?.email ||
                            'Unknown'
                          const emailPrefix = email.split('@')[0]
                          return (
                            <SelectItem key={index} value={String(index)}>
                              Run #{runNumber} {emailPrefix && `(${emailPrefix})`}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Progress circle + Tester info */}
                <div className="flex items-center gap-6 mb-5">
                  <div className="relative w-24 h-24 flex items-center justify-center rounded-full border-4 border-orange-400 bg-orange-50/50 flex-shrink-0">
                    <span className="text-2xl font-extrabold text-orange-700 font-mono">{runInfo.stats.percentage}%</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5 mb-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={cn("text-white text-[11px] font-bold border border-green-300", getAvatarColor(runInfo.userInfo?.email))}>
                          {getInitials(runInfo.userInfo?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-bold text-sm text-gray-900">
                          {runInfo.userInfo?.email?.split('@')[0]?.split('.').map(
                            (w: string) => w.charAt(0).toUpperCase() + w.slice(1)
                          ).join(' ') || 'Unknown'}
                        </p>
                        {runInfo.userInfo?.runNumber && (
                          <p className="text-xs text-gray-500 font-mono">
                            Run #{runInfo.userInfo.runNumber}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {runInfo.userInfo?.date && (
                        <span className="text-xs text-gray-400">
                          {runInfo.userInfo.date}
                        </span>
                      )}
                      {(() => {
                        const emailWasSent = hasEmailSent(
                          String(scriptId),
                          String(runInfo.id)
                        )
                        const testerEmail = runInfo.run?.headers?._tester || runInfo.run?.assignee?.email
                        const hasTester = testerEmail && testerEmail.includes('@')

                        if (emailWasSent || hasTester) {
                          return (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                              Email Sent
                            </span>
                          )
                        }
                        return null
                      })()}
                      {runInfo.state && (
                        <span className={cn(
                          'inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                          runInfo.state === 'completed' ? 'bg-green-100 text-green-700 border-green-200' :
                            runInfo.state === 'started' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                              'bg-gray-100 text-gray-600 border-gray-200'
                        )}>
                          {runInfo.state}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-5 gap-3 mb-4">
                  <div className="p-3 bg-gray-100 rounded-lg text-center border border-gray-200">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Total</p>
                    <p className="text-xl font-extrabold text-gray-800 font-mono">{runInfo.stats.total}</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg text-center border-2 border-green-300">
                    <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide mb-1">Passed</p>
                    <p className="text-xl font-extrabold text-green-600 font-mono">{runInfo.stats.passed}</p>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg text-center border-2 border-red-300">
                    <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mb-1">Failed</p>
                    <p className="text-xl font-extrabold text-red-600 font-mono">{runInfo.stats.failed}</p>
                  </div>
                  <div className="p-3 bg-yellow-50 rounded-lg text-center border-2 border-yellow-300">
                    <p className="text-[10px] font-semibold text-yellow-600 uppercase tracking-wide mb-1">Blocked</p>
                    <p className="text-xl font-extrabold text-yellow-600 font-mono">{runInfo.stats.blocked}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg text-center border border-gray-200">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Not Run</p>
                    <p className="text-xl font-extrabold text-gray-500 font-mono">{runInfo.stats.notRun}</p>
                  </div>
                </div>

                {/* Summary mono line */}
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 text-xs font-mono font-medium">
                  Pass: <span className="font-bold text-green-600">{runInfo.stats.passed}</span>{' '}
                  Fail: <span className="font-bold text-red-600">{runInfo.stats.failed}</span>{' '}
                  Block:{' '}
                  <span className="font-bold text-yellow-600">{runInfo.stats.blocked}</span>{' '}
                  Query: <span className="font-bold text-gray-500">0</span> Total:{' '}
                  <span className="font-bold text-gray-800">
                    {runInfo.stats.passed}/{runInfo.stats.total}
                  </span>
                </div>
              </div>
            )}
          </div>

          {scriptLoading ? (
            <div className="text-center py-10">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-500" />
              <p className="mt-4 text-gray-500">Loading test suite details...</p>
            </div>
          ) : scriptError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Error loading test suite details: {(scriptError as Error).message}
              </AlertDescription>
            </Alert>
          ) : script ? (
            <div>
              {/* Basic Info */}
              <div className="bg-white border-2 border-gray-200 rounded-xl shadow-sm px-5 py-3 mb-5 flex items-center gap-6 text-xs">
                {script.description && (
                  <div>
                    <span className="text-gray-400 font-medium">Description: </span>
                    <span className="text-gray-700">{script.description}</span>
                  </div>
                )}
                {script.description && script.created && <div className="w-px h-5 bg-gray-200" />}
                {script.created && (
                  <div>
                    <span className="text-gray-400 font-medium">Created: </span>
                    <span className="text-gray-700 font-medium">{formatDate(script.created)}</span>
                  </div>
                )}
              </div>

              {/* Alert Banner for Issues */}
              {runInfo && (runInfo.stats.failed > 0 || runInfo.stats.blocked > 0) && (
                <div className="bg-red-50 border-2 border-red-300 rounded-xl px-5 py-3.5 mb-5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div>
                      <span className="text-sm font-bold text-red-800">
                        {(runInfo.stats.failed || 0) + (runInfo.stats.blocked || 0)} test
                        {(runInfo.stats.failed || 0) + (runInfo.stats.blocked || 0) > 1 ? 's' : ''}{' '}
                        need attention in this run
                      </span>
                      <span className="text-sm text-red-600 ml-2">
                        {runInfo.stats.failed > 0 && `${runInfo.stats.failed} failed`}
                        {runInfo.stats.failed > 0 && runInfo.stats.blocked > 0 && ', '}
                        {runInfo.stats.blocked > 0 && `${runInfo.stats.blocked} blocked`}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {runInfo.stats.failed > 0 && (
                      <button
                        className="px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm"
                        onClick={() => {
                          setTestFilter('failed')
                          document.getElementById('test-cases-table')?.scrollIntoView({ behavior: 'smooth' })
                        }}
                      >
                        Jump to Failed
                      </button>
                    )}
                    {runInfo.stats.blocked > 0 && (
                      <button
                        className="px-3 py-1.5 text-xs font-bold bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors shadow-sm"
                        onClick={() => {
                          setTestFilter('blocked')
                          document.getElementById('test-cases-table')?.scrollIntoView({ behavior: 'smooth' })
                        }}
                      >
                        Jump to Blocked
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Test Cases Table */}
              <div id="test-cases-table" className="bg-white border-2 border-gray-200 rounded-xl shadow-md overflow-hidden">
                {/* Table Header */}
                <div className="px-5 py-4 border-b-2 border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-bold text-gray-900">Test Cases</h3>
                    {script.tests && (
                      <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-gray-200 text-gray-700 border border-gray-300 font-mono">
                        {script.tests.length}
                      </span>
                    )}
                  </div>
                  {runInfo && (runInfo.stats.failed > 0 || runInfo.stats.blocked > 0) && (
                    <div className="flex gap-2">
                      <button
                        className={cn(
                          'px-3 py-1.5 text-xs font-bold rounded-lg shadow-sm transition-colors',
                          testFilter === 'all'
                            ? 'bg-orange-500 text-white'
                            : 'border-2 border-gray-300 text-gray-600 hover:bg-gray-50'
                        )}
                        onClick={() => setTestFilter('all')}
                      >
                        All ({script.tests?.length || 0})
                      </button>
                      {runInfo.stats.failed > 0 && (
                        <button
                          className={cn(
                            'px-3 py-1.5 text-xs font-bold rounded-lg transition-colors',
                            testFilter === 'failed'
                              ? 'bg-red-500 text-white shadow-sm'
                              : 'border-2 border-red-300 text-red-600 hover:bg-red-50'
                          )}
                          onClick={() => setTestFilter('failed')}
                        >
                          Failed ({runInfo.stats.failed})
                        </button>
                      )}
                      {runInfo.stats.blocked > 0 && (
                        <button
                          className={cn(
                            'px-3 py-1.5 text-xs font-bold rounded-lg transition-colors',
                            testFilter === 'blocked'
                              ? 'bg-yellow-500 text-white shadow-sm'
                              : 'border-2 border-yellow-300 text-yellow-700 hover:bg-yellow-50'
                          )}
                          onClick={() => setTestFilter('blocked')}
                        >
                          Blocked ({runInfo.stats.blocked})
                        </button>
                      )}
                      <button
                        className={cn(
                          'px-3 py-1.5 text-xs font-bold rounded-lg transition-colors',
                          testFilter === 'issues'
                            ? 'bg-gray-700 text-white shadow-sm'
                            : 'border-2 border-gray-300 text-gray-600 hover:bg-gray-50'
                        )}
                        onClick={() => setTestFilter('issues')}
                      >
                        All Issues ({(runInfo.stats.failed || 0) + (runInfo.stats.blocked || 0)})
                      </button>
                    </div>
                  )}
                </div>

                {/* Column Header */}
                <div className="px-5 py-2.5 bg-gray-50 border-b-2 border-gray-200 flex items-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                  <div className="w-[70px] text-center">#</div>
                  <div className="flex-1">Test Case</div>
                  <div className="w-[100px] text-center">Status</div>
                </div>

                {/* Test Rows */}
                {script.tests && script.tests.length > 0 ? (
                  <div>
                    {filteredTests.map((test: any) => {
                      const testStatus = test._status

                      return (
                        <div
                          key={test.id}
                          className={cn(
                            'px-5 py-3 min-h-[44px] flex items-center border-b border-gray-100 transition-colors',
                            testStatus === 'fail' && 'bg-red-50 hover:bg-red-100/70',
                            testStatus === 'block' && 'bg-yellow-50 hover:bg-yellow-100/70',
                            testStatus === 'pass' && 'hover:bg-green-50/30',
                            testStatus === 'none' && 'hover:bg-gray-50'
                          )}
                        >
                          <div className="w-[70px] text-center font-mono text-xs">
                            <span className={cn(
                              'font-medium text-gray-500',
                              testStatus === 'fail' && 'font-bold text-red-600',
                              testStatus === 'block' && 'font-bold text-yellow-700'
                            )}>
                              {String(test._index).padStart(4, '0')}
                            </span>
                          </div>
                          <div className="flex-1">
                            <span className={cn(
                              'text-sm text-gray-800',
                              (testStatus === 'fail' || testStatus === 'block') && 'font-semibold text-gray-900'
                            )}>
                              {test.text || test.name || 'Test Case without name'}
                            </span>
                          </div>
                          <div className="w-[100px] flex justify-center">
                            {testStatus === 'pass' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-300">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>
                                PASS
                              </span>
                            )}
                            {testStatus === 'fail' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-400">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                FAIL
                              </span>
                            )}
                            {testStatus === 'block' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 border border-yellow-400">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                                BLOCK
                              </span>
                            )}
                            {testStatus === 'none' && (
                              <span className="inline-flex items-center text-[10px] font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                                -
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {filteredTests.length === 0 && (
                      <p className="text-center py-8 text-gray-500">
                        No tests match the selected filter.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-center py-8 text-gray-500">
                    No test cases found in this test suite.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No test suite data available.</p>
          )}
        </div>
      </main>
    </div>
  )
}
