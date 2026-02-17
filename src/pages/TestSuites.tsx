import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2, ChevronDown } from 'lucide-react'
import { apiGet } from '../utils/api'
import { hasEmailSent } from '../utils/emailTracking'
import { Sidebar } from '../components/layout/Sidebar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  createSlug,
  getInitials,
  formatDate,
  getAvatarColor,
  extractTesterFromRun,
} from '@/utils/helpers'
import { Project, FolderItem } from '@/types'

// ── Types ──────────────────────────────────────────────────

interface Release {
  id: string
  name: string
  scripts: FolderItem[]
  created?: string
}

interface ScriptInfo {
  runCount: number
  testers: string[]
  allSent: boolean
  latestRunDate: string | null
}

function extractScriptsFromFolder(folder: FolderItem): FolderItem[] {
  const scripts: FolderItem[] = []
  if (folder.contents) {
    for (const item of folder.contents) {
      if (item.type === 'script') {
        scripts.push(item)
      } else if (item.type === 'folder' && item.contents) {
        scripts.push(...extractScriptsFromFolder(item))
      }
    }
  }
  return scripts
}

// ── Component ──────────────────────────────────────────────

export default function TestSuites() {
  const navigate = useNavigate()


  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [expandedReleases, setExpandedReleases] = useState<Set<string>>(new Set())
  const [scriptInfoMap, setScriptInfoMap] = useState<Record<string, ScriptInfo>>({})
  const [loadingReleases, setLoadingReleases] = useState<Set<string>>(new Set())

  // ── Data Fetching ──────────────────────────────────────

  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet<{ projects: Project[] }>('/api/v1/projects'),
  })

  const projects: Project[] = projectsData?.projects || []

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      const testpadProject = projects.find(p =>
        p.name.toLowerCase().includes('testpad api testing')
      )
      setSelectedProjectId(String(testpadProject?.id || projects[0].id))
    }
  }, [projects, selectedProjectId])

  const selectedProject = selectedProjectId
    ? projects.find(p => String(p.id) === selectedProjectId)
    : null

  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ['folders', selectedProjectId],
    queryFn: () => apiGet<{ folders: FolderItem[] }>(`/api/v1/projects/${selectedProjectId}/folders`),
    enabled: !!selectedProjectId,
    staleTime: 5 * 60 * 1000,
  })

  // ── Parse Releases ─────────────────────────────────────

  const releases: Release[] = useMemo(() => {
    const folders = foldersData?.folders || []
    return folders
      .filter((item: FolderItem) => item.type === 'folder')
      .map((folder: FolderItem) => ({
        id: String(folder.id),
        name: folder.name,
        scripts: extractScriptsFromFolder(folder),
        created: folder.created,
      }))
      .sort((a: Release, b: Release) => b.name.localeCompare(a.name))
  }, [foldersData])

  const totalSuites = useMemo(() => releases.reduce((sum, r) => sum + r.scripts.length, 0), [releases])

  // Auto-expand latest release
  useEffect(() => {
    if (releases.length > 0 && expandedReleases.size === 0) {
      setExpandedReleases(new Set([releases[0].id]))
    }
  }, [releases])

  // ── Fetch Script Data for Expanded Releases ────────────

  const fetchReleaseData = useCallback(async (release: Release) => {
    if (loadingReleases.has(release.id)) return
    // Check if all scripts in this release already have data
    const allLoaded = release.scripts.every(s => scriptInfoMap[String(s.id)])
    if (allLoaded) return

    setLoadingReleases(prev => new Set([...prev, release.id]))

    const MAX_CONCURRENT = 15
    const newData: Record<string, ScriptInfo> = {}

    for (let i = 0; i < release.scripts.length; i += MAX_CONCURRENT) {
      const batch = release.scripts.slice(i, i + MAX_CONCURRENT)
      const results = await Promise.allSettled(
        batch.map(script => apiGet(`/api/v1/scripts/${script.id}`))
      )

      results.forEach((result, idx) => {
        const scriptId = String(batch[idx].id)
        if (result.status === 'fulfilled' && result.value) {
          const scriptData = (result.value as any)?.script || result.value
          const runs: Record<string, unknown>[] = scriptData.runs || []

          const testerSet = new Set<string>()
          let sentCount = 0
          let latestDate: string | null = null

          runs.forEach((run: Record<string, unknown>) => {
            const email = extractTesterFromRun(run)
            if (email) {
              testerSet.add(email)
              sentCount++ // has tester assigned = was sent (assign = setmeta + sendemail)
            } else if (hasEmailSent(scriptId, String(run.id))) {
              sentCount++ // tracked in localStorage
            }
            const runCreated = (run.created as string) || null
            if (runCreated && (!latestDate || runCreated > latestDate)) latestDate = runCreated
          })

          newData[scriptId] = {
            runCount: runs.length,
            testers: Array.from(testerSet),
            allSent: runs.length > 0 && sentCount === runs.length,
            latestRunDate: latestDate,
          }
        } else {
          newData[scriptId] = { runCount: 0, testers: [], allSent: false, latestRunDate: null }
        }
      })
    }

    setScriptInfoMap(prev => ({ ...prev, ...newData }))
    setLoadingReleases(prev => {
      const next = new Set(prev)
      next.delete(release.id)
      return next
    })
  }, [loadingReleases, scriptInfoMap])

  // Fetch data when a release is expanded
  useEffect(() => {
    expandedReleases.forEach(releaseId => {
      const release = releases.find(r => r.id === releaseId)
      if (release) fetchReleaseData(release)
    })
  }, [expandedReleases, releases])

  // ── Summary Stats ──────────────────────────────────────

  const summaryStats = useMemo(() => {
    let withActiveRuns = 0
    let fullySent = 0
    let pending = 0

    releases.forEach(release => {
      release.scripts.forEach(script => {
        const info = scriptInfoMap[String(script.id)]
        if (info) {
          if (info.runCount > 0) {
            withActiveRuns++
            if (info.allSent) fullySent++
            else pending++
          }
        }
      })
    })

    return { withActiveRuns, fullySent, pending }
  }, [releases, scriptInfoMap])

  // ── Toggle Release ─────────────────────────────────────

  const toggleRelease = (releaseId: string) => {
    setExpandedReleases(prev => {
      const next = new Set(prev)
      if (next.has(releaseId)) next.delete(releaseId)
      else next.add(releaseId)
      return next
    })
  }

  // ── Get Suite Status ───────────────────────────────────

  const getSuiteStatus = (scriptId: string): 'sent' | 'pending' | 'no-runs' | 'loading' => {
    const info = scriptInfoMap[scriptId]
    if (!info) return 'loading'
    if (info.runCount === 0) return 'no-runs'
    if (info.allSent) return 'sent'
    return 'pending'
  }

  // Release-level sent/pending counts
  const getReleaseCounts = (release: Release) => {
    let sent = 0
    let pending = 0
    release.scripts.forEach(script => {
      const info = scriptInfoMap[String(script.id)]
      if (info && info.runCount > 0) {
        if (info.allSent) sent++
        else pending++
      }
    })
    return { sent, pending }
  }

  // ── Navigate to Suite Detail ───────────────────────────

  const navigateToSuite = (script: FolderItem, release: Release) => {
    const slug = createSlug(script.name)
    sessionStorage.setItem('testSuiteContext', JSON.stringify({
      scriptId: script.id,
      projectId: selectedProject?.id,
      folderId: release.id,
    }))
    navigate(`/test-suite/${slug}`, {
      state: {
        scriptId: script.id,
        project: selectedProject,
        folder: { id: release.id, name: release.name },
      },
    })
  }

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="flex h-screen bg-slate-100">
      <Sidebar activeKey="test-suites" />

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1440px] mx-auto px-8 py-8">

          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-extrabold text-gray-900">Test Suites</h2>
              <p className="text-sm text-gray-500 mt-1">Browse test scripts by release, track assignments and email status</p>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Project:</label>
              {projectsLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              ) : (
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="w-56 border-2 border-gray-300 font-medium focus:ring-orange-400 focus:border-orange-400">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {/* Summary Bar */}
          <div className="bg-white border-2 border-gray-200 rounded-xl px-6 py-4 mb-6 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">With Active Runs</span>
                <span className="font-mono text-lg font-extrabold text-orange-600">{summaryStats.withActiveRuns}</span>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Fully Sent</span>
                <span className="font-mono text-lg font-extrabold text-green-600">{summaryStats.fullySent}</span>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pending</span>
                <span className="font-mono text-lg font-extrabold text-orange-500">{summaryStats.pending}</span>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 bg-gray-100 px-4 py-2 rounded-full border border-gray-200">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                <path d="M4 4.5A2.5 2.5 0 016.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15z" />
              </svg>
              {releases.length} releases &middot; {totalSuites} test suites
            </div>
          </div>

          {/* Loading */}
          {foldersLoading && (
            <div className="text-center py-20">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-orange-500" />
              <p className="mt-4 text-gray-500">Loading test suites...</p>
            </div>
          )}

          {/* Release Groups */}
          {!foldersLoading && releases.length > 0 && (
            <div className="space-y-5">
              {releases.map((release, index) => {
                const isExpanded = expandedReleases.has(release.id)
                const isLatest = index === 0
                const isLoading = loadingReleases.has(release.id)
                const counts = getReleaseCounts(release)

                return (
                  <div key={release.id} className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden shadow-md">
                    {/* Release Header */}
                    <button
                      onClick={() => toggleRelease(release.id)}
                      className="w-full bg-orange-50 border-b-2 border-orange-200 px-5 py-4 flex items-center gap-3 hover:bg-orange-100/70 transition-colors cursor-pointer"
                    >
                      <svg className="w-5 h-5 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                      </svg>
                      <span className="font-bold text-orange-800 text-sm">{release.name}</span>
                      {isLatest && (
                        <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-300">
                          -latest-
                        </span>
                      )}
                      <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-white text-gray-600 border border-gray-300 ml-1">
                        {release.scripts.length} suites
                      </span>
                      {release.created && (
                        <span className="text-xs text-gray-400 ml-2">{formatDate(release.created)}</span>
                      )}
                      <div className="ml-auto flex items-center gap-4">
                        {isExpanded && !isLoading && (counts.sent > 0 || counts.pending > 0) && (
                          <div className="flex items-center gap-3 text-xs">
                            {counts.sent > 0 && (
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                                <span className="font-bold text-green-700">{counts.sent} sent</span>
                              </span>
                            )}
                            {counts.pending > 0 && (
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                                <span className="font-bold text-orange-700">{counts.pending} pending</span>
                              </span>
                            )}
                          </div>
                        )}
                        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-orange-400" />}
                        <ChevronDown
                          className={cn(
                            'w-5 h-5 text-orange-400 transition-transform duration-250',
                            isExpanded && 'rotate-180'
                          )}
                        />
                      </div>
                    </button>

                    {/* Release Content (expanded) */}
                    {isExpanded && (
                      <div>
                        {/* Column Header */}
                        <div className="px-5 py-2.5 bg-gray-50 border-b-2 border-gray-200 flex items-center text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                          <div className="w-[300px] pl-4">Suite Name</div>
                          <div className="w-[180px]">Project / Release</div>
                          <div className="w-[160px]">Testers</div>
                          <div className="w-[70px] text-center">Runs</div>
                          <div className="w-[110px] text-center">Status</div>
                          <div className="w-[100px] text-right">Date</div>
                        </div>

                        {/* Suite Rows */}
                        {release.scripts
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((script, sIdx) => {
                            const scriptId = String(script.id)
                            const info = scriptInfoMap[scriptId]
                            const status = getSuiteStatus(scriptId)
                            const isLoadingScript = status === 'loading'

                            // Border and bg colors by status
                            let borderColor = 'border-gray-300'
                            let bgColor = 'bg-gray-100/60 hover:bg-gray-200/50'
                            let nameColor = 'text-gray-400'
                            let iconColor = 'text-gray-300'

                            if (status === 'sent') {
                              borderColor = 'border-green-500'
                              bgColor = 'bg-green-50/60 hover:bg-green-100/70'
                              nameColor = 'text-gray-800'
                              iconColor = 'text-green-400'
                            } else if (status === 'pending') {
                              borderColor = 'border-orange-400'
                              bgColor = 'bg-orange-50/50 hover:bg-orange-100/60'
                              nameColor = 'text-gray-800'
                              iconColor = 'text-orange-400'
                            } else if (isLoadingScript) {
                              borderColor = 'border-gray-200'
                              bgColor = 'bg-white hover:bg-gray-50'
                              nameColor = 'text-gray-600'
                              iconColor = 'text-gray-300'
                            }

                            return (
                              <div
                                key={scriptId}
                                onClick={() => navigateToSuite(script, release)}
                                className={cn(
                                  'border-l-[4px] px-5 py-3 min-h-[48px] flex items-center transition-colors group cursor-pointer',
                                  borderColor,
                                  bgColor,
                                  sIdx > 0 && 'border-t border-gray-100'
                                )}
                              >
                                {/* Suite Name */}
                                <div className="w-[300px] flex items-center gap-2.5">
                                  <svg className={cn('w-4 h-4 flex-shrink-0', iconColor)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                  </svg>
                                  <span className={cn(
                                    'text-sm font-bold group-hover:text-orange-600 transition-colors truncate',
                                    nameColor
                                  )} title={script.name}>
                                    {script.name}
                                  </span>
                                </div>

                                {/* Project / Release */}
                                <div className="w-[180px]">
                                  <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-300 font-mono">
                                    {selectedProject?.name ? selectedProject.name.split(' ')[0] : 'Project'} &middot; {release.name.replace('Release ', '').replace('release ', '')}
                                  </span>
                                </div>

                                {/* Testers */}
                                <div className="w-[160px] flex items-center gap-1.5">
                                  {isLoadingScript ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-gray-300" />
                                  ) : info && info.testers.length > 0 ? (
                                    info.testers.slice(0, 3).map(email => (
                                      <span
                                        key={email}
                                        className={cn(
                                          'inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold border',
                                          getAvatarColor(email)
                                        )}
                                        title={email}
                                      >
                                        {getInitials(email)}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs font-medium text-gray-400 italic">No testers</span>
                                  )}
                                  {info && info.testers.length > 3 && (
                                    <span className="text-[10px] font-bold text-gray-500">+{info.testers.length - 3}</span>
                                  )}
                                </div>

                                {/* Run Count */}
                                <div className="w-[70px] text-center">
                                  {isLoadingScript ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-gray-300 mx-auto" />
                                  ) : (
                                    <span className={cn(
                                      'font-mono text-xs font-bold',
                                      info && info.runCount > 0 ? 'text-gray-700' : 'text-gray-400'
                                    )}>
                                      {info?.runCount ?? '-'}
                                    </span>
                                  )}
                                </div>

                                {/* Status */}
                                <div className="w-[110px] flex justify-center">
                                  {isLoadingScript ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-gray-300" />
                                  ) : status === 'sent' ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-green-100 text-green-700 border border-green-300 shadow-sm">
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      Sent
                                    </span>
                                  ) : status === 'pending' ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full bg-orange-100 text-orange-700 border border-orange-300 shadow-sm">
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <circle cx="12" cy="12" r="10" />
                                        <path d="M12 6v6l4 2" />
                                      </svg>
                                      Pending
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full bg-gray-200 text-gray-500 border border-gray-300">
                                      No runs
                                    </span>
                                  )}
                                </div>

                                {/* Date */}
                                <div className="w-[100px] text-right">
                                  <span className="text-xs font-medium text-gray-400">
                                    {info?.latestRunDate ? formatDate(info.latestRunDate) : formatDate(script.created)}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty State */}
          {!foldersLoading && releases.length === 0 && selectedProject && (
            <div className="text-center py-20 text-gray-500">
              No releases or test suites found in this project.
            </div>
          )}

          {!foldersLoading && !selectedProject && (
            <div className="text-center py-20 text-gray-500">
              Select a project to view test suites
            </div>
          )}

          {/* Footer Summary */}
          {releases.length > 0 && (
            <div className="mt-6 px-6 py-4 bg-white border-2 border-gray-200 rounded-xl flex items-center justify-center gap-4 text-sm shadow-sm">
              <span className="font-extrabold text-gray-800 font-mono">{totalSuites}</span>
              <span className="text-gray-500">total suites</span>
              <span className="text-gray-300">&middot;</span>
              <span className="font-extrabold text-orange-600 font-mono">{summaryStats.withActiveRuns}</span>
              <span className="text-gray-500">with active runs</span>
              <span className="text-gray-300">&middot;</span>
              <span className="font-extrabold text-green-600 font-mono">{summaryStats.fullySent}</span>
              <span className="text-gray-500">fully sent</span>
              <span className="text-gray-300">&middot;</span>
              <span className="font-extrabold text-orange-500 font-mono">{summaryStats.pending}</span>
              <span className="text-gray-500">pending</span>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
