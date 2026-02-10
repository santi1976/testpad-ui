import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { User, AuthContextType } from '../types'

const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load user from localStorage on startup
  useEffect(() => {
    const storedUser = localStorage.getItem('testpad_user')
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser))
      } catch (e) {
        localStorage.removeItem('testpad_user')
      }
    }
    setIsLoading(false)
  }, [])

  // Login function - validates Email + API Token against Testpad API
  const login = async (email: string, apiToken: string): Promise<User> => {
    // Validate email domain
    const allowedDomains = ['bitfinex.com', 'tether.com']
    const emailDomain = email.split('@')[1]?.toLowerCase()

    if (!allowedDomains.includes(emailDomain)) {
      throw new Error('Email must be from @bitfinex.com or @tether.com')
    }

    // Validate API token against backend (which validates against Testpad API)
    const response = await fetch('/api/validate-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, apiToken })
    })

    const data = await response.json()

    if (!response.ok || !data.valid) {
      throw new Error(data.error || 'Invalid API token')
    }

    // Save user and token in localStorage
    const userData: User = {
      email,
      apiToken,
      domain: emailDomain,
      loginTime: new Date().toISOString()
    }

    localStorage.setItem('testpad_user', JSON.stringify(userData))
    setUser(userData)

    // Dispatch event so TestersContext can refresh
    window.dispatchEvent(new CustomEvent('testpad-login'))

    return userData
  }

  // Logout function
  const logout = () => {
    localStorage.removeItem('testpad_user')
    localStorage.removeItem('testpad_testers_global')
    setUser(null)
  }

  const value: AuthContextType = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    isLoading
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
