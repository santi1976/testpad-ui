export interface User {
  email: string
  password: string
  apiToken: string
  domain: string
  loginTime: string
}

export interface AuthContextType {
  user: User | null
  login: (email: string, password: string, apiToken: string) => Promise<User>
  logout: () => void
  isAuthenticated: boolean
  isLoading: boolean
}

export interface Project {
  id: number | string
  name: string
  created?: string
  description?: string
}

export interface FolderItem {
  id: number | string
  name: string
  type?: 'folder' | 'script'
  contents?: FolderItem[]
  created?: string
  progress?: Progress
  runs?: Run[]
}

export interface Progress {
  total: number
  pass: number
  fail: number
  block: number
  query: number
  pending?: number
  summary?: string
}

export interface RunProgress {
  pass?: number
  fail?: number
  block?: number
  total?: number
  query?: number
}

export interface Folder extends FolderItem {
  type?: 'folder' | 'script'
}

export interface Run {
  id: string
  runId?: number | string
  runNumber?: number | string
  state?: 'new' | 'started' | 'complete' | string
  tester: string | null
  scriptId: number | string
  scriptName: string
  projectId: number | string
  projectName: string
  folderId?: number | string | null
  folderName?: string | null
  created?: string
  progress?: RunProgress
  testerEmail?: string | null
  headers?: Record<string, string>
  assignee?: {
    id: string | number
    name: string
    email: string
  }
}

export interface TesterGroup {
  email: string
  displayName: string
  initials: string
  runs: Run[]
  releaseGroups: { name: string; folderId: string | number | null; isLatest: boolean; runs: Run[] }[]
  totalRuns: number
}
