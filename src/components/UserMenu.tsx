import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface UserMenuProps {
  darkMode?: boolean
}

export default function UserMenu({ darkMode = false }: UserMenuProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const getInitials = (email: string | undefined): string => {
    if (!email) return 'U'
    const username = email.split('@')[0]
    if (username.includes('.')) {
      const parts = username.split('.')
      if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase()
      }
    }
    if (username.length >= 2) {
      return username.substring(0, 2).toUpperCase()
    }
    return username[0].toUpperCase()
  }

  const getDomainColor = (domain: string | undefined): string => {
    if (domain === 'bitfinex.com') return 'bg-blue-500'
    if (domain === 'tether.com') return 'bg-green-500'
    return 'bg-purple-600'
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-2 cursor-pointer px-3 py-1 rounded-md transition-colors ${
            darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'
          }`}
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className={`${getDomainColor(user?.domain)} text-white text-xs`}>
              {getInitials(user?.email)}
            </AvatarFallback>
          </Avatar>
          <span className={`font-medium ${darkMode ? 'text-white' : 'text-blue-500'}`}>
            {user?.email?.split('@')[0]}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Log Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
