import React from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Typography, Card, Tag, Spin, Alert, Button, Table, Breadcrumb, Progress, Space, Avatar, Select } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { HomeOutlined, UserOutlined } from '@ant-design/icons'
import { apiGet } from '../utils/api'
import Navbar from '../components/Navbar'

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select

// Get initials from email for avatar
function getInitials(email) {
  if (!email) return '?'
  const parts = email.split('@')[0].split('.')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

// Format date
function formatDate(iso) {
  if (!iso) return 'N/A'
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  } catch {
    return iso
  }
}

function TestSuiteDetails() {
  const { scriptId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  
  // State to select which run to show (default to first/oldest)
  const [selectedRunIndex, setSelectedRunIndex] = React.useState(0)
  
  // Get navigation state information (project and folder)
  const { project, folder } = location.state || {}

  // Load script/test suite details
  const { data: scriptData, isLoading: scriptLoading, error: scriptError } = useQuery({
    queryKey: ['script', scriptId],
    queryFn: () => apiGet(`/api/v1/scripts/${scriptId}`),
    enabled: !!scriptId,
  })

  // Get script from response
  const script = scriptData?.script || scriptData

  // Get selected run info for display
  const selectedRun = script?.runs?.[selectedRunIndex] || script?.runs?.[0] || null

  // Get information from selected run (default to first)
  const getSelectedRunInfo = () => {
    if (!script || !script.runs || !Array.isArray(script.runs) || script.runs.length === 0) {
      return null
    }

    // Ordenar runs por ID (el primero es el más antiguo)
    const sortedRuns = [...script.runs].sort((a, b) => {
      const aId = parseInt(a.id || a.headers?._run || 0)
      const bId = parseInt(b.id || b.headers?._run || 0)
      return aId - bId
    })

    const selectedRun = sortedRuns[selectedRunIndex] || sortedRuns[0]
    const runProgress = selectedRun.progress || {}
    const tests = script.tests || []
    
    // Calcular estadísticas del run seleccionado
    const total = runProgress.total || tests.length
    const passed = runProgress.pass || 0
    const failed = runProgress.fail || 0
    const blocked = runProgress.block || 0
    const query = runProgress.query || 0
    const notRun = total - passed - failed - blocked - query
    
    // Parse user information
    let userInfo = null
    if (selectedRun.label) {
      const parts = selectedRun.label.split(' / ')
      if (parts.length >= 2) {
        userInfo = {
          runNumber: parts[0] || null,
          email: parts[1] || null,
          date: parts[2] || null,
          fullLabel: selectedRun.label
        }
      }
    }

    // Try to get email from other sources if not in label
    if (!userInfo?.email) {
      const testerEmail = selectedRun.headers?._tester || selectedRun.assignee?.email
      if (testerEmail && testerEmail.includes('@')) {
        userInfo = userInfo || {}
        userInfo.email = testerEmail
      }
    }

    return {
      run: selectedRun,
      id: selectedRun.id,
      created: selectedRun.created || selectedRun.headers?._createdDate,
      state: selectedRun.state,
      label: selectedRun.label,
      userInfo: userInfo,
      stats: {
        total,
        passed,
        failed,
        blocked,
        query,
        notRun: notRun > 0 ? notRun : 0,
        percentage: total > 0 ? Math.round((passed / total) * 100) : 0
      },
      allRuns: sortedRuns
    }
  }

  const runInfo = getSelectedRunInfo()

  const handleBackToFolder = () => {
    // Go back to main page and pass state to show project and folders
    navigate('/', { 
      state: { 
        projectId: project?.id,
        showFolders: true,
        folder: folder
      } 
    })
  }

  const handleBackToProject = () => {
    // Go back to main page and pass state to show project
    navigate('/', { 
      state: { 
        projectId: project?.id,
        showFolders: false
      } 
    })
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Navbar />
      <Content style={{ padding: '24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        {/* Breadcrumbs */}
        <Breadcrumb 
          style={{ marginBottom: 16 }}
          items={[
            {
              title: (
                <span 
                  onClick={() => navigate('/')} 
                  style={{ cursor: 'pointer', color: '#1890ff' }}
                >
                  <HomeOutlined /> {project?.name || 'Projects'}
                </span>
              ),
            },
            folder && {
              title: (
                <span 
                  onClick={handleBackToFolder} 
                  style={{ cursor: 'pointer', color: '#1890ff' }}
                >
                  📁 {folder.name}
                </span>
              ),
            },
            script && {
              title: <span>📄 {script.name || 'Test Suite'}</span>,
            },
          ].filter(Boolean)}
        />

        {/* Header compacto */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <Title level={2} style={{ margin: 0, fontSize: '24px' }}>
                {script?.name || 'Test Suite Details'}
              </Title>
              {script?.id && (
                <Text type="secondary" style={{ fontSize: '12px' }}>ID: {script.id}</Text>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {folder && (
                <Button onClick={handleBackToFolder}>
                  Back to Folder
                </Button>
              )}
              <Button 
                type="default"
                onClick={handleBackToProject}
              >
                Back to Project
              </Button>
            </div>
          </div>

          {/* Test Run Progress - Mostrando el run seleccionado (por defecto el primero) */}
          {runInfo && runInfo.stats && (
            <Card size="small" style={{ background: '#f8fafc', border: '1px solid #e8e8e8' }}>
              {/* Header con Test Suite name, Folder y Run selector */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <Text strong style={{ fontSize: '16px', display: 'block', marginBottom: 4 }}>
                      {script?.name || 'Test Suite'}
                    </Text>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      {folder && (
                        <Tag color="blue" style={{ margin: 0 }}>
                          📁 {folder.name}
                        </Tag>
                      )}
                      {project && (
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {project.name}
                        </Text>
                      )}
                    </div>
                  </div>
                  {runInfo.allRuns && runInfo.allRuns.length > 1 && (
                    <Select
                      size="small"
                      value={selectedRunIndex}
                      onChange={setSelectedRunIndex}
                      style={{ width: 220 }}
                    >
                      {runInfo.allRuns.map((run, index) => {
                        const runLabel = run.label || `Run #${run.id || index + 1}`
                        const parts = runLabel.split(' / ')
                        const runNumber = parts[0] || `#${run.id || index + 1}`
                        const email = parts[1] || run.headers?._tester || run.assignee?.email || 'Unknown'
                        const emailPrefix = email.split('@')[0]
                        return (
                          <Option key={index} value={index}>
                            Run #{runNumber} {emailPrefix && `(${emailPrefix})`}
                          </Option>
                        )
                      })}
                    </Select>
                  )}
                </div>
              </div>

              {/* Progress Circle y User Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20, flexWrap: 'wrap' }}>
                <Progress
                  type="circle"
                  percent={runInfo.stats.percentage}
                  size={100}
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                  format={() => `${runInfo.stats.percentage}%`}
                />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                      {getInitials(runInfo.userInfo?.email || '?')}
                    </Avatar>
                    <div>
                      <Text strong style={{ fontSize: '13px', display: 'block' }}>
                        {runInfo.userInfo?.email?.split('@')[0] || runInfo.userInfo?.email || 'Unknown'}
                      </Text>
                      {runInfo.userInfo?.runNumber && (
                        <Text type="secondary" style={{ fontSize: '11px' }}>
                          Run #{runInfo.userInfo.runNumber}
                        </Text>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    {runInfo.userInfo?.date && (
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        {runInfo.userInfo.date}
                      </Text>
                    )}
                    {runInfo.state && (
                      <Tag 
                        color={runInfo.state === 'started' ? 'processing' : runInfo.state === 'completed' ? 'success' : 'default'}
                        style={{ fontSize: '11px', margin: 0 }}
                      >
                        {runInfo.state}
                      </Tag>
                    )}
                  </div>
                </div>
              </div>

              {/* Statistics Grid */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', 
                gap: 12,
                marginBottom: 16
              }}>
                <div style={{ 
                  padding: '12px', 
                  backgroundColor: '#f5f5f5', 
                  borderRadius: '4px',
                  textAlign: 'center'
                }}>
                  <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 4 }}>
                    Total
                  </Text>
                  <Text strong style={{ fontSize: '18px', display: 'block' }}>
                    {runInfo.stats.total}
                  </Text>
                </div>
                <div style={{ 
                  padding: '12px', 
                  backgroundColor: '#f6ffed', 
                  borderRadius: '4px',
                  textAlign: 'center',
                  border: '1px solid #b7eb8f'
                }}>
                  <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 4 }}>
                    Passed
                  </Text>
                  <Text strong style={{ fontSize: '18px', color: '#52c41a', display: 'block' }}>
                    {runInfo.stats.passed}
                  </Text>
                </div>
                {runInfo.stats.failed > 0 && (
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#fff1f0', 
                    borderRadius: '4px',
                    textAlign: 'center',
                    border: '1px solid #ffccc7'
                  }}>
                    <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 4 }}>
                      Failed
                    </Text>
                    <Text strong style={{ fontSize: '18px', color: '#ff4d4f', display: 'block' }}>
                      {runInfo.stats.failed}
                    </Text>
                  </div>
                )}
                {runInfo.stats.blocked > 0 && (
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#fff7e6', 
                    borderRadius: '4px',
                    textAlign: 'center',
                    border: '1px solid #ffe58f'
                  }}>
                    <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 4 }}>
                      Blocked
                    </Text>
                    <Text strong style={{ fontSize: '18px', color: '#faad14', display: 'block' }}>
                      {runInfo.stats.blocked}
                    </Text>
                  </div>
                )}
                {runInfo.stats.notRun > 0 && (
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#fafafa', 
                    borderRadius: '4px',
                    textAlign: 'center',
                    border: '1px solid #e8e8e8'
                  }}>
                    <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginBottom: 4 }}>
                      Not Run
                    </Text>
                    <Text strong style={{ fontSize: '18px', color: '#8c8c8c', display: 'block' }}>
                      {runInfo.stats.notRun}
                    </Text>
                  </div>
                )}
              </div>

              {/* Summary Line */}
              <div style={{ 
                padding: '10px 12px', 
                backgroundColor: '#fff', 
                borderRadius: '4px',
                border: '1px solid #e8e8e8'
              }}>
                <Text style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                  Pass: <Text strong style={{ color: '#52c41a' }}>{runInfo.stats.passed}</Text>{' '}
                  Fail: <Text strong style={{ color: '#ff4d4f' }}>{runInfo.stats.failed}</Text>{' '}
                  Block: <Text strong style={{ color: '#faad14' }}>{runInfo.stats.blocked}</Text>{' '}
                  Query: <Text strong>0</Text>{' '}
                  Total: <Text strong>{runInfo.stats.passed}/{runInfo.stats.total}</Text>
                </Text>
              </div>
            </Card>
          )}
        </div>

        {scriptLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>Loading test suite details...</div>
          </div>
        ) : scriptError ? (
          <Alert 
            message="Error loading test suite details" 
            description={scriptError.message}
            type="error"
          />
        ) : script ? (
          <div>
            {/* Información básica compacta */}
            <Card size="small" style={{ marginBottom: 16, background: '#f8fafc' }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center', fontSize: '12px' }}>
                {script.description && (
                  <div>
                    <Text type="secondary" style={{ fontSize: '11px' }}>Description: </Text>
                    <Text>{script.description}</Text>
                  </div>
                )}
                {script.created && (
                  <div>
                    <Text type="secondary" style={{ fontSize: '11px' }}>Created: </Text>
                    <Text>{formatDate(script.created)}</Text>
                  </div>
                )}
              </div>
            </Card>

            {/* Tabla compacta de Test Cases */}
            <Card 
              title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Text strong>Test Cases</Text>
                  {script.tests && Array.isArray(script.tests) && (
                    <Tag color="blue">{script.tests.length}</Tag>
                  )}
                </div>
              }
            >
              {script.tests && Array.isArray(script.tests) && script.tests.length > 0 ? (
                <Table
                  dataSource={script.tests.map((test, index) => ({ ...test, key: test.id || index, _index: index + 1 }))}
                  pagination={{ 
                    pageSize: 50,
                    showSizeChanger: true,
                    showTotal: (total) => `Total ${total} test cases`
                  }}
                  size="small"
                  columns={[
                    {
                      title: '#',
                      dataIndex: 'id',
                      key: 'id',
                      width: 80,
                      align: 'center',
                      render: (id) => id || '-',
                    },
                    {
                      title: 'Name',
                      dataIndex: 'text',
                      key: 'text',
                      render: (text, record) => {
                        // Usar text si existe, sino name, sino un mensaje por defecto
                        const fullText = text || record.name || 'Test Case without name'
                        return <Text style={{ fontSize: '13px' }}>{fullText}</Text>
                      },
                      ellipsis: {
                        showTitle: true,
                      },
                    },
                  ]}
                />
              ) : (
                <Text type="secondary">No test cases found in this test suite.</Text>
              )}
            </Card>
          </div>
        ) : (
          <Text type="secondary">No test suite data available.</Text>
        )}
      </Content>
    </Layout>
  )
}

export default TestSuiteDetails