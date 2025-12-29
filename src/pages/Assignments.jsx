import React, { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Layout, Typography, Card, Table, Button, Select, Space, Tag, Avatar, 
  Spin, Alert, Checkbox, Row, Col, Statistic, message, Empty 
} from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftOutlined, UserOutlined } from '@ant-design/icons'
import { apiGet, assignTestSuite, unassignTestSuite } from '../utils/api'
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

function Assignments({ embedded = false }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [selectedProject, setSelectedProject] = useState(null)
  const [assignmentFilter, setAssignmentFilter] = useState('all') // all, assigned, unassigned

  // Load projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/v1/projects'),
  })

  const projects = projectsData?.projects || []

  // Function to get all Test Suites with their assignments
  const fetchAllTestSuites = async () => {
    if (projects.length === 0) return []

    const allTestSuites = []
    
    // Limit projects to avoid saturation (adjust as needed)
    const maxProjects = 5
    const projectsToProcess = projects.slice(0, maxProjects)

    for (const project of projectsToProcess) {
      try {
        const foldersResponse = await apiGet(`/api/v1/projects/${project.id}/folders`)
        const folders = foldersResponse.folders || []

        // Recursive function to get all scripts
        const getAllScripts = (items, parentFolder = null) => {
          const scripts = []
          for (const item of items) {
            if (item.type === 'script') {
              scripts.push({ script: item, folder: parentFolder, project })
            } else if (item.type === 'folder' && item.contents) {
              scripts.push(...getAllScripts(item.contents, item))
            }
          }
          return scripts
        }

        const scripts = getAllScripts(folders)

        // Get details of each script (including assignment)
        for (const { script, folder, project } of scripts) {
          try {
            const scriptDetails = await apiGet(`/api/v1/scripts/${script.id}`)
            const scriptData = scriptDetails.script || scriptDetails

            allTestSuites.push({
              id: script.id,
              key: script.id,
              name: scriptData.name || script.name,
              project: {
                id: project.id,
                name: project.name
              },
              folder: folder ? {
                id: folder.id,
                name: folder.name
              } : null,
              assignedTo: scriptData.assigned_to || scriptData.assignee || scriptData.assigned_user || null,
              description: scriptData.description,
              created: scriptData.created
            })
          } catch (error) {
            // Continuar si hay error en un script individual
            console.warn(`Error fetching script ${script.id}:`, error)
          }
        }
      } catch (error) {
        console.warn(`Error fetching project ${project.id}:`, error)
      }
    }

    return allTestSuites
  }

  // Load all Test Suites
  const { data: testSuitesData, isLoading, error } = useQuery({
    queryKey: ['testSuites'],
    queryFn: fetchAllTestSuites,
    staleTime: 30000,
  })

  const allTestSuites = testSuitesData || []

  // TEST MODE: Only allow assigning to these users
  const ALLOWED_USERS = [
    'santiso@gmail.com',
    'santiago.riveira@bitfinex.com'
  ]

  // In test mode, only use allowed users
  const users = ALLOWED_USERS

  // Filter Test Suites
  const filteredTestSuites = useMemo(() => {
    return allTestSuites.filter(ts => {
      // Filter by project
      if (selectedProject && Number(ts.project.id) !== Number(selectedProject.id)) {
        return false
      }

      // Filter by assignment
      if (assignmentFilter === 'assigned' && !ts.assignedTo) {
        return false
      }
      if (assignmentFilter === 'unassigned' && ts.assignedTo) {
        return false
      }

      return true
    })
  }, [allTestSuites, selectedProject, assignmentFilter])

  // Statistics
  const stats = useMemo(() => {
    return {
      total: filteredTestSuites.length,
      assigned: filteredTestSuites.filter(ts => ts.assignedTo).length,
      unassigned: filteredTestSuites.filter(ts => !ts.assignedTo).length,
      selected: selectedRowKeys.length
    }
  }, [filteredTestSuites, selectedRowKeys])

  // Mutation to assign
  const assignMutation = useMutation({
    mutationFn: ({ scriptId, userEmail }) => assignTestSuite(scriptId, userEmail),
    onSuccess: () => {
      queryClient.invalidateQueries(['testSuites'])
      message.success('Test Suite assigned successfully')
    },
    onError: (error) => {
      message.error(`Error assigning: ${error.message}`)
    }
  })

  // Mutation to unassign
  const unassignMutation = useMutation({
    mutationFn: (scriptId) => unassignTestSuite(scriptId),
    onSuccess: () => {
      queryClient.invalidateQueries(['testSuites'])
      message.success('Test Suite unassigned successfully')
    },
    onError: (error) => {
      message.error(`Error unassigning: ${error.message}`)
    }
  })

  // Assign multiple Test Suites
  const handleBulkAssign = async () => {
    if (!selectedUser) {
      message.warning('Please select a user')
      return
    }

    if (selectedRowKeys.length === 0) {
      message.warning('Please select at least one Test Suite')
      return
    }

    try {
      const promises = selectedRowKeys.map(scriptId => 
        assignMutation.mutateAsync({ scriptId, userEmail: selectedUser })
      )
      await Promise.all(promises)
      setSelectedRowKeys([])
      message.success(`${selectedRowKeys.length} Test Suite(s) assigned successfully`)
    } catch (error) {
      message.error('Error assigning some Test Suites')
    }
  }

  // Unassign multiple Test Suites
  const handleBulkUnassign = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning('Please select at least one Test Suite')
      return
    }

    try {
      const promises = selectedRowKeys.map(scriptId => 
        unassignMutation.mutateAsync(scriptId)
      )
      await Promise.all(promises)
      setSelectedRowKeys([])
      message.success(`${selectedRowKeys.length} Test Suite(s) unassigned successfully`)
    } catch (error) {
      message.error('Error unassigning some Test Suites')
    }
  }

  // Table columns
  const columns = [
    {
      title: 'Test Suite',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <div>
          <Text strong>{text}</Text>
          {record.folder && (
            <div>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                📁 {record.folder.name} • {record.project.name}
              </Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Project',
      dataIndex: ['project', 'name'],
      key: 'project',
      width: 150,
    },
    {
      title: 'Folder/Release',
      dataIndex: ['folder', 'name'],
      key: 'folder',
      width: 150,
      render: (text) => text || '-',
    },
    {
      title: 'Assigned to',
      dataIndex: 'assignedTo',
      key: 'assignedTo',
      width: 200,
      render: (email) => {
        if (!email) {
          return <Tag color="default">Unassigned</Tag>
        }
        return (
          <Space>
            <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
              {getInitials(email)}
            </Avatar>
            <Text style={{ fontSize: '12px' }}>{email}</Text>
          </Space>
        )
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      render: (_, record) => (
        <Space>
          {record.assignedTo ? (
            <Button 
              size="small" 
              onClick={() => unassignMutation.mutate(record.id)}
              loading={unassignMutation.isLoading}
            >
              Unassign
            </Button>
          ) : (
            <Select
              size="small"
              placeholder="Assign"
              style={{ width: 200 }}
              onChange={(userEmail) => assignMutation.mutate({ scriptId: record.id, userEmail })}
              loading={assignMutation.isLoading}
            >
              {users.map(user => (
                <Option key={user} value={user}>
                  {user}
                </Option>
              ))}
            </Select>
          )}
        </Space>
      ),
    },
  ]

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    getCheckboxProps: (record) => ({
      disabled: false,
    }),
  }

  const content = (
    <>
      {/* Header */}
      {!embedded && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <Button 
                icon={<ArrowLeftOutlined />} 
                onClick={() => navigate('/')}
                style={{ marginBottom: 8 }}
              >
                Back to Projects
              </Button>
              <Title level={2} style={{ margin: 0 }}>Test Suite Assignments</Title>
              <Text type="secondary">Assign Test Suites to users to organize work</Text>
            </div>
          </div>
        </div>
      )}

        {/* Statistics */}
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic title="Total Test Suites" value={stats.total} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Assigned" 
                value={stats.assigned} 
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="Unassigned" 
                value={stats.unassigned} 
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="Selected" value={stats.selected} />
            </Card>
          </Col>
        </Row>

        {/* Filters and bulk actions */}
        <Card style={{ marginBottom: 24 }}>
          <Space size="large" wrap style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space size="large" wrap>
              <div>
                <Text strong style={{ marginRight: 8 }}>Project:</Text>
                <Select
                  placeholder="All projects"
                  style={{ width: 200 }}
                  allowClear
                  value={selectedProject?.id}
                  onChange={(value) => {
                    if (value) {
                      const project = projects.find(p => Number(p.id) === Number(value))
                      setSelectedProject(project || null)
                    } else {
                      setSelectedProject(null)
                    }
                  }}
                >
                  {projects.map(project => (
                    <Option key={project.id} value={project.id}>
                      {project.name}
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text strong style={{ marginRight: 8 }}>Status:</Text>
                <Select
                  style={{ width: 150 }}
                  value={assignmentFilter}
                  onChange={setAssignmentFilter}
                >
                  <Option value="all">All</Option>
                  <Option value="assigned">Assigned</Option>
                  <Option value="unassigned">Unassigned</Option>
                </Select>
              </div>
            </Space>
            <Space>
              {selectedRowKeys.length > 0 && (
                <>
                  <div>
                    <Text strong style={{ marginRight: 8 }}>Assign to:</Text>
                    <Select
                      placeholder="Select user"
                      style={{ width: 250 }}
                      value={selectedUser}
                      onChange={setSelectedUser}
                    >
                      {users.map(user => (
                        <Option key={user} value={user}>
                          <Space>
                            <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>
                              {getInitials(user)}
                            </Avatar>
                            {user}
                          </Space>
                        </Option>
                      ))}
                    </Select>
                  </div>
                  <Button 
                    type="primary" 
                    onClick={handleBulkAssign}
                    loading={assignMutation.isLoading}
                    disabled={!selectedUser}
                  >
                    Assign {selectedRowKeys.length} selected
                  </Button>
                  <Button 
                    onClick={handleBulkUnassign}
                    loading={unassignMutation.isLoading}
                  >
                    Unassign {selectedRowKeys.length} selected
                  </Button>
                </>
              )}
            </Space>
          </Space>
        </Card>

        {/* Table */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>Loading Test Suites...</div>
          </div>
        ) : error ? (
          <Alert 
            message="Error loading Test Suites" 
            description={error.message}
            type="error"
          />
        ) : filteredTestSuites.length === 0 ? (
          <Empty description="No Test Suites found" />
        ) : (
          <Card>
            <Table
              rowSelection={rowSelection}
              columns={columns}
              dataSource={filteredTestSuites}
              pagination={{
                pageSize: 50,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} Test Suites`
              }}
              size="small"
            />
          </Card>
        )}
    </>
  )

  if (embedded) {
    return content
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          borderBottom: '1px solid #f0f0f0',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}
      >
        <UserMenu />
      </Header>
      <Content style={{ padding: '24px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>
        {content}
      </Content>
    </Layout>
  )
}

export default Assignments

