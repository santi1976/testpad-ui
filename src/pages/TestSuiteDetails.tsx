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
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from '../utils/api'
import { hasEmailSent } from '../utils/emailTracking'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'

// Types
interface Project {
  id: number | string
  name: string
}

interface Folder {
  id: number | string
  name: string
}

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

interface RunProgress {
  total?: number
  pass?: number
  fail?: number
  block?: number
  query?: number
}

interface Run {
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

// Get initials from email for avatar
function getInitials(email: string | undefined): string {
  if (!email) return '?'
  const parts = email.split('@')[0].split('.')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

// Format date
function formatDate(iso: string | undefined): string {
  if (!iso) return 'N/A'
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

// Get tests with issues from a run
function getTestsWithIssues(run: Run, tests: Test[]): TestIssue[] {
  const issues: TestIssue[] = []
  if (!run?.results || !tests) return issues

  Object.entries(run.results).forEach(([testId, result]) => {
    const status = typeof result === 'object' ? result?.result : result
    if (
      status === 'fail' ||
      status === 'block' ||
      status === 'failed' ||
      status === 'blocked'
    ) {
      const test = tests.find((t) => String(t.id) === String(testId))
      const testIndex = tests.findIndex((t) => String(t.id) === String(testId))

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

export default function TestSuiteDetails() {
  const { scriptName } = useParams<{ scriptName: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()

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
      <div className="flex h-screen bg-gray-50">
        <aside className="w-64 text-white flex flex-col flex-shrink-0" style={{ backgroundColor: '#121827' }}>
          <div className="p-4 border-b border-gray-700">
            <h2 className="font-bold text-lg">Testpad Admin</h2>
            <p className="text-xs text-gray-400 mt-1">{user?.email || 'user@bitfinex.com'}</p>
          </div>
          <nav className="flex-1 p-4">
            <button
              onClick={() => navigate('/test-suites')}
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-300 hover:bg-gray-800 w-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Go to Test Suites
            </button>
          </nav>
        </aside>
        <main className="flex-1 overflow-auto p-6">
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

  const script: Script | undefined = scriptData?.script || scriptData

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
      return aId - bId
    })

    const currentRun = sortedRuns[selectedRunIndex] || sortedRuns[0]
    const runProgress = currentRun.progress || {}
    const tests = script.tests || []

    const total = runProgress.total || tests.length
    const passed = runProgress.pass || 0
    const failed = runProgress.fail || 0
    const blocked = runProgress.block || 0
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
      const testerEmail = currentRun.headers?._tester || currentRun.assignee?.email
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
    const testsWithIssues = currentRun
      ? getTestsWithIssues(currentRun, script.tests)
      : []
    const issueMap: Record<string, 'fail' | 'block'> = {}
    testsWithIssues.forEach((issue) => {
      issueMap[String(issue.id)] = issue.status
    })

    let filteredTests = script.tests.map((test, index) => ({
      ...test,
      _index: index + 1,
      _issueStatus: issueMap[String(test.id)] || null,
    }))

    if (testFilter === 'failed') {
      filteredTests = filteredTests.filter((t) => t._issueStatus === 'fail')
    } else if (testFilter === 'blocked') {
      filteredTests = filteredTests.filter((t) => t._issueStatus === 'block')
    } else if (testFilter === 'issues') {
      filteredTests = filteredTests.filter((t) => t._issueStatus)
    }

    return filteredTests
  }

  const filteredTests = getFilteredTests()

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
        <div className="max-w-[1400px] mx-auto w-full">
          {/* Breadcrumbs */}
          <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                className="cursor-pointer text-blue-500 hover:text-blue-600"
                onClick={() => navigate('/')}
              >
                <Home className="h-4 w-4 inline mr-1" />
                {project?.name || 'Projects'}
              </BreadcrumbLink>
            </BreadcrumbItem>
            {folder && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink
                    className="cursor-pointer text-blue-500 hover:text-blue-600"
                    onClick={handleBackToFolder}
                  >
                    {folder.name}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            {script && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <span>{script.name || 'Test Suite'}</span>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold">{script?.name || 'Test Suite Details'}</h1>
              {script?.id && (
                <p className="text-xs text-muted-foreground">ID: {script.id}</p>
              )}
            </div>
            <div className="flex gap-2">
              {folder && (
                <Button variant="outline" onClick={handleBackToFolder}>
                  Back to Folder
                </Button>
              )}
              <Button variant="outline" onClick={handleBackToProject}>
                Back to Project
              </Button>
            </div>
          </div>

          {/* Run Progress Card */}
          {runInfo && runInfo.stats && (
            <Card className="bg-slate-50">
              <CardContent className="p-4">
                {/* Header with Test Suite, Folder and Run selector */}
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex-1">
                      <p className="font-semibold text-lg mb-1">
                        {script?.name || 'Test Suite'}
                      </p>
                      <div className="flex gap-3 items-center flex-wrap">
                        {folder && (
                          <Badge variant="secondary" className="bg-blue-100">
                            {folder.name}
                          </Badge>
                        )}
                        {project && (
                          <span className="text-xs text-muted-foreground">
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
                        <SelectTrigger className="w-[220px]">
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
                </div>

                {/* Progress and User Info */}
                <div className="flex items-center gap-6 mb-5 flex-wrap">
                  <div className="flex items-center justify-center">
                    <div className="relative w-24 h-24 flex items-center justify-center rounded-full border-4 border-blue-500">
                      <span className="text-2xl font-bold">{runInfo.stats.percentage}%</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback className="bg-blue-500 text-white text-xs">
                          {getInitials(runInfo.userInfo?.email || '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold text-sm">
                          {runInfo.userInfo?.email?.split('@')[0] ||
                            runInfo.userInfo?.email ||
                            'Unknown'}
                        </p>
                        {runInfo.userInfo?.runNumber && (
                          <p className="text-xs text-muted-foreground">
                            Run #{runInfo.userInfo.runNumber}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-3 flex-wrap items-center">
                      {runInfo.userInfo?.date && (
                        <span className="text-xs text-muted-foreground">
                          {runInfo.userInfo.date}
                        </span>
                      )}
                      {(() => {
                        const emailWasSent = hasEmailSent(
                          Number(scriptId),
                          Number(runInfo.id)
                        )
                        const isNew = runInfo.state === 'new'

                        if (isNew && emailWasSent) {
                          return (
                            <div className="flex flex-col gap-1">
                              <Badge variant="default" className="bg-green-500 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Email Sent
                              </Badge>
                              <Badge variant="outline" className="text-[9px]">
                                Status: NEW
                              </Badge>
                            </div>
                          )
                        }

                        return runInfo.state ? (
                          <Badge
                            variant={
                              runInfo.state === 'completed'
                                ? 'default'
                                : runInfo.state === 'started'
                                  ? 'outline'
                                  : 'secondary'
                            }
                            className="text-xs"
                          >
                            {runInfo.state}
                          </Badge>
                        ) : null
                      })()}
                    </div>
                  </div>
                </div>

                {/* Statistics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mb-4">
                  <div className="p-3 bg-gray-100 rounded text-center">
                    <p className="text-xs text-muted-foreground mb-1">Total</p>
                    <p className="text-xl font-bold">{runInfo.stats.total}</p>
                  </div>
                  <div className="p-3 bg-green-50 border border-green-200 rounded text-center">
                    <p className="text-xs text-muted-foreground mb-1">Passed</p>
                    <p className="text-xl font-bold text-green-500">
                      {runInfo.stats.passed}
                    </p>
                  </div>
                  {runInfo.stats.failed > 0 && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded text-center">
                      <p className="text-xs text-muted-foreground mb-1">Failed</p>
                      <p className="text-xl font-bold text-red-500">
                        {runInfo.stats.failed}
                      </p>
                    </div>
                  )}
                  {runInfo.stats.blocked > 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-center">
                      <p className="text-xs text-muted-foreground mb-1">Blocked</p>
                      <p className="text-xl font-bold text-yellow-500">
                        {runInfo.stats.blocked}
                      </p>
                    </div>
                  )}
                  {runInfo.stats.notRun > 0 && (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded text-center">
                      <p className="text-xs text-muted-foreground mb-1">Not Run</p>
                      <p className="text-xl font-bold text-gray-500">
                        {runInfo.stats.notRun}
                      </p>
                    </div>
                  )}
                </div>

                {/* Summary Line */}
                <div className="p-3 bg-white rounded border text-xs font-mono">
                  Pass: <span className="font-bold text-green-500">{runInfo.stats.passed}</span>{' '}
                  Fail: <span className="font-bold text-red-500">{runInfo.stats.failed}</span>{' '}
                  Block:{' '}
                  <span className="font-bold text-yellow-500">{runInfo.stats.blocked}</span>{' '}
                  Query: <span className="font-bold">0</span> Total:{' '}
                  <span className="font-bold">
                    {runInfo.stats.passed}/{runInfo.stats.total}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {scriptLoading ? (
          <div className="text-center py-10">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
            <p className="mt-4 text-muted-foreground">Loading test suite details...</p>
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
            <Card className="mb-4 bg-slate-50">
              <CardContent className="py-3">
                <div className="flex gap-6 flex-wrap items-center text-xs">
                  {script.description && (
                    <div>
                      <span className="text-muted-foreground">Description: </span>
                      <span>{script.description}</span>
                    </div>
                  )}
                  {script.created && (
                    <div>
                      <span className="text-muted-foreground">Created: </span>
                      <span>{formatDate(script.created)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Alert Banner for Issues */}
            {runInfo && (runInfo.stats.failed > 0 || runInfo.stats.blocked > 0) && (
              <Alert
                variant={runInfo.stats.failed > 0 ? 'destructive' : 'default'}
                className={cn(
                  'mb-4',
                  runInfo.stats.failed === 0 && 'border-yellow-500 bg-yellow-50'
                )}
              >
                {runInfo.stats.failed > 0 ? (
                  <XCircle className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                )}
                <AlertDescription>
                  <div className="flex justify-between items-center flex-wrap gap-3">
                    <div>
                      <span className="font-semibold">
                        {(runInfo.stats.failed || 0) + (runInfo.stats.blocked || 0)} test
                        {(runInfo.stats.failed || 0) + (runInfo.stats.blocked || 0) > 1
                          ? 's'
                          : ''}{' '}
                        need attention in this run
                      </span>
                      <span className="ml-2">
                        {runInfo.stats.failed > 0 && `${runInfo.stats.failed} failed`}
                        {runInfo.stats.failed > 0 && runInfo.stats.blocked > 0 && ', '}
                        {runInfo.stats.blocked > 0 && `${runInfo.stats.blocked} blocked`}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {runInfo.stats.failed > 0 && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setTestFilter('failed')
                            document
                              .getElementById('test-cases-table')
                              ?.scrollIntoView({ behavior: 'smooth' })
                          }}
                        >
                          Jump to Failed
                        </Button>
                      )}
                      {runInfo.stats.blocked > 0 && (
                        <Button
                          size="sm"
                          className="bg-yellow-500 hover:bg-yellow-600"
                          onClick={() => {
                            setTestFilter('blocked')
                            document
                              .getElementById('test-cases-table')
                              ?.scrollIntoView({ behavior: 'smooth' })
                          }}
                        >
                          Jump to Blocked
                        </Button>
                      )}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Test Cases Table */}
            <Card id="test-cases-table">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center flex-wrap gap-3">
                  <CardTitle className="flex items-center gap-2">
                    Test Cases
                    {script.tests && (
                      <Badge variant="secondary">{script.tests.length}</Badge>
                    )}
                  </CardTitle>
                  {runInfo &&
                    (runInfo.stats.failed > 0 || runInfo.stats.blocked > 0) && (
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant={testFilter === 'all' ? 'default' : 'outline'}
                          onClick={() => setTestFilter('all')}
                        >
                          All ({script.tests?.length || 0})
                        </Button>
                        {runInfo.stats.failed > 0 && (
                          <Button
                            size="sm"
                            variant={testFilter === 'failed' ? 'destructive' : 'outline'}
                            onClick={() => setTestFilter('failed')}
                          >
                            Failed ({runInfo.stats.failed})
                          </Button>
                        )}
                        {runInfo.stats.blocked > 0 && (
                          <Button
                            size="sm"
                            variant={testFilter === 'blocked' ? 'default' : 'outline'}
                            className={
                              testFilter === 'blocked'
                                ? 'bg-yellow-500 hover:bg-yellow-600'
                                : ''
                            }
                            onClick={() => setTestFilter('blocked')}
                          >
                            Blocked ({runInfo.stats.blocked})
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant={testFilter === 'issues' ? 'default' : 'outline'}
                          onClick={() => setTestFilter('issues')}
                        >
                          All Issues (
                          {(runInfo.stats.failed || 0) + (runInfo.stats.blocked || 0)})
                        </Button>
                      </div>
                    )}
                </div>
              </CardHeader>
              <CardContent>
                {script.tests && script.tests.length > 0 ? (
                  <div className="rounded border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[70px] text-center">#</TableHead>
                          <TableHead>Test Case</TableHead>
                          <TableHead className="w-[100px] text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTests.map((test) => {
                          const currentRun = runInfo?.run || selectedRun
                          let statusBadge = <Badge variant="outline">-</Badge>

                          if (test._issueStatus === 'fail') {
                            statusBadge = (
                              <Badge variant="destructive">
                                <XCircle className="h-3 w-3 mr-1" /> FAIL
                              </Badge>
                            )
                          } else if (test._issueStatus === 'block') {
                            statusBadge = (
                              <Badge className="bg-yellow-500">
                                <AlertTriangle className="h-3 w-3 mr-1" /> BLOCK
                              </Badge>
                            )
                          } else if (currentRun?.results) {
                            const result = currentRun.results[String(test.id)]
                            const status =
                              typeof result === 'object' ? result?.result : result
                            if (status === 'pass' || status === 'passed') {
                              statusBadge = (
                                <Badge className="bg-green-500">
                                  <CheckCircle className="h-3 w-3 mr-1" /> PASS
                                </Badge>
                              )
                            }
                          }

                          return (
                            <TableRow
                              key={test.id}
                              className={cn(
                                test._issueStatus === 'fail' && 'bg-red-50 hover:bg-red-100',
                                test._issueStatus === 'block' &&
                                  'bg-yellow-50 hover:bg-yellow-100'
                              )}
                            >
                              <TableCell className="text-center font-mono">
                                <span
                                  className={cn(
                                    test._issueStatus === 'fail' && 'text-red-500 font-bold',
                                    test._issueStatus === 'block' &&
                                      'text-yellow-600 font-bold'
                                  )}
                                >
                                  {String(test._index).padStart(4, '0')}
                                </span>
                              </TableCell>
                              <TableCell>
                                <span
                                  className={cn(
                                    'text-sm',
                                    test._issueStatus && 'font-semibold'
                                  )}
                                >
                                  {test.text || test.name || 'Test Case without name'}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">{statusBadge}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                    {filteredTests.length === 0 && (
                      <p className="text-center py-8 text-muted-foreground">
                        No tests match the selected filter.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    No test cases found in this test suite.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="text-muted-foreground">No test suite data available.</p>
        )}
        </div>
      </main>
    </div>
  )
}
