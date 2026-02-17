import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Key,
  Mail,
  Users,
  LogOut,
  Eye,
  EyeOff,
  Check,
  Hash,
  MessageSquare,
  RefreshCw,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Sidebar } from '@/components/layout/Sidebar'

export default function Settings() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [showApiKey, setShowApiKey] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)


  const handleSignOut = () => {
    logout()
    navigate('/login')
  }

  // Slack settings (local state for now)
  const [slackChannel, setSlackChannel] = useState('#qa-testing')
  const [slackTemplate, setSlackTemplate] = useState(
    '*Test Assignment*\nHi {tester}, you have been assigned to test:\n- {scriptName}\n\nPlease complete by EOD.'
  )

  const apiKey = user?.apiToken || ''
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 8)}${'•'.repeat(20)}${apiKey.slice(-4)}`
    : 'Not connected'

  const handleDisconnect = () => {
    setIsDisconnecting(true)
    setTimeout(() => {
      logout()
      toast.success('Disconnected successfully')
      navigate('/login')
    }, 500)
  }

  const handleSaveSlackSettings = () => {
    // Save to localStorage for now
    localStorage.setItem('slack_channel', slackChannel)
    localStorage.setItem('slack_template', slackTemplate)
    toast.success('Slack settings saved')
  }

  // Mock team members (in real app, fetch from API)
  const teamMembers = [
    { email: 'santiago.riveira@bitfinex.com', status: 'active' },
    { email: 'saurabh.verma@bitfinex.com', status: 'active' },
    { email: 'harvey.decapia@bitfinex.com', status: 'active' },
  ]

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar activeKey="settings" />

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600">Configure your Testpad Admin preferences</p>
          </div>

          {/* API Connection */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Connection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Testpad API Key</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={showApiKey ? apiKey : maskedKey}
                    readOnly
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-green-600">
                <Check className="h-4 w-4" />
                Connected to Testpad API
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => navigate('/')} className="flex-1">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh Data
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDisconnect}
                  disabled={isDisconnecting}
                  className="flex-1"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Email Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Sender Email</Label>
                <Input type="email" value={user?.email || ''} readOnly />
                <p className="text-xs text-gray-500">
                  Only @bitfinex.com and @tether.io domains allowed
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Slack Integration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5" />
                Slack Integration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Default Channel</Label>
                <Input
                  placeholder="#qa-testing"
                  value={slackChannel}
                  onChange={(e) => setSlackChannel(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Message Template</Label>
                <Textarea
                  rows={4}
                  placeholder="Custom message template..."
                  value={slackTemplate}
                  onChange={(e) => setSlackTemplate(e.target.value)}
                />
                <p className="text-xs text-gray-500">
                  Variables: {'{tester}'}, {'{scriptName}'}, {'{runNumber}'}, {'{projectName}'}
                </p>
              </div>

              <Button onClick={handleSaveSlackSettings} className="w-full">
                <MessageSquare className="mr-2 h-4 w-4" />
                Save Slack Settings
              </Button>
            </CardContent>
          </Card>

          {/* Team Members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-gray-500">
                Testers are loaded dynamically from project members via API
              </p>
              <div className="space-y-2">
                {teamMembers.map((member) => (
                  <div
                    key={member.email}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <span className="text-sm">{member.email}</span>
                    <Badge
                      variant="outline"
                      className="bg-green-50 text-green-700 border-green-200"
                    >
                      Active
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}
