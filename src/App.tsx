import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { apiGet } from './utils/api'
import { Project, FolderItem } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

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

// Create URL-friendly slug from name
function createSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// Count folders and scripts recursively
function countItems(items: FolderItem[] | undefined): { folders: number; scripts: number } {
  if (!items || !Array.isArray(items)) return { folders: 0, scripts: 0 }
  let folders = 0
  let scripts = 0
  items.forEach((item) => {
    if (item.type === 'folder') {
      folders++
      const sub = countItems(item.contents || [])
      folders += sub.folders
      scripts += sub.scripts
    } else if (item.type === 'script') {
      scripts++
    }
  })
  return { folders, scripts }
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [showFolders, setShowFolders] = useState(true)

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

  // Load projects
  const {
    data: projectsData,
    isLoading: projectsLoading,
    error: projectsError,
  } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet<{ projects: Project[] }>('/api/v1/projects'),
  })

  const projects: Project[] = projectsData?.projects || []

  // Get selected project
  const selectedProject = selectedProjectId
    ? projects.find((p) => String(p.id) === selectedProjectId)
    : null

  // Load folders from selected project
  const {
    data: foldersData,
    isLoading: foldersLoading,
    error: foldersError,
  } = useQuery({
    queryKey: ['folders', selectedProjectId],
    queryFn: () => apiGet<{ folders: FolderItem[] }>(`/api/v1/projects/${selectedProjectId}/folders`),
    enabled: !!selectedProjectId && showFolders,
  })

  // Auto-select first project when projects load
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(String(projects[0].id))
    }
  }, [projects, selectedProjectId])

  // Helper function to find parent folder of a script
  const findParentFolder = (
    items: FolderItem[],
    targetScriptId: number | string,
    parent: FolderItem | null = null
  ): FolderItem | null => {
    for (const it of items) {
      if (it.type === 'script' && it.id === targetScriptId) {
        return parent
      }
      if (it.type === 'folder' && it.contents) {
        const found = findParentFolder(it.contents, targetScriptId, it)
        if (found !== null) return found
      }
    }
    return null
  }

  // Render folder structure recursively
  const renderFolderStructure = (
    items: FolderItem[] | undefined,
    level: number = 0,
    allFolders: FolderItem[] | null = null
  ): React.ReactNode => {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return (
        <p className="text-muted-foreground" style={{ marginLeft: level * 24 }}>
          Empty
        </p>
      )
    }

    return items.map((item, index) => {
      if (item.type === 'folder') {
        const counts = countItems(item.contents || [])
        return (
          <div key={`${item.id}-${index}`} className="mb-2">
            <div
              className="p-2 px-3 bg-gray-50 rounded border"
              style={{ marginLeft: level * 24 }}
            >
              <span className="font-semibold">📁 {item.name}</span>
              <Badge variant="secondary" className="ml-2 text-xs">
                ID: {item.id}
              </Badge>
              {counts.folders > 0 && (
                <Badge variant="outline" className="ml-1 text-xs bg-green-50">
                  {counts.folders} folder(s)
                </Badge>
              )}
              {counts.scripts > 0 && (
                <Badge variant="outline" className="ml-1 text-xs bg-orange-50">
                  {counts.scripts} script(s)
                </Badge>
              )}
            </div>
            {item.contents && item.contents.length > 0 && (
              <div className="mt-2">
                {renderFolderStructure(item.contents, level + 1, allFolders)}
              </div>
            )}
          </div>
        )
      } else if (item.type === 'script') {
        const parentFolder = allFolders ? findParentFolder(allFolders, item.id) : null

        return (
          <div
            key={`${item.id}-${index}`}
            onClick={() => {
              const slug = createSlug(item.name)
              // Save to sessionStorage for refresh support
              sessionStorage.setItem('testSuiteContext', JSON.stringify({
                scriptId: item.id,
                projectId: selectedProject?.id,
                folderId: parentFolder?.id,
              }))
              navigate(`/test-suite/${slug}`, {
                state: {
                  scriptId: item.id,
                  project: selectedProject,
                  folder: parentFolder,
                },
              })
            }}
            className="p-1.5 px-3 bg-orange-50 rounded border border-orange-200 cursor-pointer hover:bg-orange-100 hover:border-orange-300 transition-colors mb-1"
            style={{ marginLeft: level * 24 }}
          >
            <span>📄 {item.name}</span>
            <Badge variant="secondary" className="ml-2 text-xs bg-purple-100">
              ID: {item.id}
            </Badge>
            {item.created && (
              <Badge variant="outline" className="ml-1 text-xs">
                {formatDate(item.created)}
              </Badge>
            )}
          </div>
        )
      }
      return null
    })
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
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-[1200px] mx-auto">
          {/* Header with dropdown */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <h1 className="text-2xl font-bold text-gray-900">Test Suites</h1>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-600">Project:</span>
                {projectsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Select
                    value={selectedProjectId}
                    onValueChange={(value) => setSelectedProjectId(value)}
                  >
                    <SelectTrigger className={cn(
                      "w-[200px]",
                      selectedProjectId && "bg-cyan-50 border-cyan-400"
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
                )}
              </div>
            </div>
          </div>

          {projectsError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Error loading projects: {(projectsError as Error).message}
              </AlertDescription>
            </Alert>
          ) : !selectedProject ? (
            <div className="text-center py-10 text-gray-500">
              Select a project to view test suites
            </div>
          ) : (
            <>
              {/* Project Info */}
              <Card className="mb-4">
                <CardContent className="py-4">
                  <div className="flex gap-4 items-center">
                    <Badge variant="secondary">ID: {selectedProject.id}</Badge>
                    {selectedProject.created && (
                      <Badge variant="outline" className="bg-green-50">
                        Created: {formatDate(selectedProject.created)}
                      </Badge>
                    )}
                    {selectedProject.description && (
                      <span className="text-sm text-gray-600">{selectedProject.description}</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Test Suites by Release */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-center">
                    <CardTitle className="text-base">Test Suites by Release</CardTitle>
                    {foldersData?.folders && (
                      <Badge variant="secondary">
                        {countItems(foldersData.folders).folders} releases,{' '}
                        {countItems(foldersData.folders).scripts} test suites
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {foldersLoading ? (
                    <div className="text-center py-10">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-500" />
                      <p className="mt-4 text-muted-foreground">Loading test suites...</p>
                    </div>
                  ) : foldersError ? (
                    <Alert variant="destructive">
                      <AlertDescription>
                        Error loading test suites: {(foldersError as Error).message}
                      </AlertDescription>
                    </Alert>
                  ) : foldersData?.folders && foldersData.folders.length > 0 ? (
                    <div>
                      {renderFolderStructure(foldersData.folders, 0, foldersData.folders)}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">
                      No releases or test suites found in this project.
                    </p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
