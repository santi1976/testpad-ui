import React, { useState, useMemo, useCallback, useEffect } from 'react'
import { 
  Layout, Typography, Card, Button, Select, Space, Tag, Avatar, 
  Spin, Alert, message, Empty, Row, Col, Checkbox, Tooltip, Divider
} from 'antd'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { 
  MailOutlined, WarningOutlined, CheckCircleOutlined, 
  ClockCircleOutlined, SendOutlined, InfoCircleOutlined
} from '@ant-design/icons'
import { apiGet } from '../utils/api'
import { assignAndSendEmail } from '../api/assignAndSendEmail'
import { markEmailSent, hasEmailSent, getEmailRecipient } from '../utils/emailTracking'

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select

// Get initials from email
function getInitials(email) {
  if (!email) return '?'
  const parts = email.split('@')[0].split('.')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

// Determine run state from API data
function getRunState(run) {
  // Use state from API if available
  if (run.state) return run.state
  
  // Fallback: calculate from progress
  if (run.progress) {
    const { pass = 0, fail = 0, block = 0, total = 0 } = run.progress
    const completed = pass + fail + block
    if (total > 0 && completed === total) return 'completed'
    if (completed > 0) return 'started'
  }
  return 'new'
}

function AssignmentsAndEmail({ embedded = false }) {
  const queryClient = useQueryClient()
  
  // Filters
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedTestSuiteId, setSelectedTestSuiteId] = useState('all')
  const [stateFilter, setStateFilter] = useState('new') // Default to 'new' (ready to assign)
  
  // Batch assignment state
  const [selectedRunIds, setSelectedRunIds] = useState(new Set())
  const [runAssignments, setRunAssignments] = useState({}) // runId -> email
  const [bulkTester, setBulkTester] = useState(null)
  
  // Loading states
  const [sendingEmails, setSendingEmails] = useState(false)
  const [sendingRunIds, setSendingRunIds] = useState(new Set())

  // Load projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/v1/projects'),
  })

  const projects = projectsData?.projects || []

  // Auto-select Testpad Api Testing project
  useEffect(() => {
    if (projects.length > 0 && selectedProject === null) {
      const testpadApiProject = projects.find(p => 
        p.name.toLowerCase().includes('testpad api testing')
      )
      if (testpadApiProject) {
        setSelectedProject(testpadApiProject)
      }
    }
  }, [projects])

  // Fetch all runs
  const fetchAllRuns = useCallback(async () => {
    if (projects.length === 0) return []
    
    const projectsToFetch = selectedProject ? [selectedProject] : projects
    const allRuns = []
    
    const MAX_CONCURRENT_SCRIPTS = 15
    const MAX_SCRIPTS_PER_PROJECT = Infinity

    for (const project of projectsToFetch) {
      try {
        const foldersResponse = await apiGet(`/api/v1/projects/${project.id}/folders`)
        const folders = foldersResponse?.folders || []

        const getAllScripts = (items) => {
          const scripts = []
          for (const item of items) {
            if (item.type === 'script') {
              scripts.push(item)
            } else if (item.type === 'folder' && item.contents) {
              scripts.push(...getAllScripts(item.contents))
            }
          }
          return scripts
        }

        const scripts = getAllScripts(folders).slice(0, MAX_SCRIPTS_PER_PROJECT)
        
        // Process scripts in batches
        for (let i = 0; i < scripts.length; i += MAX_CONCURRENT_SCRIPTS) {
          const batch = scripts.slice(i, i + MAX_CONCURRENT_SCRIPTS)
          const results = await Promise.allSettled(
            batch.map(async (script) => {
              const scriptData = await apiGet(`/api/v1/scripts/${script.id}`)
              return { script, scriptData }
            })
          )
          
          results.forEach((result) => {
            if (result.status === 'fulfilled' && result.value) {
              const { script, scriptData } = result.value
              const scriptDetails = scriptData?.script || scriptData
              
              if (scriptDetails.runs && Array.isArray(scriptDetails.runs)) {
                scriptDetails.runs.forEach(run => {
                  const state = getRunState(run)
                  
                  // Get tester info
                  let testerEmail = null
                  const testerFromHeaders = run.headers?._tester
                  const testerFromAssignee = run.assignee?.email
                  
                  if (testerFromHeaders && testerFromHeaders !== 'anyone' && testerFromHeaders !== 'guest') {
                    testerEmail = testerFromHeaders
                  } else if (testerFromAssignee && testerFromAssignee.includes('@')) {
                    testerEmail = testerFromAssignee
                  }
                  
                  // Create unique ID by combining scriptId and run.id
                  // This ensures runs with the same number in different test suites are treated separately
                  const uniqueId = `${script.id}-${run.id}`
                  
                  allRuns.push({
                    id: uniqueId,
                    runId: run.id, // Keep original run.id for API calls
                    runNumber: run.headers?._run || run.id,
                    state,
                    tester: testerEmail,
                    scriptId: script.id,
                    scriptName: script.name,
                    projectId: project.id,
                    projectName: project.name,
                    created: run.created || run.headers?._createdDate,
                    progress: run.progress
                  })
                })
              }
            }
          })
        }
      } catch (error) {
        console.error(`Error fetching project ${project.id}:`, error)
      }
    }
    
    // Sort by run number descending (newest first)
    return allRuns.sort((a, b) => (b.runNumber || 0) - (a.runNumber || 0))
  }, [projects, selectedProject])

  const { data: runsData, isLoading, error, refetch } = useQuery({
    queryKey: ['allRunsForAssignment', selectedProject?.id],
    queryFn: fetchAllRuns,
    enabled: projects.length > 0 && !!selectedProject,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })

  const allRuns = runsData || []

  // Get unique test suites
  const testSuites = useMemo(() => {
    const suiteMap = new Map()
    allRuns.forEach(run => {
      if (!suiteMap.has(run.scriptId)) {
        suiteMap.set(run.scriptId, {
          id: run.scriptId,
          name: run.scriptName
        })
      }
    })
    return Array.from(suiteMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allRuns])

  // Get unique testers
  const allTesters = useMemo(() => {
    const testerSet = new Set()
    allRuns.forEach(run => {
      if (run.tester && run.tester.includes('@')) {
        testerSet.add(run.tester)
      }
    })
    // Add testers from current assignments
    Object.values(runAssignments).forEach(email => {
      if (email && email.includes('@')) testerSet.add(email)
    })
    return Array.from(testerSet).sort()
  }, [allRuns, runAssignments])

  // Filter and sort runs
  const filteredRuns = useMemo(() => {
    const filtered = allRuns.filter(run => {
      // Filter by test suite
      if (selectedTestSuiteId !== 'all' && run.scriptId !== selectedTestSuiteId) {
        return false
      }
      // Filter by state
      if (stateFilter !== 'all' && run.state !== stateFilter) {
        return false
      }
      return true
    })
    
    // Sort by Test Suite name (alphabetically), then by Run Number (descending)
    return filtered.sort((a, b) => {
      // First sort by Test Suite name
      const suiteCompare = a.scriptName.localeCompare(b.scriptName)
      if (suiteCompare !== 0) return suiteCompare
      // If same Test Suite, sort by Run Number (descending - newest first)
      return (b.runNumber || 0) - (a.runNumber || 0)
    })
  }, [allRuns, selectedTestSuiteId, stateFilter])

  // Stats
  const stats = useMemo(() => {
    const total = allRuns.length
    const newRuns = allRuns.filter(r => r.state === 'new').length
    const started = allRuns.filter(r => r.state === 'started').length
    const completed = allRuns.filter(r => r.state === 'completed').length
    const assigned = allRuns.filter(r => r.tester).length
    const unassigned = allRuns.filter(r => !r.tester).length
    return { total, newRuns, started, completed, assigned, unassigned }
  }, [allRuns])

  // Handlers
  const toggleRunSelection = (runId) => {
    setSelectedRunIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(runId)) {
        newSet.delete(runId)
      } else {
        newSet.add(runId)
      }
      return newSet
    })
  }

  const selectAllNew = () => {
    const newRunIds = filteredRuns
      .filter(r => r.state === 'new')
      .map(r => r.id)
    setSelectedRunIds(new Set(newRunIds))
  }

  const clearSelection = () => {
    setSelectedRunIds(new Set())
  }

  const applyBulkTester = () => {
    if (!bulkTester) {
      message.warning('Please select a tester first')
      return
    }
    const newAssignments = { ...runAssignments }
    selectedRunIds.forEach(runId => {
      const run = allRuns.find(r => r.id === runId)
      if (run && run.state === 'new') {
        newAssignments[runId] = bulkTester
      }
    })
    setRunAssignments(newAssignments)
    message.success(`Applied ${bulkTester.split('@')[0]} to ${selectedRunIds.size} runs`)
  }

  const setRunTester = (runId, email) => {
    setRunAssignments(prev => ({
      ...prev,
      [runId]: email
    }))
  }

  const handleSendEmails = async () => {
    // Get runs that are selected AND have a tester assigned
    const runsToSend = filteredRuns.filter(run => 
      selectedRunIds.has(run.id) && 
      run.state === 'new' &&
      runAssignments[run.id]
    )

    if (runsToSend.length === 0) {
      message.warning('No runs ready to send. Select runs and assign testers.')
      return
    }

    setSendingEmails(true)
    let successCount = 0
    let errorCount = 0

    for (const run of runsToSend) {
      const testerEmail = runAssignments[run.id]
      setSendingRunIds(prev => new Set([...prev, run.id]))
      
      try {
        await assignAndSendEmail(run.scriptId, run.runId, testerEmail, run.scriptName)
        // Mark email as sent in localStorage with recipient
        markEmailSent(run.scriptId, run.runId, testerEmail)
        successCount++
        // Remove from selection after success
        setSelectedRunIds(prev => {
          const newSet = new Set(prev)
          newSet.delete(run.id)
          return newSet
        })
        // Clear assignment
        setRunAssignments(prev => {
          const newAssignments = { ...prev }
          delete newAssignments[run.id]
          return newAssignments
        })
      } catch (error) {
        errorCount++
        console.error(`Failed to send email for run ${run.id}:`, error)
      }
      
      setSendingRunIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(run.id)
        return newSet
      })
    }

    setSendingEmails(false)
    
    if (successCount > 0) {
      message.success(`Successfully sent ${successCount} email(s)`)
    }
    if (errorCount > 0) {
      message.error(`Failed to send ${errorCount} email(s)`)
    }

    // Refetch data
    refetch()
  }

  // Count ready to send
  const readyToSendCount = filteredRuns.filter(run => 
    selectedRunIds.has(run.id) && 
    run.state === 'new' &&
    runAssignments[run.id]
  ).length

  const selectedNewCount = filteredRuns.filter(run => 
    selectedRunIds.has(run.id) && run.state === 'new'
  ).length

  // Render loading state
  if (isLoading && allRuns.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>Loading runs...</div>
      </div>
    )
  }

  return (
    <div>
      {/* Stats Row */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card size="small">
            <StatBox title="Total Runs" value={stats.total} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <StatBox title="Assigned" value={stats.assigned} color="#52c41a" />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <StatBox title="Unassigned" value={stats.unassigned} color="#ff4d4f" />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <StatBox title="New" value={stats.newRuns} color="#faad14" />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <StatBox title="Started" value={stats.started} color="#1890ff" />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <StatBox title="Completed" value={stats.completed} color="#52c41a" />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card size="small" style={{ marginBottom: 24 }}>
        <Space size="large" wrap>
          <Space>
            <Text strong>Project:</Text>
            <Select
              style={{ width: 180 }}
              value={selectedProject?.id}
              onChange={(value) => {
                const project = projects.find(p => p.id === value)
                setSelectedProject(project || null)
                setSelectedRunIds(new Set())
                setRunAssignments({})
              }}
            >
              {projects.map(p => (
                <Option key={p.id} value={p.id}>{p.name}</Option>
              ))}
            </Select>
          </Space>
          
          <Space>
            <Text strong>Test Suite:</Text>
            <Select
              style={{ width: 200 }}
              value={selectedTestSuiteId}
              onChange={setSelectedTestSuiteId}
              showSearch
              filterOption={(input, option) =>
                option.children.toLowerCase().includes(input.toLowerCase())
              }
            >
              <Option value="all">All Test Suites</Option>
              {testSuites.map(ts => (
                <Option key={ts.id} value={ts.id}>{ts.name}</Option>
              ))}
            </Select>
          </Space>
          
          <Space>
            <Text strong>State:</Text>
            <Select
              style={{ width: 180 }}
              value={stateFilter}
              onChange={setStateFilter}
            >
              <Option value="new">🟡 New (ready to assign)</Option>
              <Option value="all">All States</Option>
              <Option value="started">🔵 Started</Option>
              <Option value="completed">🟢 Completed</Option>
            </Select>
          </Space>
        </Space>
      </Card>

      {/* Batch Assignment Section */}
      <Card 
        style={{ 
          marginBottom: 24, 
          background: '#f0f7ff', 
          border: '1px solid #91d5ff' 
        }}
      >
        <div style={{ marginBottom: 16 }}>
          <Space>
            <MailOutlined style={{ fontSize: 18, color: '#1890ff' }} />
            <Text strong style={{ fontSize: 16, color: '#1890ff' }}>Batch Assignment</Text>
            <Text type="secondary">— Assign multiple runs at once</Text>
          </Space>
        </div>

        {/* Select All + Apply to Selected */}
        <div style={{ 
          background: '#fff', 
          padding: '12px 16px', 
          borderRadius: 6, 
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap'
        }}>
          <Checkbox
            checked={selectedNewCount > 0 && selectedNewCount === filteredRuns.filter(r => r.state === 'new').length}
            indeterminate={selectedNewCount > 0 && selectedNewCount < filteredRuns.filter(r => r.state === 'new').length}
            onChange={(e) => e.target.checked ? selectAllNew() : clearSelection()}
          >
            Select All New ({filteredRuns.filter(r => r.state === 'new').length})
          </Checkbox>
          
          <Divider type="vertical" style={{ height: 24 }} />
          
          <Text type="secondary">Apply to selected:</Text>
          <Select
            style={{ width: 220 }}
            placeholder="Choose tester..."
            value={bulkTester}
            onChange={setBulkTester}
            allowClear
            showSearch
            filterOption={(input, option) =>
              option.children.toLowerCase().includes(input.toLowerCase())
            }
          >
            {allTesters.map(t => (
              <Option key={t} value={t}>{t}</Option>
            ))}
          </Select>
          <Button 
            type="primary" 
            ghost 
            onClick={applyBulkTester}
            disabled={!bulkTester || selectedRunIds.size === 0}
          >
            Apply to Selected
          </Button>
        </div>

        {/* Runs Table */}
        <div style={{ background: '#fff', borderRadius: 6, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '40px 80px 1fr 100px 250px',
            padding: '12px 16px',
            borderBottom: '2px solid #e8e8e8',
            fontWeight: 600,
            color: '#333'
          }}>
            <div></div>
            <div>Run #</div>
            <div>Test Suite</div>
            <div>State</div>
            <div>Assign To</div>
          </div>

          {/* Rows */}
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredRuns.length === 0 ? (
              <Empty description="No runs found" style={{ padding: 40 }} />
            ) : (
              filteredRuns.map(run => {
                const isNew = run.state === 'new'
                const isSelected = selectedRunIds.has(run.id)
                const assignedTester = runAssignments[run.id] || ''
                const isSending = sendingRunIds.has(run.id)

                return (
                  <div 
                    key={run.id}
                    style={{ 
                      display: 'grid', 
                      gridTemplateColumns: '40px 80px 1fr 100px 250px',
                      padding: '12px 16px',
                      borderBottom: '1px solid #f0f0f0',
                      alignItems: 'center',
                      opacity: isNew ? 1 : 0.6,
                      background: isNew ? (isSelected ? '#f0f7ff' : '#fff') : '#f9f9f9'
                    }}
                  >
                    <div>
                      {isNew ? (
                        <Checkbox 
                          checked={isSelected}
                          onChange={() => toggleRunSelection(run.id)}
                        />
                      ) : (
                        <Tooltip title={run.state === 'started' ? 'Already started - cannot reassign' : 'Already completed'}>
                          <Checkbox disabled />
                        </Tooltip>
                      )}
                    </div>
                    <div>
                      <Text strong style={{ color: '#1890ff' }}>#{run.runNumber}</Text>
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{run.scriptName}</div>
                      <div style={{ fontSize: 12, color: '#888' }}>{run.projectName}</div>
                    </div>
                    <div>
                      {(() => {
                        const emailWasSent = hasEmailSent(run.scriptId, run.runId)
                        const emailRecipient = emailWasSent ? getEmailRecipient(run.scriptId, run.runId) : null
                        
                        if (run.state === 'new') {
                          return emailWasSent ? (
                            <Space direction="vertical" size={0}>
                              <Tag color="green" icon={<CheckCircleOutlined />}>Email Sent</Tag>
                              {emailRecipient && (
                                <Text type="secondary" style={{ fontSize: '10px', display: 'block', marginTop: 2 }}>
                                  To: {emailRecipient.split('@')[0]}
                                </Text>
                              )}
                              <Tag color="orange" style={{ fontSize: '10px', marginTop: 2 }}>Status: NEW</Tag>
                            </Space>
                          ) : (
                            <Tag color="orange">New</Tag>
                          )
                        }
                        if (run.state === 'started') {
                          return (
                            <Tag color="blue" icon={<ClockCircleOutlined />}>Started</Tag>
                          )
                        }
                        if (run.state === 'completed') {
                          return (
                            <Tag color="green" icon={<CheckCircleOutlined />}>Completed</Tag>
                          )
                        }
                        return null
                      })()}
                    </div>
                    <div>
                      {isNew ? (
                        (() => {
                          const emailWasSent = hasEmailSent(run.scriptId, run.runId)
                          const emailRecipient = emailWasSent ? getEmailRecipient(run.scriptId, run.runId) : null
                          // If email was sent, show the recipient as the default value (but allow changing it)
                          const defaultValue = assignedTester || emailRecipient || undefined
                          
                          return (
                            <Select
                              style={{ width: '100%' }}
                              placeholder="Select tester..."
                              value={defaultValue}
                              onChange={(value) => setRunTester(run.id, value)}
                              allowClear
                              showSearch
                              filterOption={(input, option) =>
                                option.children.toLowerCase().includes(input.toLowerCase())
                              }
                              loading={isSending}
                              disabled={isSending}
                            >
                              {allTesters.map(t => (
                                <Option key={t} value={t}>{t}</Option>
                              ))}
                            </Select>
                          )
                        })()
                      ) : (
                        <Tooltip title={run.state === 'started' ? 'Already started' : 'Already completed'}>
                          <Select
                            style={{ width: '100%' }}
                            value={run.tester || undefined}
                            placeholder="—"
                            disabled
                          >
                            {run.tester && <Option value={run.tester}>{run.tester}</Option>}
                          </Select>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginTop: 20,
          paddingTop: 20,
          borderTop: '1px solid #d9d9d9'
        }}>
          <div>
            <Text type="secondary">
              <strong style={{ color: '#1890ff' }}>{selectedNewCount}</strong> runs selected, 
              <strong style={{ color: '#52c41a', marginLeft: 4 }}>{readyToSendCount}</strong> ready to send (have tester assigned)
            </Text>
          </div>
          <Button 
            type="primary"
            size="large"
            icon={<SendOutlined />}
            onClick={handleSendEmails}
            loading={sendingEmails}
            disabled={readyToSendCount === 0}
            style={{ 
              background: '#52c41a', 
              borderColor: '#52c41a',
              height: 44,
              paddingLeft: 24,
              paddingRight: 24,
              fontWeight: 600
            }}
          >
            Assign & Send Email ({readyToSendCount})
          </Button>
        </div>
      </Card>

      {/* Warning Note */}
      <Alert
        type="warning"
        icon={<WarningOutlined />}
        showIcon
        message="Important Note"
        description={
          <Text type="secondary">
            This app does not sync with Testpad's native assignment system. 
            Runs marked as "New" may have already been assigned through Testpad directly. 
            The "New" state only indicates that testing has not started yet.
          </Text>
        }
      />
    </div>
  )
}

// Simple stat box component
function StatBox({ title, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 600, color: color || '#333' }}>{value}</div>
      <div style={{ color: '#888', fontSize: 13 }}>{title}</div>
    </div>
  )
}

export default AssignmentsAndEmail