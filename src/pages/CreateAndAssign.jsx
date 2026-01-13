import React, { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Layout, Typography, Card, Button, Select, Space, Tag, Avatar, 
  Alert, Row, Col, message, Empty, Table, Divider,
  Steps, Input, AutoComplete, Checkbox, Tooltip
} from 'antd'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  ArrowLeftOutlined, PlusOutlined, CheckOutlined, SendOutlined, 
  SearchOutlined, CloseOutlined
} from '@ant-design/icons'
import { apiGet } from '../utils/api'
import { assignAndSendEmail } from '../api/assignAndSendEmail'
import { markEmailSent, hasEmailSent, getEmailRecipient } from '../utils/emailTracking'
import Navbar from '../components/Navbar'

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select
const { Step } = Steps

// API helper to create run
async function createRunAPI(scriptId) {
  let token = null
  try {
    const storedUser = localStorage.getItem('testpad_user')
    if (storedUser) {
      const userData = JSON.parse(storedUser)
      if (userData.apiToken) token = userData.apiToken
    }
  } catch (e) {}
  if (!token) token = import.meta.env.VITE_TESTPAD_API_TOKEN
  if (!token) throw new Error('API token not found')
  
  const response = await fetch(`/api/v1/scripts/${scriptId}/runs`, {
    method: 'POST',
    headers: {
      'Authorization': `apikey ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API Error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  return data.run || data
}

// Get initials from email
function getInitials(email) {
  if (!email) return '?'
  const parts = email.split('@')[0].split('.')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

function CreateAndAssign({ embedded = false }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  
  // State for project/folder selection
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedFolder, setSelectedFolder] = useState(null)
  
  // State for script selection
  const [selectedScriptIds, setSelectedScriptIds] = useState(new Set())
  const [scriptSearchTerm, setScriptSearchTerm] = useState('')
  
  // State for created runs
  const [createdRuns, setCreatedRuns] = useState([])
  
  // State for assignment
  const [runAssignments, setRunAssignments] = useState({})
  const [pendingAssignments, setPendingAssignments] = useState({})
  const [assigningRunId, setAssigningRunId] = useState(null)
  const [quickAssignTester, setQuickAssignTester] = useState('')
  const [isQuickAssigning, setIsQuickAssigning] = useState(false)
  
  // State for current step
  const [currentStep, setCurrentStep] = useState(0)
  
  // Load projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/v1/projects'),
  })
  const projects = projectsData?.projects || []

  // Auto-select Testpad Api Testing project
  useEffect(() => {
    if (projects.length > 0 && !selectedProject) {
      const testpadApiProject = projects.find(p => p.name.toLowerCase().includes('testpad api testing'))
      if (testpadApiProject) setSelectedProject(testpadApiProject)
    }
  }, [projects, selectedProject])

  // Load folders
  const { data: foldersData, isLoading: foldersLoading } = useQuery({
    queryKey: ['folders', selectedProject?.id],
    queryFn: async () => {
      if (!selectedProject?.id) return { folders: [] }
      return await apiGet(`/api/v1/projects/${selectedProject.id}/folders`)
    },
    enabled: !!selectedProject?.id,
  })

  const folders = useMemo(() => {
    if (!foldersData) return []
    if (Array.isArray(foldersData)) return foldersData
    return foldersData.folders || foldersData.data?.folders || []
  }, [foldersData])

  // Auto-select first folder
  useEffect(() => {
    if (selectedProject && folders.length > 0 && !selectedFolder) {
      setSelectedFolder(folders[0])
    }
  }, [selectedProject, folders, selectedFolder])

  // Collect all scripts with folder info
  const allScripts = useMemo(() => {
    function collectScripts(items, parentFolder = null) {
      const scripts = []
      for (const item of items) {
        if (item.type === 'script') {
          scripts.push({ ...item, folder: parentFolder })
        } else if (item.type === 'folder' && item.contents) {
          scripts.push(...collectScripts(item.contents, item))
        }
      }
      return scripts
    }
    return collectScripts(folders)
  }, [folders])

  // Get the latest release ID (first folder)
  const latestReleaseId = folders.length > 0 ? folders[0].id : null

  // State for release filter - null means "latest" (will be set when folders load)
  const [selectedReleaseFilter, setSelectedReleaseFilter] = useState(null)

  // Auto-select latest release when folders load
  useEffect(() => {
    if (folders.length > 0 && selectedReleaseFilter === null) {
      setSelectedReleaseFilter(folders[0].id)
    }
  }, [folders, selectedReleaseFilter])

  // Filter scripts by selected release
  const scriptsFilteredByRelease = useMemo(() => {
    if (selectedReleaseFilter === 'all') return allScripts
    
    const targetFolderId = selectedReleaseFilter || latestReleaseId
    
    return allScripts.filter(script => script.folder?.id === targetFolderId)
  }, [allScripts, selectedReleaseFilter, latestReleaseId])

  // Fetch run counts for scripts (to show "→ Run #X")
  const { data: scriptRunCounts } = useQuery({
    queryKey: ['scriptRunCounts', selectedProject?.id, selectedReleaseFilter],
    queryFn: async () => {
      if (!selectedProject || scriptsFilteredByRelease.length === 0) return {}
      
      const counts = {}
      const MAX_CONCURRENT = 20
      
      for (let i = 0; i < scriptsFilteredByRelease.length; i += MAX_CONCURRENT) {
        const batch = scriptsFilteredByRelease.slice(i, i + MAX_CONCURRENT)
        const results = await Promise.allSettled(
          batch.map(script => apiGet(`/api/v1/scripts/${script.id}`))
        )
        
        results.forEach((result, idx) => {
          const script = batch[idx]
          if (result.status === 'fulfilled' && result.value) {
            const scriptData = result.value?.script || result.value
            const runsCount = scriptData.runs?.length || 0
            counts[script.id] = runsCount + 1 // Next run number
          } else {
            counts[script.id] = 1
          }
        })
      }
      
      return counts
    },
    enabled: !!selectedProject && scriptsFilteredByRelease.length > 0,
    staleTime: 5 * 60 * 1000,
  })

  // Filter scripts by search (after release filter)
  const filteredScripts = useMemo(() => {
    if (!scriptSearchTerm) return scriptsFilteredByRelease
    const term = scriptSearchTerm.toLowerCase()
    return scriptsFilteredByRelease.filter(script => 
      script.name.toLowerCase().includes(term) || script.id.toString().includes(term)
    )
  }, [scriptsFilteredByRelease, scriptSearchTerm])

  // Selected scripts array
  const selectedScripts = useMemo(() => {
    return allScripts.filter(s => selectedScriptIds.has(s.id))
  }, [allScripts, selectedScriptIds])

  // Get ALL testers from ALL projects (cached globally)
  const { data: allTestersData } = useQuery({
    queryKey: ['allTesters'],
    queryFn: async () => {
      if (projects.length === 0) return []
      const testerSet = new Set()
      
      // Process all projects to extract testers
      for (const project of projects) {
        try {
          const foldersResponse = await apiGet(`/api/v1/projects/${project.id}/folders`)
          const foldersData = foldersResponse?.folders || []
          
          const collectScripts = (items) => {
            const scripts = []
            for (const item of items) {
              if (item.type === 'script') scripts.push(item)
              else if (item.type === 'folder' && item.contents) {
                scripts.push(...collectScripts(item.contents))
              }
            }
            return scripts
          }
          
          const scripts = collectScripts(foldersData) // No limit - get all scripts
          
          const scriptResults = await Promise.allSettled(
            scripts.map(async (script) => {
              const scriptData = await apiGet(`/api/v1/scripts/${script.id}`)
              return scriptData
            })
          )
          
          scriptResults.forEach(result => {
            if (result.status === 'fulfilled' && result.value) {
              const scriptDetails = result.value?.script || result.value
              const runs = scriptDetails?.runs || []
              
              runs.forEach(run => {
                // Extract from headers._tester
                const testerFromHeaders = run.headers?._tester
                if (testerFromHeaders && testerFromHeaders !== 'anyone' && testerFromHeaders !== 'guest' && testerFromHeaders.includes('@')) {
                  testerSet.add(testerFromHeaders)
                }
                // Extract from assignee.email
                const testerFromAssignee = run.assignee?.email
                if (testerFromAssignee && testerFromAssignee.includes('@')) {
                  testerSet.add(testerFromAssignee)
                }
                // Extract from label (format: "number / email / date / status")
                if (run.label) {
                  const parts = run.label.split(' / ')
                  if (parts.length >= 2) {
                    const email = parts[1].trim()
                    if (email.includes('@') && email !== 'anyone' && email !== 'guest') {
                      testerSet.add(email)
                    }
                  }
                }
              })
            }
          })
        } catch (error) {
          console.warn(`Error fetching project ${project.id}:`, error)
        }
      }
      
      return Array.from(testerSet).sort()
    },
    enabled: projects.length > 0,
    staleTime: 30 * 60 * 1000, // Cache for 30 minutes
  })

  // Extract users - combine from allTesters + current assignments
  const users = useMemo(() => {
    const userSet = new Set()
    
    // Add all testers from global cache
    if (allTestersData && Array.isArray(allTestersData)) {
      allTestersData.forEach(email => userSet.add(email))
    }
    
    // Add testers from current assignments
    Object.values(runAssignments).forEach(email => {
      if (email && email.includes('@')) userSet.add(email)
    })
    
    return Array.from(userSet).sort()
  }, [allTestersData, runAssignments])

  // Create runs mutation
  const createRunsMutation = useMutation({
    mutationFn: async (scriptIds) => {
      const runs = []
      const runPromises = scriptIds.map(async (scriptId) => {
        try {
          const run = await createRunAPI(scriptId)
          const script = allScripts.find(s => s.id === scriptId)
          return { 
            ...run, 
            scriptId, 
            scriptName: script?.name || `Script ${scriptId}`,
            projectName: selectedProject?.name || 'Unknown Project',
            folderName: script?.folder?.name || null,
            folderId: script?.folder?.id || null,
            status: 'success' 
          }
        } catch (error) {
          const script = allScripts.find(s => s.id === scriptId)
          return { 
            scriptId, 
            scriptName: script?.name || `Script ${scriptId}`,
            projectName: selectedProject?.name || 'Unknown Project',
            folderName: script?.folder?.name || null,
            folderId: script?.folder?.id || null,
            status: 'error', 
            error: error.message 
          }
        }
      })
      
      const results = await Promise.allSettled(runPromises)
      results.forEach((result) => {
        if (result.status === 'fulfilled') runs.push(result.value)
      })
      
      return runs
    },
    onSuccess: (runs) => {
      setCreatedRuns(runs)
      setCurrentStep(1)
      
      const successCount = runs.filter(r => r.status === 'success').length
      const errorCount = runs.filter(r => r.status === 'error').length
      
      if (successCount > 0) {
        message.success(`${successCount} run(s) created${errorCount > 0 ? `, ${errorCount} failed` : ''}`)
      } else {
        message.error(`Failed to create runs`)
      }
      
      queryClient.invalidateQueries(['allRuns'])
    },
    onError: (error) => {
      message.error(`Error: ${error.message}`)
    }
  })

  // Handlers
  const handleCreateRuns = () => {
    if (selectedScriptIds.size === 0) {
      message.warning('Please select at least one script')
      return
    }
    createRunsMutation.mutate(Array.from(selectedScriptIds))
  }

  const handleAssignAndSend = async (runId, testerEmail, scriptId, scriptName) => {
    if (!testerEmail || !testerEmail.includes('@')) {
      message.error('Invalid email address')
      return
    }

    setAssigningRunId(runId)
    
    try {
      await assignAndSendEmail(scriptId, runId, testerEmail, scriptName)
      // Mark email as sent in localStorage with recipient
      markEmailSent(scriptId, runId, testerEmail)
      setRunAssignments(prev => ({ ...prev, [runId]: testerEmail }))
      setPendingAssignments(prev => { const u = { ...prev }; delete u[runId]; return u })
      setCreatedRuns(prevRuns => 
        prevRuns.map(r => (r.id || r._id) === runId ? { ...r, assignedTo: testerEmail, emailSent: true } : r)
      )
      message.success(`Invitation sent to ${testerEmail}`)
    } catch (error) {
      message.error(`Error: ${error.message}`)
    } finally {
      setAssigningRunId(null)
    }
  }

  const handleQuickAssignAll = async () => {
    if (!quickAssignTester || !quickAssignTester.includes('@')) {
      message.warning('Please select a valid tester')
      return
    }

    const unassignedRuns = createdRuns.filter(r => 
      r.status === 'success' && !runAssignments[r.id || r._id]
    )
    
    if (unassignedRuns.length === 0) {
      message.info('All runs already assigned')
      return
    }

    setIsQuickAssigning(true)
    let successCount = 0

    for (const run of unassignedRuns) {
      const runId = run.id || run._id
      try {
        await assignAndSendEmail(run.scriptId, runId, quickAssignTester, run.scriptName)
        // Mark email as sent in localStorage with recipient
        markEmailSent(run.scriptId, runId, quickAssignTester)
        setRunAssignments(prev => ({ ...prev, [runId]: quickAssignTester }))
        setCreatedRuns(prevRuns => 
          prevRuns.map(r => (r.id || r._id) === runId ? { ...r, assignedTo: quickAssignTester, emailSent: true } : r)
        )
        successCount++
      } catch (error) {}
    }

    setIsQuickAssigning(false)
    setQuickAssignTester('')
    if (successCount > 0) message.success(`${successCount} invitation(s) sent`)
  }

  const toggleScript = (scriptId) => {
    setSelectedScriptIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(scriptId)) {
        newSet.delete(scriptId)
      } else {
        newSet.add(scriptId)
      }
      return newSet
    })
  }

  const selectAllScripts = () => {
    setSelectedScriptIds(new Set(filteredScripts.map(s => s.id)))
  }

  const clearAllScripts = () => {
    setSelectedScriptIds(new Set())
  }

  // Stats
  const assignedCount = createdRuns.filter(r => r.status === 'success' && runAssignments[r.id || r._id]).length
  const totalSuccessRuns = createdRuns.filter(r => r.status === 'success').length

  // Table columns
  const runColumns = [
    {
      title: 'Run #',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id, record) => <Tag color="blue">#{id || record._id || 'N/A'}</Tag>,
    },
    {
      title: 'Test Suite',
      dataIndex: 'scriptName',
      key: 'scriptName',
      render: (name, record) => (
        <div>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>{name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {record.projectName && (
              <Tag style={{
                margin: 0,
                fontSize: 10,
                padding: '0 6px',
                background: '#f0f5ff',
                color: '#2f54eb',
                border: '1px solid #adc6ff'
              }}>
                {record.projectName}
              </Tag>
            )}
            {record.folderName && (
              <Tag style={{
                margin: 0,
                fontSize: 10,
                padding: '0 6px',
                background: record.folderId === latestReleaseId ? '#f6ffed' : '#fff7e6',
                color: record.folderId === latestReleaseId ? '#389e0d' : '#d48806',
                border: `1px solid ${record.folderId === latestReleaseId ? '#b7eb8f' : '#ffe58f'}`
              }}>
                {record.folderId === latestReleaseId ? '✓ ' : ''}{record.folderName}
              </Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 120,
      render: (_, record) => {
        const runId = record.id || record._id
        const isAssigned = runAssignments[runId] || record.assignedTo
        const emailWasSent = record.emailSent || hasEmailSent(record.scriptId, runId)
        const emailRecipient = emailWasSent ? getEmailRecipient(record.scriptId, runId) : null
        
        if (emailWasSent) {
          return (
            <Space direction="vertical" size={0}>
              <Tag color="green" icon={<CheckOutlined />}>Email Sent</Tag>
              {emailRecipient && (
                <Text type="secondary" style={{ fontSize: '10px', display: 'block', marginTop: 2 }}>
                  To: {emailRecipient.split('@')[0]}
                </Text>
              )}
              <Tag color="default" style={{ fontSize: '10px', marginTop: 2 }}>Status: NEW</Tag>
            </Space>
          )
        }
        
        return isAssigned ? (
          <Tag color="green" icon={<CheckOutlined />}>Sent</Tag>
        ) : (
          <Tag color="orange">Pending</Tag>
        )
      },
    },
    {
      title: 'Assign To',
      key: 'assignTo',
      width: 400,
      render: (_, record) => {
        const runId = record.id || record._id
        const currentAssignment = runAssignments[runId] || record.assignedTo
        const pendingSelection = pendingAssignments[runId] || ''
        const isAssigning = assigningRunId === runId

        if (currentAssignment) {
          return (
            <Space>
              <Avatar size="small" style={{ backgroundColor: '#52c41a' }}>
                {getInitials(currentAssignment)}
              </Avatar>
              <Text>{currentAssignment}</Text>
            </Space>
          )
        }

        return (
          <Space.Compact style={{ width: '100%' }}>
            <AutoComplete
              placeholder="Type to search tester..."
              style={{ width: 'calc(100% - 80px)' }}
              value={pendingSelection}
              onChange={(value) => setPendingAssignments(prev => ({ ...prev, [runId]: value }))}
              disabled={isAssigning}
              allowClear
              options={users.map(user => ({
                value: user,
                label: (
                  <Space>
                    <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>{getInitials(user)}</Avatar>
                    {user}
                  </Space>
                )
              }))}
              filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={isAssigning}
              disabled={!pendingSelection || !pendingSelection.includes('@')}
              onClick={() => handleAssignAndSend(runId, pendingSelection, record.scriptId, record.scriptName)}
            >
              Send
            </Button>
          </Space.Compact>
        )
      },
    },
  ]

  const content = (
    <>
      {/* Header */}
      {!embedded && (
        <div style={{ marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>Test Executions</Title>
        </div>
      )}

      {/* Steps */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Steps current={currentStep} size="small">
          <Step title="Select Scripts" description="Choose scripts to test" />
          <Step title="Assign & Send" description="Assign testers" />
        </Steps>
      </Card>

      {/* Step 0: Select Scripts */}
      {currentStep === 0 && (
        <Card 
          title="Step 1: Select Scripts to Create Runs"
          size="small"
        >
          {/* Filters Row - Matching mockup layout */}
          <Row gutter={16} align="middle" style={{ marginBottom: 16 }}>
            <Col>
              <Space>
                <Text strong>Project:</Text>
                <Select
                  placeholder="Select project"
                  style={{ width: 160 }}
                  className={selectedProject ? 'filter-active' : ''}
                  value={selectedProject?.id}
                  onChange={(value) => {
                    const project = projects.find(p => p.id === value)
                    setSelectedProject(project || null)
                    setSelectedFolder(null)
                    setSelectedReleaseFilter(null)
                    setSelectedScriptIds(new Set())
                  }}
                  size="middle"
                >
                  {projects.map(project => (
                    <Option key={project.id} value={project.id}>{project.name}</Option>
                  ))}
                </Select>
              </Space>
            </Col>
            <Col>
              <Space>
                <Text strong>Release:</Text>
                <Select
                  placeholder="Select release"
                  style={{ width: 200 }}
                  className={selectedReleaseFilter && selectedReleaseFilter !== 'all' ? 'filter-active' : ''}
                  value={selectedReleaseFilter}
                  onChange={(value) => {
                    setSelectedReleaseFilter(value)
                    setSelectedScriptIds(new Set())
                  }}
                  loading={foldersLoading}
                  disabled={!selectedProject || foldersLoading}
                  size="middle"
                >
                  <Option value="all">All Releases</Option>
                  {folders.map((folder, index) => (
                    <Option key={folder.id} value={folder.id}>
                      <Space size={4}>
                        {folder.name}
                        {index === 0 && <Tag color="green" style={{ marginLeft: 4, fontSize: 10 }}>Latest</Tag>}
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Space>
            </Col>
          </Row>

          {/* Two Columns - Matching mockup */}
          <Row gutter={16}>
            {/* Left: Available Scripts */}
            <Col span={12}>
              <div style={{ 
                border: '1px solid #d9d9d9', 
                borderRadius: 6,
                overflow: 'hidden'
              }}>
                {/* Header */}
                <div style={{ 
                  padding: '8px 12px', 
                  background: '#fafafa', 
                  borderBottom: '1px solid #d9d9d9',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <Space>
                    <Checkbox 
                      indeterminate={selectedScriptIds.size > 0 && selectedScriptIds.size < filteredScripts.length}
                      checked={selectedScriptIds.size === filteredScripts.length && filteredScripts.length > 0}
                      onChange={(e) => e.target.checked ? selectAllScripts() : clearAllScripts()}
                    />
                    <Text strong>Available Scripts ({filteredScripts.length})</Text>
                    {selectedScriptIds.size > 0 && (
                      <Tag color="blue" style={{ marginLeft: 8 }}>
                        {selectedScriptIds.size} selected
                      </Tag>
                    )}
                  </Space>
                  <Button type="link" size="small" onClick={selectAllScripts}>Select All</Button>
                </div>
                
                {/* Search - Prominent */}
                <div style={{ 
                  padding: '14px', 
                  background: 'linear-gradient(135deg, #f0f7ff 0%, #e6f4ff 100%)',
                  borderBottom: '1px solid #91d5ff'
                }}>
                  <Input
                    placeholder="🔍 Search test suites..."
                    prefix={<SearchOutlined style={{ color: '#1890ff', fontSize: 16 }} />}
                    value={scriptSearchTerm}
                    onChange={(e) => setScriptSearchTerm(e.target.value)}
                    allowClear
                    size="large"
                    style={{ 
                      border: '2px solid #91d5ff',
                      borderRadius: 8,
                      fontSize: 15
                    }}
                  />
                  {scriptSearchTerm && (
                    <div style={{ marginTop: 10, fontSize: 13, color: '#1890ff' }}>
                      Showing <strong>{filteredScripts.length}</strong> of {scriptsFilteredByRelease.length} scripts matching "{scriptSearchTerm}"
                    </div>
                  )}
                </div>

                {/* List */}
                <div style={{ height: 320, overflowY: 'auto' }}>
                  {filteredScripts.length === 0 ? (
                    <Empty description="No scripts" style={{ marginTop: 40 }} />
                  ) : (
                    filteredScripts.map(script => {
                      const isSelected = selectedScriptIds.has(script.id)
                      const isLatestRelease = script.folder?.id === latestReleaseId
                      const nextRunNumber = scriptRunCounts?.[script.id] || 1
                      
                      return (
                        <div
                          key={script.id}
                          onClick={() => toggleScript(script.id)}
                          style={{
                            padding: '10px 12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f5f5f5',
                            backgroundColor: isSelected ? '#e6f7ff' : '#fff',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#fafafa' }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#fff' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                            <Checkbox checked={isSelected} style={{ marginRight: 10, marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                              {/* First line: Name + Release tag + Next Run */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <Text strong style={{ fontSize: 14 }}>{script.name}</Text>
                                {isLatestRelease ? (
                                  <Tag style={{
                                    margin: 0,
                                    fontSize: 10,
                                    padding: '0 6px',
                                    background: '#f6ffed',
                                    color: '#389e0d',
                                    border: '1px solid #b7eb8f'
                                  }}>
                                    ✓ {script.folder?.name || 'Latest'}
                                  </Tag>
                                ) : (
                                  <Tag style={{
                                    margin: 0,
                                    fontSize: 10,
                                    padding: '0 6px',
                                    background: '#fff7e6',
                                    color: '#d48806',
                                    border: '1px solid #ffe58f'
                                  }}>
                                    {script.folder?.name || 'Unknown'}
                                  </Tag>
                                )}
                                <Text style={{ color: '#1890ff', fontWeight: 500, fontSize: 11 }}>
                                  Will create Run #{nextRunNumber}
                                </Text>
                              </div>
                              {/* Second line: Project (subtle) */}
                              <div style={{ fontSize: 11, color: '#999' }}>
                                {selectedProject?.name || 'Unknown Project'}
                              </div>
                            </div>
                            <Text type="secondary" style={{ fontSize: 10 }}>ID: {script.id}</Text>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </Col>

            {/* Right: Selected Scripts */}
            <Col span={12}>
              <div style={{ 
                border: '1px solid #b7eb8f', 
                borderRadius: 6,
                overflow: 'hidden',
                backgroundColor: selectedScripts.length > 0 ? '#f6ffed' : '#fff'
              }}>
                {/* Header */}
                <div style={{ 
                  padding: '8px 12px', 
                  background: selectedScripts.length > 0 ? '#d9f7be' : '#fafafa', 
                  borderBottom: '1px solid #b7eb8f',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <Space>
                    <CheckOutlined style={{ color: '#52c41a' }} />
                    <Text strong>Selected Scripts ({selectedScripts.length})</Text>
                  </Space>
                  {selectedScripts.length > 0 && (
                    <Button type="link" size="small" danger onClick={clearAllScripts}>Clear All</Button>
                  )}
                </div>

                {/* List */}
                <div style={{ height: 280, overflowY: 'auto', backgroundColor: '#fff' }}>
                  {selectedScripts.length === 0 ? (
                    <Empty description="Click scripts on the left to add" style={{ marginTop: 40 }} />
                  ) : (
                    selectedScripts.map(script => {
                      const isLatestRelease = script.folder?.id === latestReleaseId
                      const nextRunNumber = scriptRunCounts?.[script.id] || 1
                      
                      return (
                        <div
                          key={script.id}
                          style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid #f0f0f0',
                            borderLeft: '3px solid #52c41a'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                            <CheckOutlined style={{ color: '#52c41a', marginRight: 10, marginTop: 4 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                <Text strong>{script.name}</Text>
                                {isLatestRelease ? (
                                  <Tag style={{
                                    margin: 0,
                                    fontSize: 10,
                                    padding: '0 6px',
                                    background: '#f6ffed',
                                    color: '#389e0d',
                                    border: '1px solid #b7eb8f'
                                  }}>
                                    ✓ {script.folder?.name}
                                  </Tag>
                                ) : (
                                  <Tag style={{
                                    margin: 0,
                                    fontSize: 10,
                                    padding: '0 6px',
                                    background: '#fff7e6',
                                    color: '#d48806',
                                    border: '1px solid #ffe58f'
                                  }}>
                                    {script.folder?.name}
                                  </Tag>
                                )}
                                <Text style={{ color: '#1890ff', fontWeight: 500, fontSize: 11 }}>
                                  Will create Run #{nextRunNumber}
                                </Text>
                              </div>
                              <div style={{ fontSize: 11, color: '#999' }}>
                                {selectedProject?.name}
                              </div>
                            </div>
                            <Tooltip title="Remove">
                              <CloseOutlined 
                                style={{ color: '#ff4d4f', cursor: 'pointer', marginTop: 4 }}
                                onClick={() => toggleScript(script.id)}
                              />
                            </Tooltip>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Summary */}
                <div style={{ 
                  padding: '12px', 
                  background: '#e6f7ff', 
                  borderTop: '1px solid #91d5ff'
                }}>
                  <Text strong>{selectedScripts.length} scripts selected</Text>
                  <br />
                  <Text type="secondary">{selectedScripts.length} run(s) will be created</Text>
                </div>

                {/* Create Button */}
                <div style={{ padding: '12px' }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={handleCreateRuns}
                    loading={createRunsMutation.isLoading}
                    disabled={selectedScripts.length === 0}
                    block
                    size="large"
                  >
                    Create {selectedScripts.length} Run(s)
                  </Button>
                </div>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      {/* Step 1: Assign & Send */}
      {currentStep === 1 && (
        <Card 
          title={
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Step 2: Assign Testers & Send Invitations</span>
              <Space>
                <Tag color={assignedCount === totalSuccessRuns ? 'green' : 'orange'}>
                  {assignedCount} / {totalSuccessRuns} assigned
                </Tag>
                <Button 
                  size="small"
                  onClick={() => {
                    setCurrentStep(0)
                    setCreatedRuns([])
                    setSelectedScriptIds(new Set())
                    setRunAssignments({})
                    setPendingAssignments({})
                  }}
                >
                  Create More Runs
                </Button>
              </Space>
            </div>
          }
          size="small"
        >
          {/* Quick Assign */}
          <Alert
            type="info"
            style={{ marginBottom: 16 }}
            message={
              <Space>
                <Text strong>Quick Assign:</Text>
                <Text>Assign all unassigned runs to the same tester</Text>
              </Space>
            }
            description={
              <Space style={{ marginTop: 8 }}>
                <AutoComplete
                  placeholder="Search tester..."
                  style={{ width: 300 }}
                  value={quickAssignTester}
                  onChange={setQuickAssignTester}
                  options={users.map(user => ({
                    value: user,
                    label: (
                      <Space>
                        <Avatar size="small" style={{ backgroundColor: '#1890ff' }}>{getInitials(user)}</Avatar>
                        {user}
                      </Space>
                    )
                  }))}
                  filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}
                />
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  onClick={handleQuickAssignAll}
                  loading={isQuickAssigning}
                  disabled={!quickAssignTester || !quickAssignTester.includes('@') || assignedCount === totalSuccessRuns}
                >
                  Assign All & Send ({totalSuccessRuns - assignedCount})
                </Button>
              </Space>
            }
          />

          <Divider orientation="left" plain>Or assign individually</Divider>

          <Table
            columns={runColumns}
            dataSource={createdRuns.filter(r => r.status === 'success')}
            rowKey={(record) => record.id || record._id || record.scriptId}
            pagination={false}
            size="small"
          />

          {assignedCount === totalSuccessRuns && totalSuccessRuns > 0 && (
            <Alert
              type="success"
              showIcon
              style={{ marginTop: 16 }}
              message="All runs have been assigned!"
              description="All invitations have been sent."
            />
          )}
        </Card>
      )}
    </>
  )

  if (embedded) return content

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5' }}>
      <Navbar />
      <Content style={{ padding: '16px 24px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
        {content}
      </Content>
    </Layout>
  )
}

export default CreateAndAssign