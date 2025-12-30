import React, { useState, useEffect } from 'react'
import { Layout, Menu, Typography, Card, Divider, Tag, Spin, Alert, Button, Collapse, Dropdown } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation } from 'react-router-dom'
import Navbar from './components/Navbar'
import { apiGet } from './utils/api'
import './App.css'

const { Sider, Content } = Layout
const { Title, Text } = Typography
const { Panel } = Collapse

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

// Count folders and scripts recursively
function countItems(items) {
  if (!items || !Array.isArray(items)) return { folders: 0, scripts: 0 }
  let folders = 0
  let scripts = 0
  items.forEach(item => {
    if (item.type === 'folder') {
      folders++
      const sub = countItems(item.contents || [])
      folders += sub.folders
      scripts += sub.scripts
    } else if (item.type === 'script') {
      scripts++
    }
  })
  return { folders, scripts }
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [selectedKey, setSelectedKey] = useState(null)
  const [expandedKeys, setExpandedKeys] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [showFolders, setShowFolders] = useState(false)

  // Load projects
  const { data: projectsData, isLoading: projectsLoading, error: projectsError } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/v1/projects'),
  })

  // Get projects from response
  const projects = projectsData?.projects || []

  // Extract selected project ID
  const projectIdMatch = selectedKey?.match(/^p-(\d+)$/)
  const selectedProjectId = projectIdMatch ? Number(projectIdMatch[1]) : null

  // Get selected project directly from list
  const selectedProject = selectedProjectId 
    ? projects.find(p => p.id === selectedProjectId)
    : null

  // Load folders from selected project
  const { data: foldersData, isLoading: foldersLoading, error: foldersError } = useQuery({
    queryKey: ['folders', selectedProjectId],
    queryFn: () => apiGet(`/api/v1/projects/${selectedProjectId}/folders`),
    enabled: !!selectedProjectId && showFolders, // Only load when requested
  })

  // Handle navigation state when coming from another page
  useEffect(() => {
    if (location.state) {
      const { projectId, showFolders: stateShowFolders } = location.state
      if (projectId) {
        // Select the project
        setSelectedKey(`p-${projectId}`)
        // Show folders if coming from state
        if (stateShowFolders !== undefined) {
          setShowFolders(stateShowFolders)
        }
      }
    }
  }, [location.state])

  // Reset showFolders when selected project changes
  useEffect(() => {
    // Only reset if not coming from navigation state
    if (!location.state?.showFolders) {
      setShowFolders(false)
    }
  }, [selectedProjectId])

  // Inicializar menú cuando se cargan los proyectos
  useEffect(() => {
    if (projects && projects.length > 0 && menuItems.length === 0) {
      const items = projects.map(project => ({
        key: `p-${project.id}`,
        label: project.name
      }))
      setMenuItems(items)
    }
  }, [projects, menuItems.length])

  // Manejar selección del menú
  const handleMenuSelect = (info) => {
    const key = info?.key || info
    if (key) {
      setSelectedKey(key)
    }
  }

  // Manejar click del botón para mostrar folders
  const handleShowFolders = () => {
    setShowFolders(true)
  }

  // Helper function to find parent folder of a script
  const findParentFolder = (items, targetScriptId, parent = null) => {
    for (const it of items) {
      if (it.type === 'script' && it.id === targetScriptId) {
        return parent
      }
      if (it.type === 'folder' && it.contents) {
        const found = findParentFolder(it.contents, targetScriptId, it)
        if (found !== null) return found
      }
    }
    return null
  }

  // Renderizar estructura de folders recursivamente
  const renderFolderStructure = (items, level = 0, allFolders = null) => {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return <Text type="secondary" style={{ marginLeft: level * 24 }}>Empty</Text>
    }

    return items.map((item, index) => {
      if (item.type === 'folder') {
        const counts = countItems(item.contents || [])
        return (
          <div key={`${item.id}-${index}`} style={{ marginBottom: 8 }}>
            <div style={{ 
              marginLeft: level * 24, 
              padding: '8px 12px',
              background: '#f8fafc',
              borderRadius: '4px',
              border: '1px solid #e5e7eb'
            }}>
              <Text strong>📁 {item.name}</Text>
              <Tag color="blue" style={{ marginLeft: 8 }}>ID: {item.id}</Tag>
              {counts.folders > 0 && (
                <Tag color="green" style={{ marginLeft: 4 }}>
                  {counts.folders} folder(s)
                </Tag>
              )}
              {counts.scripts > 0 && (
                <Tag color="orange" style={{ marginLeft: 4 }}>
                  {counts.scripts} script(s)
                </Tag>
              )}
            </div>
            {item.contents && item.contents.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {renderFolderStructure(item.contents, level + 1, allFolders)}
              </div>
            )}
          </div>
        )
      } else if (item.type === 'script') {
        // Find parent folder using allFolders
        const parentFolder = allFolders ? findParentFolder(allFolders, item.id) : null
        
        return (
          <div 
            key={`${item.id}-${index}`} 
            onClick={() => {
              // Navigate to test suite details page
              navigate(`/test-suite/${item.id}`, {
                state: {
                  project: selectedProject,
                  folder: parentFolder
                }
              })
            }}
            style={{ 
              marginLeft: level * 24, 
              marginBottom: 4,
              padding: '6px 12px',
              background: '#fff7e6',
              borderRadius: '4px',
              border: '1px solid #ffe58f',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fffbe6'
              e.currentTarget.style.borderColor = '#ffd666'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#fff7e6'
              e.currentTarget.style.borderColor = '#ffe58f'
            }}
          >
            <Text>📄 {item.name}</Text>
            <Tag color="purple" style={{ marginLeft: 8 }}>ID: {item.id}</Tag>
            {item.created && (
              <Tag style={{ marginLeft: 4 }}>{formatDate(item.created)}</Tag>
            )}
          </div>
        )
      }
      return null
    })
  }

  return (
    <Layout style={{ minHeight: '100vh', margin: 0, padding: 0 }}>
      {/* Header row with PROJECTS title and Navbar */}
      <div style={{ 
        display: 'flex', 
        flexDirection: 'row', 
        margin: 0, 
        padding: 0,
        height: 56,
        width: '100%',
      }}>
        <div style={{ 
          width: 280,
          padding: '0 20px', 
          fontWeight: 700, 
          fontSize: 14,
          letterSpacing: '1.5px',
          background: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
          color: '#fff',
          textTransform: 'uppercase',
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
          margin: 0,
          flexShrink: 0,
          borderBottom: '1px solid #64748b',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          PROJECTS
        </div>
        <div style={{ flex: 1, height: 56, margin: 0, padding: 0 }}>
          <Navbar />
        </div>
      </div>
      
      <Layout style={{ flexDirection: 'row', margin: 0, padding: 0 }}>
        <Sider 
          width={280} 
          style={{ 
            // Light mode - Warm, inviting background
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)', 
            borderRight: '1px solid #cbd5e1',
            margin: 0,
            padding: 0,
            overflow: 'hidden',
            boxShadow: '2px 0 12px rgba(0,0,0,0.08)',
            // Dark mode (for future implementation):
            // background: '#0f1419', 
            // borderRight: '1px solid #1a1f35',
            // boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
          }}
        >
        {projectsLoading ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <Spin />
            <div style={{ marginTop: 12 }}>Loading projects...</div>
          </div>
        ) : projectsError ? (
          <div style={{ padding: '16px' }}>
            <Alert 
              message="Error loading projects" 
              description={projectsError.message} 
              type="error" 
            />
          </div>
        ) : (
          <div style={{ padding: '8px' }}>
            {menuItems.map((item) => {
              const isSelected = selectedKey === item.key
              return (
                <div
                  key={item.key}
                  onClick={() => handleMenuSelect({ key: item.key })}
                  style={{
                    margin: '6px 0',
                    padding: '0 16px',
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    // Light mode - Clear contrast for inactive buttons
                    background: isSelected 
                      ? 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)' 
                      : '#e2e8f0',
                    borderRadius: '10px',
                    border: isSelected 
                      ? '1px solid rgba(24, 144, 255, 0.3)' 
                      : '1px solid #94a3b8',
                    boxShadow: isSelected 
                      ? '0 4px 12px rgba(24, 144, 255, 0.3), 0 2px 4px rgba(24, 144, 255, 0.2)' 
                      : '0 2px 4px rgba(0,0,0,0.1)',
                    color: isSelected ? '#fff' : '#1e293b',
                    fontWeight: isSelected ? 600 : 500,
                    fontSize: '14px',
                    // Dark mode (for future implementation):
                    // background: isSelected 
                    //   ? 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)' 
                    //   : 'rgba(255, 255, 255, 0.25)',
                    // border: isSelected 
                    //   ? '1px solid rgba(255,255,255,0.2)' 
                    //   : '1px solid rgba(255,255,255,0.1)',
                    // color: isSelected ? '#fff' : '#fff',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      // Light mode - Darker on hover
                      e.currentTarget.style.background = '#cbd5e1'
                      e.currentTarget.style.borderColor = '#64748b'
                      e.currentTarget.style.color = '#0f172a'
                      // Dark mode: e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)'
                      // Dark mode: e.currentTarget.style.color = '#fff'
                      e.currentTarget.style.transform = 'translateX(4px)'
                      e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)'
                    } else {
                      e.currentTarget.style.transform = 'translateX(2px)'
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(24, 144, 255, 0.4), 0 2px 6px rgba(24, 144, 255, 0.3)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      // Light mode - Return to darker inactive state (visible contrast)
                      e.currentTarget.style.background = '#e2e8f0'
                      e.currentTarget.style.borderColor = '#94a3b8'
                      e.currentTarget.style.color = '#1e293b'
                      // Dark mode: e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'
                      // Dark mode: e.currentTarget.style.color = '#fff'
                      e.currentTarget.style.transform = 'translateX(0)'
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
                    } else {
                      e.currentTarget.style.transform = 'translateX(0)'
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(24, 144, 255, 0.3), 0 2px 4px rgba(24, 144, 255, 0.2)'
                    }
                  }}
                >
                  {item.label}
                </div>
              )
            })}
          </div>
        )}
        </Sider>

        <Layout style={{ flex: 1, margin: 0, padding: 0 }}>
          <Content style={{ padding: '32px', background: '#fafafa', overflow: 'auto' }}>
          {!selectedKey || !selectedProject ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center', 
              minHeight: 'calc(100vh - 200px)',
              maxWidth: 600,
              margin: '0 auto',
              textAlign: 'center'
            }}>
              <div style={{ 
                fontSize: 64, 
                marginBottom: 24,
                opacity: 0.3
              }}>
                📋
              </div>
              <Title level={2} style={{ marginBottom: 12, color: '#1f2937', fontWeight: 600 }}>
                Welcome to Testpad
              </Title>
              <Text style={{ fontSize: 16, color: '#6b7280', marginBottom: 32, display: 'block' }}>
                Select a project from the left menu to view details and manage test suites.
              </Text>
              {projects.length > 0 && (
                <div style={{ 
                  padding: '16px 24px',
                  background: '#fff',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                }}>
                  <Text style={{ fontSize: 14, color: '#374151' }}>
                    <Text strong style={{ color: '#1890ff' }}>{projects.length}</Text> project{projects.length !== 1 ? 's' : ''} available
                  </Text>
                </div>
              )}
            </div>
          ) : (
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
              {/* Header con nombre del proyecto */}
              <div style={{ marginBottom: 24 }}>
                <Title level={1} style={{ marginBottom: 16 }}>
                  {selectedProject.name || 'Unknown Project'}
                </Title>
                
                {/* Tags con ID y fecha, y botón para folders */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                  <Tag color="blue" style={{ fontSize: '14px', padding: '6px 14px' }}>
                    ID: {selectedProject.id}
                  </Tag>
                  {selectedProject.created && (
                    <Tag color="green" style={{ fontSize: '14px', padding: '6px 14px' }}>
                      Created: {formatDate(selectedProject.created)}
                    </Tag>
                  )}
                  <Button 
                    type="primary" 
                    onClick={handleShowFolders}
                    disabled={showFolders && foldersLoading}
                  >
                    {showFolders && foldersLoading ? (
                      <>
                        <Spin size="small" style={{ marginRight: 8 }} />
                        Loading...
                      </>
                    ) : showFolders ? (
                      'Refresh Test Suites'
                    ) : (
                      'Show Test Suites by Release'
                    )}
                  </Button>
                </div>
              </div>

              <Divider style={{ margin: '12px 0' }} />

              {/* Información detallada en tarjeta - Layout horizontal compacto */}
              <Card 
                title="Project Details" 
                style={{ marginTop: 8, background: '#f8fafc' }} 
                styles={{ body: { padding: '12px 20px', background: '#f8fafc' } }}
              >
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                    <Text strong style={{ color: '#595959', display: 'block', marginBottom: 2, fontSize: '11px' }}>
                      Project ID
                    </Text>
                    <Text style={{ fontSize: '13px' }}>{selectedProject.id}</Text>
                  </div>
                  
                  {selectedProject.created && (
                    <div style={{ flex: '1 1 180px', minWidth: 150 }}>
                      <Text strong style={{ color: '#595959', display: 'block', marginBottom: 2, fontSize: '11px' }}>
                        Created Date
                      </Text>
                      <Text style={{ fontSize: '13px', display: 'block', lineHeight: '1.3' }}>{formatDate(selectedProject.created)}</Text>
                      <Text type="secondary" style={{ fontSize: '10px', display: 'block', marginTop: 1, lineHeight: '1.2' }}>
                        {selectedProject.created}
                      </Text>
                    </div>
                  )}
                  
                  {selectedProject.description && (
                    <div style={{ flex: '1 1 200px', minWidth: 150 }}>
                      <Text strong style={{ color: '#595959', display: 'block', marginBottom: 2, fontSize: '11px' }}>
                        Description
                      </Text>
                      <Text style={{ fontSize: '13px', lineHeight: '1.3' }}>{selectedProject.description}</Text>
                    </div>
                  )}
                </div>
              </Card>

              {/* Sección de Test Suites por Release */}
              {showFolders && (
                  <Card 
                    title="Test Suites by Release" 
                    style={{ marginTop: 12 }}
                    extra={
                      foldersData?.folders && (
                        <Tag color="blue">
                          {countItems(foldersData.folders).folders} releases, {countItems(foldersData.folders).scripts} test suites
                        </Tag>
                      )
                    }
                  >
                    {foldersLoading ? (
                      <div style={{ textAlign: 'center', padding: '40px' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16 }}>Loading test suites...</div>
                      </div>
                    ) : foldersError ? (
                      <Alert 
                        message="Error loading test suites" 
                        description={foldersError.message}
                        type="error"
                      />
                    ) : foldersData?.folders && foldersData.folders.length > 0 ? (
                      <div>
                        {renderFolderStructure(foldersData.folders, 0, foldersData.folders)}
                      </div>
                    ) : (
                      <Text type="secondary">No releases or test suites found in this project.</Text>
                    )}
                  </Card>
              )}
            </div>
          )}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  )
}

export default App