export interface User {
  email: string
  apiToken: string
  domain: string
  loginTime: string
}

export interface AuthContextType {
  user: User | null
  login: (email: string, apiToken: string) => Promise<User>
  logout: () => void
  isAuthenticated: boolean
  isLoading: boolean
}
