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
        const parsed = JSON.parse(storedUser)
        
        // Validate that all required fields exist
        if (!parsed.email || !parsed.password || !parsed.apiToken) {
          console.warn('[AuthContext] ⚠️ Stored user missing required fields:', {
            email: parsed.email ? '✅' : '❌ MISSING',
            password: parsed.password ? '✅' : '❌ MISSING',
            apiToken: parsed.apiToken ? '✅' : '❌ MISSING'
          })
          console.warn('[AuthContext] Clearing invalid session. User must re-login.')
          localStorage.removeItem('testpad_user')
          localStorage.removeItem('testpad_testers_global')
        } else {
          console.log('[AuthContext] ✅ User loaded from localStorage:', parsed.email)
          console.log('[AuthContext] Credentials check:', {
            email: '✅',
            password: `✅ (${parsed.password.length} chars)`,
            apiToken: `✅ (${parsed.apiToken.length} chars)`
          })
          setUser(parsed)
        }
      } catch (e) {
        console.error('[AuthContext] ❌ Failed to parse stored user:', e)
        localStorage.removeItem('testpad_user')
      }
    } else {
      console.log('[AuthContext] No stored user found')
    }
    setIsLoading(false)
  }, [])

  // Login function - validates Email + Password + API Token against Testpad API
  const login = async (email: string, password: string, apiToken: string): Promise<User> => {
    console.log('[AuthContext] ========== Login attempt ==========')
    console.log('[AuthContext] Credentials received:', {
      email: email || '❌ MISSING',
      password: password ? `✅ (${password.length} chars)` : '❌ MISSING',
      apiToken: apiToken ? `✅ (${apiToken.length} chars)` : '❌ MISSING'
    })

    // Validate email domain
    const allowedDomains = ['bitfinex.com', 'tether.com']
    const emailDomain = email.split('@')[1]?.toLowerCase()

    if (!allowedDomains.includes(emailDomain)) {
      console.log('[AuthContext] ❌ Invalid email domain:', emailDomain)
      throw new Error('Email must be from @bitfinex.com or @tether.com')
    }

    // Validate all fields before calling API
    if (!email || !password || !apiToken) {
      const missing = []
      if (!email) missing.push('email')
      if (!password) missing.push('password')
      if (!apiToken) missing.push('apiToken')
      const errorMsg = `Missing required fields: ${missing.join(', ')}`
      console.log('[AuthContext] ❌', errorMsg)
      throw new Error(errorMsg)
    }

    console.log('[AuthContext] Calling /api/login to validate credentials...')

    // Validate credentials against backend
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, apiToken })
    })

    const data = await response.json()
    console.log('[AuthContext] API response:', { status: response.status, valid: data.valid, error: data.error })

    if (!response.ok || !data.valid) {
      console.log('[AuthContext] ❌ Login failed:', data.error)
      throw new Error(data.error || 'Invalid credentials')
    }

    // Save user with ALL credentials in localStorage
    const userData: User = {
      email,
      password,
      apiToken,
      domain: emailDomain,
      loginTime: new Date().toISOString()
    }

    console.log('[AuthContext] ✅ Login successful, saving user to localStorage')
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
