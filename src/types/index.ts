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
  type: 'folder' | 'script'
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

export interface Run {
  id: string
  created?: string
  state?: 'new' | 'started' | 'complete'
  label?: string
  headers?: Record<string, string>
  assignee?: {
    id: string | number
    name: string
    email: string
  }
  results?: Record<string, { result?: string; comment?: string }>
  progress?: Progress
}
