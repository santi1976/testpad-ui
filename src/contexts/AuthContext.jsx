import React, { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
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
  const login = async (email, apiToken) => {
    // Validate email domain
    const allowedDomains = ['bitfinex.com', 'tether.com']
    const emailDomain = email.split('@')[1]?.toLowerCase()
    
    if (!allowedDomains.includes(emailDomain)) {
      throw new Error('Email must be from @bitfinex.com or @tether.com')
    }

    // Validate API token against backend (which validates against Testpad API)
    try {
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
      const userData = {
        email,
        apiToken, // Save token to use in API calls
        domain: emailDomain,
        loginTime: new Date().toISOString()
      }
      
      localStorage.setItem('testpad_user', JSON.stringify(userData))
      setUser(userData)
      
      return userData
    } catch (error) {
      if (error.message) {
        throw error
      }
      throw new Error('Failed to validate credentials. Please try again.')
    }
  }

  // Logout function
  const logout = () => {
    localStorage.removeItem('testpad_user')
    setUser(null)
  }

  const value = {
    user,
    login,
    logout,
    isAuthenticated: !!user,
    isLoading
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

