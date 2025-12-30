import React from 'react'
import { Layout, Typography } from 'antd'
import { useNavigate, useLocation } from 'react-router-dom'
import UserMenu from './UserMenu'

const { Header } = Layout
const { Text } = Typography

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path + '/')
  }

  const navItems = [
    { key: '/dashboard', label: 'Dashboard' },
    { key: '/test-executions', label: 'Test Executions' },
  ]

  return (
    <Header
      style={{
        background: '#001529',
        padding: '0 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 56,
        margin: 0,
        paddingTop: 0,
        paddingBottom: 0,
        lineHeight: '56px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 40,
        height: '100%'
      }}>
        <Text 
          strong 
          style={{ 
            fontSize: 18, 
            color: '#fff',
            cursor: 'pointer',
            letterSpacing: '0.5px',
          }}
          onClick={() => navigate('/')}
        >
          Testpad
        </Text>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', height: '100%' }}>
          {navItems.map((item) => {
            const active = isActive(item.key)
            return (
              <div
                key={item.key}
                onClick={() => navigate(item.key)}
                style={{
                  padding: '0 20px',
                  height: 40,
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  backgroundColor: active ? '#1890ff' : 'transparent',
                  borderRadius: 6,
                  margin: '0 2px',
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: active ? 600 : 400,
                    color: '#fff',
                    transition: 'all 0.2s',
                  }}
                >
                  {item.label}
                </Text>
              </div>
            )
          })}
        </div>
      </div>
      <UserMenu darkMode />
    </Header>
  )
}