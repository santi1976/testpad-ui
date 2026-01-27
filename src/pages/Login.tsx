import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Lock, AlertCircle, X, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function Login() {
  const [email, setEmail] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { login, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  const validateEmail = (value: string): boolean => {
    if (!value) {
      setEmailError('Please enter your email')
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(value)) {
      setEmailError('Invalid email')
      return false
    }
    const domain = value.split('@')[1]?.toLowerCase()
    if (domain !== 'bitfinex.com' && domain !== 'tether.com') {
      setEmailError('Email must be from @bitfinex.com or @tether.com')
      return false
    }
    setEmailError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!validateEmail(email)) return
    if (!apiToken) {
      setError('Please enter your API token')
      return
    }

    setLoading(true)
    try {
      await login(email, apiToken)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error signing in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center p-5">
      <Card className="w-full max-w-[420px] shadow-2xl rounded-xl">
        <CardContent className="p-10 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Testpad Dashboard</h1>
            <p className="text-muted-foreground">Sign in with your corporate account</p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                {error}
                <button onClick={() => setError(null)} className="ml-2">
                  <X className="h-4 w-4" />
                </button>
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="user@bitfinex.com or user@tether.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (emailError) validateEmail(e.target.value)
                  }}
                  onBlur={() => email && validateEmail(email)}
                  className="pl-10 h-11"
                  autoComplete="email"
                />
              </div>
              {emailError && <p className="text-sm text-destructive">{emailError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiToken">API Token</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="apiToken"
                  type="password"
                  placeholder="Your Testpad API token"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  className="pl-10 h-11"
                  autoComplete="off"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Your Testpad API token (found in Testpad settings)
              </p>
            </div>

            <Button type="submit" className="w-full h-11 text-base" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
