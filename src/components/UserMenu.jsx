import React from 'react'
import { Dropdown, Avatar, Space, Typography } from 'antd'
import { UserOutlined, LogoutOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

const { Text } = Typography

export default function UserMenu({ darkMode = false }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const getInitials = (email) => {
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

  const getDomainColor = (domain) => {
    if (domain === 'bitfinex.com') return '#1890ff'
    if (domain === 'tether.com') return '#52c41a'
    return '#722ed1'
  }

  const menuItems = [
    {
      key: 'user-info',
      label: (
        <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0', marginBottom: 4 }}>
          <Text strong style={{ display: 'block' }}>
            {user?.email}
          </Text>
        </div>
      ),
      disabled: true,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      label: (
        <Space>
          <LogoutOutlined />
          <span>Log Out</span>
        </Space>
      ),
      onClick: handleLogout,
      danger: true,
    },
  ]

  return (
    <Dropdown
      menu={{ items: menuItems }}
      placement="bottomRight"
      trigger={['click']}
    >
      <Space
        style={{
          cursor: 'pointer',
          padding: '4px 12px',
          borderRadius: '6px',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = darkMode ? 'rgba(255,255,255,0.1)' : '#f5f5f5'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
      >
        <Avatar
          size="small"
          style={{
            backgroundColor: getDomainColor(user?.domain),
            cursor: 'pointer',
          }}
        >
          {getInitials(user?.email)}
        </Avatar>
        <Text style={{ color: darkMode ? '#fff' : '#1890ff', fontWeight: 500 }}>
          {user?.email?.split('@')[0]}
        </Text>
      </Space>
    </Dropdown>
  )
}