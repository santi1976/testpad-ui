import { useNavigate, useLocation } from 'react-router-dom'
import UserMenu from './UserMenu'

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const navItems = [
    { key: '/dashboard', label: 'Dashboard' },
    { key: '/test-executions', label: 'Test Executions' },
  ]

  return (
    <header className="bg-[#001529] px-6 flex justify-between items-center h-14 shadow-md">
      <div className="flex items-center gap-10 h-full">
        <span
          className="text-lg font-semibold text-white cursor-pointer tracking-wide"
          onClick={() => navigate('/')}
        >
          Testpad
        </span>
        <div className="flex gap-1 items-center h-full">
          {navItems.map((item) => (
            <div
              key={item.key}
              onClick={() => navigate(item.key)}
              className={`px-5 h-10 flex items-center cursor-pointer transition-all rounded-md mx-0.5
                ${isActive(item.key) ? 'bg-blue-500' : 'hover:bg-white/10'}`}
            >
              <span className={`text-[15px] text-white ${isActive(item.key) ? 'font-semibold' : ''}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <UserMenu darkMode />
    </header>
  )
}
