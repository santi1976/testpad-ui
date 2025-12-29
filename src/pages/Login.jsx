import React, { useState, useEffect } from 'react'
import { Layout, Form, Input, Button, Card, Typography, Alert, Space } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

const { Content } = Layout
const { Title, Text } = Typography

export default function Login() {
  const [form] = Form.useForm()
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const { login, isAuthenticated, isLoading } = useAuth()
  const navigate = useNavigate()

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, isLoading, navigate])

  const handleSubmit = async (values) => {
    setError(null)
    setLoading(true)

    try {
      await login(values.email, values.apiToken)
      // Redirect to main page
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Error signing in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <Content
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <Card
          bordered={false}
          style={{
            width: '100%',
            maxWidth: 420,
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
            borderRadius: 12,
          }}
          bodyStyle={{ padding: 40 }}
        >
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div style={{ textAlign: 'center' }}>
              <Title level={2} style={{ marginBottom: 8 }}>
                Testpad Dashboard
              </Title>
              <Text type="secondary">Sign in with your corporate account</Text>
            </div>

            {error && (
              <Alert
                message={error}
                type="error"
                showIcon
                closable
                onClose={() => setError(null)}
              />
            )}

            <Form
              form={form}
              name="login"
              onFinish={handleSubmit}
              layout="vertical"
              size="large"
              autoComplete="off"
            >
              <Form.Item
                name="email"
                label="Email"
                rules={[
                  { required: true, message: 'Please enter your email' },
                  { type: 'email', message: 'Invalid email' },
                  {
                    validator: (_, value) => {
                      if (!value) return Promise.resolve()
                      const domain = value.split('@')[1]?.toLowerCase()
                      if (domain === 'bitfinex.com' || domain === 'tether.com') {
                        return Promise.resolve()
                      }
                      return Promise.reject(
                        new Error('Email must be from @bitfinex.com or @tether.com')
                      )
                    }
                  }
                ]}
              >
                <Input
                  prefix={<UserOutlined />}
                  placeholder="user@bitfinex.com or user@tether.com"
                  autoComplete="email"
                />
              </Form.Item>

              <Form.Item
                name="apiToken"
                label="API Token"
                rules={[
                  { required: true, message: 'Please enter your API token' }
                ]}
                help="Your Testpad API token (found in Testpad settings)"
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="Your Testpad API token"
                  autoComplete="off"
                />
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  loading={loading}
                  style={{ height: 44, fontSize: 16 }}
                >
                  Sign In
                </Button>
              </Form.Item>
            </Form>
          </Space>
        </Card>
      </Content>
    </Layout>
  )
}

