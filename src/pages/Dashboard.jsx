import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layout, Typography, Card, Tag, Spin, Alert, Progress, Avatar, Select, Space, Row, Col, Empty, Badge, Divider, List, Button } from 'antd'
import { useQuery } from '@tanstack/react-query'
import { UserOutlined, CheckCircleOutlined, CloseCircleOutlined, PauseCircleOutlined, ClockCircleOutlined, WarningOutlined, ArrowLeftOutlined, AppstoreOutlined, BarsOutlined, DownOutlined, UpOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons'
import Navbar from '../components/Navbar'
import { apiGet } from '../utils/api'

const { Content, Sider } = Layout
const { Title, Text } = Typography
const { Option } = Select

// Format elapsed time
function formatElapsedTime(created) {
  if (!created) return 'N/A'
  try {
    const start = new Date(created)
    const now = new Date()
    const diff = Math.floor((now - start) / 1000) // difference in seconds
    
    const hours = Math.floor(diff / 3600)
    const minutes = Math.floor((diff % 3600) / 60)
    const seconds = diff % 60
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    } else {
      return `${seconds}s`
    }
  } catch {
    return 'N/A'
  }
}

// Get initials from email for avatar
function getInitials(email) {
  if (!email) return '?'
  const parts = email.split('@')[0].split('.')
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return email.substring(0, 2).toUpperCase()
}

function Dashboard() {
  const navigate = useNavigate()
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedUser, setSelectedUser] = useState('all') // Default to 'all' instead of null
  const [selectedState, setSelectedState] = useState('all')
  const [selectedTestSuite, setSelectedTestSuite] = useState(null)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [selectedRun, setSelectedRun] = useState(null)
  // Track which run is selected for each script (scriptId -> runId)
  const [selectedRunByScript, setSelectedRunByScript] = useState({})
  // Track if user has manually selected a project (to prevent auto-select from overriding)
  const [hasManuallySelectedProject, setHasManuallySelectedProject] = useState(false)
  // Track if critical alerts banner was closed by user (don't show again until page reload)
  const [isCriticalAlertsClosed, setIsCriticalAlertsClosed] = useState(false)
  // View mode: 'grid' (vertical cards) or 'horizontal' (horizontal cards)
  const [viewMode, setViewMode] = useState('grid')
  // Track which scripts are expanded in horizontal view (scriptId -> boolean)
  const [expandedScripts, setExpandedScripts] = useState({})
  // Progressive loading: store runs as they load
  const [progressiveRuns, setProgressiveRuns] = useState([])
  const [isLoadingProgressive, setIsLoadingProgressive] = useState(false)
  const [error, setError] = useState(null)
  
  // Cache key for localStorage
  const getCacheKey = () => {
    const projectId = selectedProject?.id || 'all'
    return `dashboard_runs_${projectId}`
  }

  // Load projects
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiGet('/api/v1/projects'),
  })

  const projects = projectsData?.projects || []

  // Auto-select Bitfinex project by default (only once on initial load)
  useEffect(() => {
    if (projects.length > 0 && !selectedProject && !hasManuallySelectedProject) {
      const bitfinexProject = projects.find(p => 
        p.name.toLowerCase().includes('bitfinex')
      )
      if (bitfinexProject) {
        setSelectedProject(bitfinexProject)
      }
    }
  }, [projects.length]) // Only depend on projects.length, not the full object

  // Helper function to calculate progress from results if progress is not available
  const calculateProgressFromResults = (results, tests) => {
    if (!results || !tests) return null
    const total = tests.length
    let pass = 0
    let fail = 0
    let block = 0
    
    // Count results by status
    Object.values(results).forEach(result => {
      if (result === 'pass' || result === 'passed') pass++
      else if (result === 'fail' || result === 'failed') fail++
      else if (result === 'block' || result === 'blocked') block++
    })
    
    return {
      total,
      pass,
      fail,
      block,
      query: 0
    }
  }

  // Function to get all runs from all projects with progressive loading
  const fetchAllActiveRuns = async (onProgress) => {
    if (projects.length === 0) return []
    
    // If a project is selected, only fetch runs from that project
    const projectsToFetch = selectedProject ? [selectedProject] : projects

    const allRuns = []
    const maxScriptsPerProject = Infinity // No limit - show all scripts
    const maxConcurrentScripts = 100 // Process 100 scripts in parallel for maximum speed
    const maxConcurrentProjects = 10 // Process 10 projects in parallel for maximum speed
    
    // Reset progressive state
    if (onProgress) {
      onProgress([])
    }

    // Process projects in parallel batches for much faster loading
    const processProject = async (project) => {
      try {
        // Get project folders - wait until response (no hardcoded timeout)
        const foldersData = await apiGet(`/api/v1/projects/${project.id}/folders`)
        const folders = foldersData?.folders || []

        // Find all scripts in folders
        function collectAllScripts(items) {
          const scripts = []
          for (const item of items) {
            if (item.type === 'script') {
              scripts.push(item)
            } else if (item.type === 'folder' && item.contents) {
              scripts.push(...collectAllScripts(item.contents))
            }
          }
          return scripts
        }

        const allScripts = collectAllScripts(folders)
        // Limitar scripts para evitar demasiadas llamadas
        const scripts = allScripts.slice(0, maxScriptsPerProject)

        // Function to find parent folder of a script (handles nested folders)
        function findParentFolder(items, targetScriptId, currentFolder = null) {
          for (const item of items) {
            if (item.type === 'script' && item.id === targetScriptId) {
              return currentFolder
            }
            if (item.type === 'folder') {
              // Si este folder tiene contents, buscar recursivamente
              if (item.contents) {
                const found = findParentFolder(item.contents, targetScriptId, item)
                if (found !== null && found !== undefined) {
                  return found
                }
              }
            }
          }
          return null
        }

        // Process ALL scripts in parallel for maximum speed (no batching)
        const scriptPromises = scripts.map(async (script) => {
          try {
            const scriptData = await apiGet(`/api/v1/scripts/${script.id}`)
            return { script, scriptData }
          } catch (error) {
            return null
          }
        })
        
        const scriptResults = await Promise.allSettled(scriptPromises)
        const validScripts = scriptResults
          .filter(result => result.status === 'fulfilled' && result.value !== null)
          .map(result => result.value)

        // Process all scripts results
        const projectRuns = []
        for (const { script, scriptData } of validScripts) {
          try {
            const scriptDetails = scriptData?.script || scriptData

            if (scriptDetails.runs && Array.isArray(scriptDetails.runs) && scriptDetails.runs.length > 0) {
              // Find parent folder of this script
              const parentFolder = findParentFolder(folders, script.id)

              // Add each run with project, folder and script information
              scriptDetails.runs.forEach(run => {
                // Parse user information from label or headers
                let userInfo = null
                
                // Try to get from headers first (more reliable)
                const testerEmail = run.headers?._tester || run.headers?.tester
                
                // Check if this is a guest run - multiple ways to detect:
                // 1. headers._tester === 'guest'
                // 2. assignee.id === '_guest' (Testpad's internal guest identifier)
                // 3. assignee.id === '0' (numeric guest identifier)
                const isGuestByTester = testerEmail && (testerEmail.toLowerCase() === 'guest')
                const isGuestByAssignee = run.assignee?.id === '_guest' || run.assignee?.id === '0' || run.assignee?.name === 'guest'
                const isGuestRun = isGuestByTester || isGuestByAssignee
                
                if (isGuestRun) {
                  // The API returns the guest email in assignee.email
                  // Try to find email in assignee first (most reliable)
                  let guestEmail = null
                  
                  // Check assignee.email first (this is where Testpad stores the guest email)
                  if (run.assignee?.email && run.assignee.email.includes('@')) {
                    guestEmail = run.assignee.email
                  } else if (run.fielddata && Array.isArray(run.fielddata) && run.fielddata[1]?.raw) {
                    guestEmail = run.fielddata[1].raw
                  } else if (run.fields && run.fields["1"]) {
                    guestEmail = run.fields["1"]
                  } else if (run.data?.fielddata && Array.isArray(run.data.fielddata) && run.data.fielddata[1]?.raw) {
                    guestEmail = run.data.fielddata[1].raw
                  } else if (run.data?.fields && run.data.fields["1"]) {
                    guestEmail = run.data.fields["1"]
                  } else if (run.emailSentTo) {
                    guestEmail = run.emailSentTo
                  } else if (run.data?.emailSentTo) {
                    guestEmail = run.data.emailSentTo
                  } else if (run.label) {
                    // Parse label to see if it has an email
                    const parts = run.label.split(' / ')
                    if (parts.length >= 2 && parts[1] && parts[1].includes('@')) {
                      guestEmail = parts[1]
                    }
                  }
                  
                  if (guestEmail && guestEmail.includes('@')) {
                    userInfo = {
                      email: guestEmail,
                      date: run.headers?._createdDate || null,
                      runNumber: run.headers?._run || run.id || null,
                      isGuest: true
                    }
                  } else {
                    // Show "guest" instead of "Unknown" when we know it's a guest but can't find the email
                    userInfo = {
                      email: 'guest',
                      date: run.headers?._createdDate || null,
                      runNumber: run.headers?._run || run.id || null,
                      isGuest: true
                    }
                  }
                } else if (testerEmail && testerEmail !== 'anyone') {
                  // Regular user assignment
                  userInfo = {
                    email: testerEmail,
                    date: run.headers?._createdDate || null,
                    runNumber: run.headers?._run || run.id || null,
                    isGuest: false
                  }
                } else if (run.label) {
                  // Fallback to label parsing
                  const parts = run.label.split(' / ')
                  if (parts.length >= 2 && parts[1] && parts[1] !== 'anyone' && parts[1].toLowerCase() !== 'guest') {
                    userInfo = {
                      email: parts[1],
                      date: parts[2] || null,
                      runNumber: parts[0] || null,
                      isGuest: false
                    }
                  }
                }

                // Include all runs - use run-specific progress, not script progress
                projectRuns.push({
                  ...run,
                  id: run.id || run.headers?._run || `run-${Math.random()}`,
                  project: {
                    id: project.id,
                    name: project.name
                  },
                  folder: parentFolder ? {
                    id: parentFolder.id,
                    name: parentFolder.name
                  } : null,
                  script: {
                    id: scriptDetails.id,
                    name: scriptDetails.name
                  },
                  userInfo: userInfo,
                  // Use run.progress first (run-specific), fallback to run.results if available
                  progress: run.progress || (run.results ? calculateProgressFromResults(run.results, scriptDetails.tests) : null),
                  tests: scriptDetails.tests || [], // Include tests to show in side panel
                  // Use state from API if available, otherwise will be determined later based on percentage
                  state: run.state || null, // API should provide state, if not we'll determine it from percentage
                  created: run.created || run.headers?._createdDate || new Date().toISOString()
                })
              })
            }
          } catch (error) {
            // Silently skip failed scripts
          }
        }
        return projectRuns
      } catch (error) {
        // Return empty array for this project on error
        return []
      }
    }

    // Process projects in smaller batches to show progress more frequently
    try {
      const batchSize = 3 // Process 3 projects at a time for better progress updates
      for (let i = 0; i < projectsToFetch.length; i += batchSize) {
        const projectBatch = projectsToFetch.slice(i, i + batchSize)
        const projectResults = await Promise.allSettled(
          projectBatch.map(project => processProject(project))
        )
        
        // Collect runs from this batch and emit progress immediately
        projectResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.length > 0) {
            allRuns.push(...result.value)
          }
        })
        
        // Emit progress after each batch completes
        if (onProgress && allRuns.length > 0) {
          onProgress([...allRuns])
        }
      }
    } catch (error) {
      // Silently handle errors
    }

    return allRuns
  }

  // Progressive loading: fetch runs and update state as they arrive
  useEffect(() => {
    let cancelled = false
    
    const loadRuns = async () => {
      // Wait for projects to load
      if (projects.length === 0) {
        return
      }
      
      // Wait for auto-select to happen (Bitfinex project)
      const hasBitfinex = projects.some(p => p.name.toLowerCase().includes('bitfinex'))
      if (hasBitfinex && !selectedProject && !hasManuallySelectedProject) {
        return
      }
      
      setIsLoadingProgressive(true)
      
      try {
        // Check cache first
        const cacheKey = getCacheKey()
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached)
            const cacheAge = Date.now() - timestamp
            const maxAge = 5 * 60 * 1000 // 5 minutes
            
            if (cacheAge < maxAge && data.length > 0) {
              // Use cached data immediately
              if (!cancelled) {
                setProgressiveRuns(data)
                setIsLoadingProgressive(false)
                setError(null)
              }
              return // Skip API calls
            }
          } catch (e) {
            // Invalid cache, continue to fetch
          }
        }
        
        const projectsToFetch = selectedProject ? [selectedProject] : projects
        const allRuns = []
        const maxScriptsPerProject = Infinity // No limit - show all scripts
        const batchSize = 15 // Process 15 scripts at a time
        
        const processProject = async (project) => {
          try {
            const foldersData = await apiGet(`/api/v1/projects/${project.id}/folders`)
            const folders = foldersData?.folders || []
            
            function collectAllScripts(items) {
              const scripts = []
              for (const item of items) {
                if (item.type === 'script') {
                  scripts.push(item)
                } else if (item.type === 'folder' && item.contents) {
                  scripts.push(...collectAllScripts(item.contents))
                }
              }
              return scripts
            }
            
            const allScripts = collectAllScripts(folders)
            const scripts = allScripts.slice(0, maxScriptsPerProject)
            
            function findParentFolder(items, targetScriptId, currentFolder = null) {
              for (const item of items) {
                if (item.type === 'script' && item.id === targetScriptId) {
                  return currentFolder
                }
                if (item.type === 'folder' && item.contents) {
                  const found = findParentFolder(item.contents, targetScriptId, item)
                  if (found !== null && found !== undefined) {
                    return found
                  }
                }
              }
              return null
            }
            
            const scriptPromises = scripts.map(async (script) => {
              try {
                const scriptData = await apiGet(`/api/v1/scripts/${script.id}`)
                return { script, scriptData }
              } catch (error) {
                return null
              }
            })
            
            const scriptResults = await Promise.allSettled(scriptPromises)
            const validScripts = scriptResults
              .filter(result => result.status === 'fulfilled' && result.value !== null)
              .map(result => result.value)
            
            const projectRuns = []
            for (const { script, scriptData } of validScripts) {
              try {
                const scriptDetails = scriptData?.script || scriptData
                if (scriptDetails.runs && Array.isArray(scriptDetails.runs) && scriptDetails.runs.length > 0) {
                  const parentFolder = findParentFolder(folders, script.id)
                  scriptDetails.runs.forEach(run => {
                    let userInfo = null
                    const testerEmail = run.headers?._tester || run.headers?.tester
                    const isGuestByTester = testerEmail && (testerEmail.toLowerCase() === 'guest')
                    const isGuestByAssignee = run.assignee?.id === '_guest' || run.assignee?.id === '0' || run.assignee?.name === 'guest'
                    const isGuestRun = isGuestByTester || isGuestByAssignee
                    
                    if (isGuestRun) {
                      let guestEmail = null
                      if (run.assignee?.email && run.assignee.email.includes('@')) {
                        guestEmail = run.assignee.email
                      } else if (run.fielddata && Array.isArray(run.fielddata) && run.fielddata[1]?.raw) {
                        guestEmail = run.fielddata[1].raw
                      } else if (run.fields && run.fields["1"]) {
                        guestEmail = run.fields["1"]
                      } else if (run.data?.fielddata && Array.isArray(run.data.fielddata) && run.data.fielddata[1]?.raw) {
                        guestEmail = run.data.fielddata[1].raw
                      } else if (run.data?.fields && run.data.fields["1"]) {
                        guestEmail = run.data.fields["1"]
                      } else if (run.emailSentTo) {
                        guestEmail = run.emailSentTo
                      } else if (run.data?.emailSentTo) {
                        guestEmail = run.data.emailSentTo
                      } else if (run.label) {
                        const parts = run.label.split(' / ')
                        if (parts.length >= 2 && parts[1] && parts[1].includes('@')) {
                          guestEmail = parts[1]
                        }
                      }
                      
                      if (guestEmail && guestEmail.includes('@')) {
                        userInfo = {
                          email: guestEmail,
                          date: run.headers?._createdDate || null,
                          runNumber: run.headers?._run || run.id || null,
                          isGuest: true
                        }
                      } else {
                        userInfo = {
                          email: 'guest',
                          date: run.headers?._createdDate || null,
                          runNumber: run.headers?._run || run.id || null,
                          isGuest: true
                        }
                      }
                    } else if (testerEmail && testerEmail !== 'anyone') {
                      userInfo = {
                        email: testerEmail,
                        date: run.headers?._createdDate || null,
                        runNumber: run.headers?._run || run.id || null,
                        isGuest: false
                      }
                    } else if (run.label) {
                      const parts = run.label.split(' / ')
                      if (parts.length >= 2 && parts[1] && parts[1] !== 'anyone' && parts[1].toLowerCase() !== 'guest') {
                        userInfo = {
                          email: parts[1],
                          date: parts[2] || null,
                          runNumber: parts[0] || null,
                          isGuest: false
                        }
                      }
                    }
                    
                    projectRuns.push({
                      ...run,
                      id: run.id || run.headers?._run || `run-${Math.random()}`,
                      project: { id: project.id, name: project.name },
                      folder: parentFolder ? { id: parentFolder.id, name: parentFolder.name } : null,
                      script: { id: scriptDetails.id, name: scriptDetails.name },
                      userInfo: userInfo,
                      progress: run.progress || (run.results ? calculateProgressFromResults(run.results, scriptDetails.tests) : null),
                      tests: scriptDetails.tests || [],
                      state: run.state || null,
                      created: run.created || run.headers?._createdDate || new Date().toISOString()
                    })
                  })
                }
              } catch (error) {
                // Silently skip failed scripts
              }
            }
            return projectRuns
          } catch (error) {
            return []
          }
        }
        
        // Process projects in batches
        for (let i = 0; i < projectsToFetch.length; i += batchSize) {
          if (cancelled) break
          
          const projectBatch = projectsToFetch.slice(i, i + batchSize)
          const projectResults = await Promise.allSettled(
            projectBatch.map(project => processProject(project))
          )
          
          projectResults.forEach((result) => {
            if (result.status === 'fulfilled' && result.value.length > 0) {
              allRuns.push(...result.value)
            }
          })
          
          if (!cancelled && allRuns.length > 0) {
            setProgressiveRuns([...allRuns])
            
            // Update cache progressively
            const cacheKey = getCacheKey()
            localStorage.setItem(cacheKey, JSON.stringify({
              data: allRuns,
              timestamp: Date.now()
            }))
          }
        }
        
        if (!cancelled) {
          setProgressiveRuns(allRuns)
          setIsLoadingProgressive(false)
          setError(null)
          
          // Save final result to cache
          const cacheKey = getCacheKey()
          localStorage.setItem(cacheKey, JSON.stringify({
            data: allRuns,
            timestamp: Date.now()
          }))
        }
      } catch (err) {
        if (!cancelled) {
          setIsLoadingProgressive(false)
          setError(err)
        }
      }
    }
    
    loadRuns()
    
    return () => {
      cancelled = true
    }
  }, [projects.length, selectedProject?.id, hasManuallySelectedProject])

  // Use progressive runs for display
  const allRuns = progressiveRuns
  const isLoading = isLoadingProgressive && progressiveRuns.length === 0

  // Filter runs
  const filteredRuns = allRuns.filter(run => {
    // Filtro por proyecto - normalizar IDs a números para comparación
    if (selectedProject) {
      const selectedId = Number(selectedProject.id)
      const runProjectId = Number(run.project.id)
      
      if (isNaN(selectedId) || isNaN(runProjectId) || selectedId !== runProjectId) {
        return false
      }
    }
    
    // Filter by user (skip if 'all')
    if (selectedUser && selectedUser !== 'all' && run.userInfo?.email !== selectedUser) {
      return false
    }
    
    // Filter by test suite (script)
    if (selectedTestSuite && selectedTestSuite !== 'all' && run.script?.id !== selectedTestSuite) {
      return false
    }
    
    // Filter by folder (release/version)
    if (selectedFolder && selectedFolder !== 'all') {
      if (selectedFolder === 'archived') {
        // For now, archived filter doesn't filter anything (will be implemented later)
        // This is a placeholder for future functionality
      } else if (run.folder?.id !== selectedFolder) {
        return false
      }
    }
    
    // Filter by status
    if (selectedState !== 'all') {
      if (selectedState === 'active' && run.state !== 'started') return false
      if (selectedState === 'completed' && run.state !== 'completed') return false
      if (selectedState === 'blocked' && (!run.progress || run.progress.block === 0)) return false
    }
    
    return true
  })

  // Get unique users list (sorted alphabetically)
  const users = [...new Set(allRuns.map(run => run.userInfo?.email).filter(Boolean))].sort((a, b) => a.localeCompare(b))

  // Get unique test suites (scripts) list
  const testSuites = useMemo(() => {
    const suites = new Map()
    allRuns.forEach(run => {
      if (run.script?.id && run.script?.name) {
        suites.set(run.script.id, {
          id: run.script.id,
          name: run.script.name
        })
      }
    })
    return Array.from(suites.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allRuns])

  // Get unique folders list (for filtering by release/version)
  const folders = useMemo(() => {
    const folderMap = new Map()
    allRuns.forEach(run => {
      if (run.folder?.id && run.folder?.name) {
        folderMap.set(run.folder.id, {
          id: run.folder.id,
          name: run.folder.name
        })
      }
    })
    return Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [allRuns])

  // Group runs by script (script.id)
  const runsByScript = useMemo(() => {
    const grouped = {}
    filteredRuns.forEach(run => {
      const scriptId = run.script?.id
      if (!scriptId) return
      
      // If email is still 'guest', try to find it one more time
      if (selectedTestSuite && run.userInfo?.isGuest && (run.userInfo?.email === 'guest' || !run.userInfo?.email || run.userInfo.email === run.id)) {
        let guestEmail = null
        
        // Check assignee.email first (this is where Testpad stores the guest email)
        if (run.assignee?.email && run.assignee.email.includes('@')) {
          guestEmail = run.assignee.email
        } else if (run.fielddata && Array.isArray(run.fielddata) && run.fielddata[1]?.raw) {
          guestEmail = run.fielddata[1].raw
        } else if (run.fields && run.fields["1"]) {
          guestEmail = run.fields["1"]
        } else if (run.data?.fielddata && Array.isArray(run.data.fielddata) && run.data.fielddata[1]?.raw) {
          guestEmail = run.data.fielddata[1].raw
        } else if (run.data?.fields && run.data.fields["1"]) {
          guestEmail = run.data.fields["1"]
        } else if (run.emailSentTo) {
          guestEmail = run.emailSentTo
        } else if (run.data?.emailSentTo) {
          guestEmail = run.data.emailSentTo
        }
        
        if (guestEmail && guestEmail.includes('@')) {
          run.userInfo.email = guestEmail
        }
      }
      
      if (!grouped[scriptId]) {
        grouped[scriptId] = {
          script: run.script,
          project: run.project,
          folder: run.folder,
          runs: []
        }
      }
      
      grouped[scriptId].runs.push(run)
    })
    
    // Sort runs within each script group (first/lowest run number first)
    Object.keys(grouped).forEach(scriptId => {
      grouped[scriptId].runs.sort((a, b) => {
        // Sort by run number first (lower number = first run, ascending)
        const aRunNum = parseInt(a.userInfo?.runNumber || a.id || 0)
        const bRunNum = parseInt(b.userInfo?.runNumber || b.id || 0)
        if (aRunNum !== bRunNum) {
          return aRunNum - bRunNum // Ascending: run 1 < run 7 (run 1 first)
        }
        
        // If run numbers are equal, sort by created date (older first)
        const aDate = new Date(a.created || 0)
        const bDate = new Date(b.created || 0)
        return aDate - bDate // Ascending: older date first
      })
    })
    
    return grouped
  }, [filteredRuns, selectedTestSuite])

  // Get the selected run for each script (default to first/lowest run number)
  const getSelectedRunForScript = (scriptId, runs) => {
    if (!runs || runs.length === 0) return null
    const selectedRunId = selectedRunByScript[scriptId]
    if (selectedRunId) {
      const run = runs.find(r => r.id === selectedRunId || r.userInfo?.runNumber === selectedRunId.toString())
      if (run) return run
    }
    // Default to first run (lowest run number, e.g., Run #1)
    return runs[0]
  }

  // Calculate global statistics (based on selected runs, one per script)
  const stats = useMemo(() => {
    const selectedRuns = Object.values(runsByScript)
      .map(group => getSelectedRunForScript(group.script.id, group.runs))
      .filter(Boolean)
    
    return {
      total: selectedRuns.length,
      active: selectedRuns.filter(r => r.state === 'started').length,
      completed: selectedRuns.filter(r => r.state === 'completed').length,
      withFailures: selectedRuns.filter(r => r.progress && r.progress.fail > 0).length,
      withBlocks: selectedRuns.filter(r => r.progress && r.progress.block > 0).length,
    }
  }, [runsByScript, selectedRunByScript])

  // Determine state color
  const getStateColor = (run) => {
    if (run.state === 'completed') return 'success'
    if (run.progress && run.progress.fail > 0) return 'error'
    if (run.progress && run.progress.block > 0) return 'warning'
    if (run.state === 'started') return 'processing'
    return 'default'
  }

  // Determine state icon
  const getStateIcon = (run) => {
    if (run.state === 'completed') return <CheckCircleOutlined />
    if (run.progress && run.progress.fail > 0) return <CloseCircleOutlined />
    if (run.progress && run.progress.block > 0) return <PauseCircleOutlined />
    if (run.state === 'started') return <ClockCircleOutlined />
    return null
  }

  // Get runs with critical alerts
  const criticalRuns = filteredRuns.filter(run => 
    (run.progress && run.progress.fail > 0) || 
    (run.progress && run.progress.block > 0)
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Navbar />
      <Content style={{ padding: '24px', background: '#f5f5f5' }}>
        <div style={{ maxWidth: 1800, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ 
            marginBottom: 24, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 16,
            flexWrap: 'wrap'
          }}>
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => navigate('/')}
              type="default"
              size="middle"
            >
              Back to Projects
            </Button>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 16,
              flex: 1,
              minWidth: 0
            }}>
              <Title level={1} style={{ margin: 0, fontWeight: 700, fontSize: 28 }}>Test Runs Dashboard</Title>
              <Button 
                type="primary"
                onClick={() => navigate('/test-executions')}
                size="large"
                style={{ 
                  height: 'auto',
                  paddingTop: 8,
                  paddingBottom: 8
                }}
              >
                Manage Runs
              </Button>
            </div>
          </div>

          {/* Panel Superior: Métricas Globales */}
          <Card style={{ marginBottom: 24 }}>
            <Row gutter={16}>
              <Col span={6}>
                <div style={{ textAlign: 'center' }}>
                  <Title level={3} style={{ margin: 0, color: '#1890ff' }}>{stats.total}</Title>
                  <Text type="secondary">Total Runs</Text>
                </div>
              </Col>
              <Col span={6}>
                <div style={{ textAlign: 'center' }}>
                  <Title level={3} style={{ margin: 0, color: '#52c41a' }}>{stats.active}</Title>
                  <Text type="secondary">Active</Text>
                </div>
              </Col>
              <Col span={6}>
                <div style={{ textAlign: 'center' }}>
                  <Title level={3} style={{ margin: 0, color: '#faad14' }}>{stats.withBlocks}</Title>
                  <Text type="secondary">With Blocks</Text>
                </div>
              </Col>
              <Col span={6}>
                <div style={{ textAlign: 'center' }}>
                  <Title level={3} style={{ margin: 0, color: '#ff4d4f' }}>{stats.withFailures}</Title>
                  <Text type="secondary">With Failures</Text>
                </div>
              </Col>
            </Row>
          </Card>

          {/* Alertas críticas */}
          {criticalRuns.length > 0 && !isCriticalAlertsClosed && (
            <Alert
              message={`${criticalRuns.length} run(s) with critical issues`}
              description={
                <Space wrap>
                  {criticalRuns.slice(0, 3).map((run, index) => {
                    const uniqueKey = `${run.project?.id || 'p'}-${run.script?.id || 's'}-${run.id || index}`
                    const displayName = run.userInfo?.isGuest && run.userInfo?.email && run.userInfo.email !== 'guest' && run.userInfo.email.includes('@')
                      ? `Guest (${run.userInfo.email.split('@')[0]})`
                      : run.userInfo?.email?.split('@')[0] || 'Unknown'
                    return (
                      <Text key={uniqueKey} style={{ fontSize: '12px' }}>
                        {displayName} - {run.script.name}
                      </Text>
                    )
                  })}
                  {criticalRuns.length > 3 && <Text style={{ fontSize: '12px' }}>and {criticalRuns.length - 3} more...</Text>}
                </Space>
              }
              type="warning"
              icon={<WarningOutlined />}
              showIcon
              closable
              onClose={() => setIsCriticalAlertsClosed(true)}
              style={{ marginBottom: 24 }}
            />
          )}

          {/* Quick Filter: With Issues */}
          <Card style={{ marginBottom: 16 }}>
            <Space size="middle">
              <Button
                size="small"
                type={selectedState === 'blocked' ? 'primary' : 'default'}
                onClick={() => {
                  setSelectedState(selectedState === 'blocked' ? 'all' : 'blocked')
                }}
              >
                Only with Issues
              </Button>
            </Space>
          </Card>

          {/* Filtros */}
          <Card style={{ marginBottom: 24 }}>
            <Space size="large" wrap style={{ width: '100%' }}>
              <div>
                <Text strong style={{ marginRight: 8 }}>Project:</Text>
                <Select
                  placeholder="All projects"
                  style={{ width: 200 }}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.children?.toLowerCase() || '').includes(input.toLowerCase())
                  }
                  value={selectedProject?.id || 'all'}
                  onChange={(value) => {
                    setHasManuallySelectedProject(true) // Mark that user has manually selected
                    if (value === 'all' || !value) {
                      setSelectedProject(null)
                    } else {
                      const project = projects.find(p => Number(p.id) === Number(value))
                      setSelectedProject(project || null)
                    }
                  }}
                >
                  <Option value="all">All projects</Option>
                  {projects.map(project => (
                    <Option key={project.id} value={project.id}>
                      {project.name}
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text strong style={{ marginRight: 8 }}>User:</Text>
                <Select
                  style={{ width: 200 }}
                  value={selectedUser}
                  onChange={setSelectedUser}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.children?.toLowerCase() || '').includes(input.toLowerCase())
                  }
                  placeholder="All users"
                >
                  <Option value="all">All users</Option>
                  {users.map(user => (
                    <Option key={user} value={user}>
                      {user}
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text strong style={{ marginRight: 8 }}>Test Suite:</Text>
                <Select
                  placeholder="All test suites"
                  style={{ width: 200 }}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.children?.toLowerCase() || '').includes(input.toLowerCase())
                  }
                  value={selectedTestSuite || 'all'}
                  onChange={(value) => {
                    if (value === 'all' || !value) {
                      setSelectedTestSuite(null)
                    } else {
                      setSelectedTestSuite(value)
                    }
                  }}
                >
                  <Option value="all">All test suites</Option>
                  {testSuites.map(suite => (
                    <Option key={suite.id} value={suite.id}>
                      {suite.name}
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text strong style={{ marginRight: 8 }}>Folder/Release:</Text>
                <Select
                  placeholder="All folders"
                  style={{ width: 200 }}
                  showSearch
                  filterOption={(input, option) =>
                    (option?.children?.toLowerCase() || '').includes(input.toLowerCase())
                  }
                  value={selectedFolder || 'all'}
                  onChange={(value) => {
                    if (value === 'all' || !value) {
                      setSelectedFolder(null)
                    } else {
                      setSelectedFolder(value)
                    }
                  }}
                >
                  <Option value="all">All folders</Option>
                  <Option value="archived">Archived</Option>
                  {folders.map(folder => (
                    <Option key={folder.id} value={folder.id}>
                      {folder.name}
                    </Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text strong style={{ marginRight: 8 }}>Status:</Text>
                <Select
                  style={{ width: 150 }}
                  value={selectedState}
                  onChange={setSelectedState}
                >
                  <Option value="all">All</Option>
                  <Option value="active">Active</Option>
                  <Option value="completed">Completed</Option>
                  <Option value="blocked">With Blocks</Option>
                </Select>
              </div>
              <div>
                <Button 
                  size="small" 
                  onClick={() => {
                    setSelectedProject(null)
                    setSelectedUser('all')
                    setSelectedState('all')
                    setSelectedTestSuite(null)
                    setSelectedFolder(null)
                    setHasManuallySelectedProject(false) // Reset manual selection flag
                  }}
                >
                  Reset Filters
                </Button>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
                <AppstoreOutlined 
                  style={{ 
                    color: viewMode === 'grid' ? '#1890ff' : '#8c8c8c',
                    fontSize: '18px',
                    cursor: 'pointer',
                    transition: 'color 0.2s'
                  }}
                  onClick={() => setViewMode('grid')}
                />
                <BarsOutlined 
                  style={{ 
                    color: viewMode === 'horizontal' ? '#1890ff' : '#8c8c8c',
                    fontSize: '18px',
                    cursor: 'pointer',
                    transition: 'color 0.2s'
                  }}
                  onClick={() => setViewMode('horizontal')}
                />
              </div>
            </Space>
          </Card>

          {/* Main Layout: Central cards + Side panel */}
          <Layout>
            <Content style={{ marginRight: 16 }}>
              {/* Loading indicator (only show if no runs loaded yet) */}
              {isLoading && progressiveRuns.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  <Spin size="large" />
                  <div style={{ marginTop: 16 }}>Loading runs from all projects...</div>
                </div>
              )}
              
              {/* Show loading indicator at bottom if still loading more */}
              {isLoadingProgressive && progressiveRuns.length > 0 && (
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <Spin size="small" />
                  <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: 8 }}>
                    Loading more runs... ({progressiveRuns.length} loaded so far)
                  </Text>
                </div>
              )}

              {/* Error */}
              {error && (
                <Alert
                  message="Error loading runs"
                  description={
                    <div>
                      <Text>{error?.message || 'An error occurred'}</Text>
                      <br />
                      <Button 
                        type="link" 
                        size="small" 
                        onClick={() => {
                          setError(null)
                          setProgressiveRuns([])
                          setIsLoadingProgressive(true)
                          // Trigger reload by resetting and setting project
                          const currentProject = selectedProject
                          setSelectedProject(null)
                          setTimeout(() => setSelectedProject(currentProject), 10)
                        }}
                        style={{ padding: 0, marginTop: 8 }}
                      >
                        Retry
                      </Button>
                    </div>
                  }
                  type="error"
                  style={{ marginBottom: 24 }}
                  showIcon
                />
              )}

              {/* Results count and info */}
              {!isLoading && !error && filteredRuns.length > 0 && (
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: '14px' }}>
                    Showing <Text strong style={{ color: '#1890ff' }}>{filteredRuns.length}</Text> run{filteredRuns.length !== 1 ? 's' : ''}
                    {allRuns.length !== filteredRuns.length && (
                      <span> of {allRuns.length} total</span>
                    )}
                  </Text>
                </div>
              )}

              {/* Cards de ejecuciones - show progressively as they load */}
              {(!isLoading || progressiveRuns.length > 0) && !error && (
                <>
                  {filteredRuns.length === 0 ? (
                    <Empty 
                      description={
                        <div>
                          <Text strong style={{ display: 'block', marginBottom: 8, fontSize: '16px' }}>
                            {allRuns.length === 0 
                              ? "No runs found in the system"
                              : "No runs match the selected filters"}
                          </Text>
                          {allRuns.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginBottom: 8 }}>
                                There are {allRuns.length} run{allRuns.length !== 1 ? 's' : ''} available, but none match your current filter combination.
                              </Text>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                  • Try removing some filters to see more results
                                </Text>
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                  • Or <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => {
                                    setSelectedProject(null)
                                    setSelectedUser('all')
                                    setSelectedState('all')
                                    setSelectedTestSuite(null)
                                    setSelectedFolder(null)
                                    setHasManuallySelectedProject(false)
                                  }}>reset all filters</Button> to see all runs
                                </Text>
                              </div>
                            </div>
                          )}
                          {allRuns.length === 0 && (
                            <Text type="secondary" style={{ fontSize: '13px', display: 'block', marginTop: 8 }}>
                              Create some test runs to get started.
                            </Text>
                          )}
                        </div>
                      }
                    />
                  ) : viewMode === 'horizontal' ? (
                    // Horizontal view: wide cards with expandable runs
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {Object.values(runsByScript).map((scriptGroup) => {
                        const scriptId = scriptGroup.script.id
                        const runs = scriptGroup.runs
                        const isExpanded = expandedScripts[scriptId] || false
                        
                        // Calculate aggregated totals for all runs
                        let totalPass = 0
                        let totalFail = 0
                        let totalBlock = 0
                        let totalTests = 0
                        
                        runs.forEach(r => {
                          const p = r.progress || {}
                          totalPass += p.pass || 0
                          totalFail += p.fail || 0
                          totalBlock += p.block || 0
                          totalTests += p.total || 0
                        })
                        
                        const totalPercentage = totalTests > 0 ? Math.round((totalPass / totalTests) * 100) : 0
                        const firstRun = runs[0]
                        if (!firstRun) return null
                        
                        return (
                          <Card
                            key={`${firstRun.project?.id || 'p'}-${scriptId}`}
                            style={{
                              width: '100%',
                              border: selectedRun?.script?.id === scriptId ? '2px solid #1890ff' : '1px solid #d9d9d9',
                            }}
                          >
                            {/* Header: Test Suite name with expand/collapse */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Button
                                  type="text"
                                  icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
                                  onClick={() => {
                                    setExpandedScripts(prev => ({
                                      ...prev,
                                      [scriptId]: !prev[scriptId]
                                    }))
                                  }}
                                  style={{ padding: 0, width: 24, height: 24 }}
                                />
                                <Text 
                                  strong 
                                  style={{ fontSize: '16px', cursor: 'pointer' }}
                                  onClick={() => {
                                    navigate(`/test-suite/${scriptId}`, {
                                      state: {
                                        project: firstRun.project,
                                        folder: null
                                      }
                                    })
                                  }}
                                >
                                  {firstRun.script.name}
                                </Text>
                              </div>
                              <Tag color={totalFail > 0 ? 'red' : totalBlock > 0 ? 'orange' : 'green'}>
                                {totalPass}/{totalTests} {totalPercentage}%
                              </Tag>
                            </div>
                            
                            {/* Summary bar: Pass, Fail, Blocked, Query */}
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#52c41a' }} />
                                  <Text>Pass {totalPass}</Text>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff4d4f' }} />
                                  <Text>Fail {totalFail}</Text>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#faad14' }} />
                                  <Text>Blocked {totalBlock}</Text>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#722ed1' }} />
                                  <Text>Query 0</Text>
                                </div>
                              </div>
                              <Progress
                                percent={totalPercentage}
                                strokeColor={{
                                  '0%': '#108ee9',
                                  '100%': '#87d068',
                                }}
                                showInfo={false}
                                style={{ height: 8 }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                  {totalPass}/{totalTests} {totalPercentage}%
                                </Text>
                              </div>
                            </div>
                            
                            {/* Expanded runs list */}
                            {isExpanded && (
                              <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
                                {runs.map((run) => {
                                  const progress = run.progress || {}
                                  const runTotal = progress.total || 0
                                  const runPass = progress.pass || 0
                                  const runFail = progress.fail || 0
                                  const runBlock = progress.block || 0
                                  const runPercentage = runTotal > 0 ? Math.round((runPass / runTotal) * 100) : 0
                                  
                                  let runState = run.state
                                  if (!runState) {
                                    if (runPercentage === 100) {
                                      runState = 'completed'
                                    } else if (runPercentage > 0) {
                                      runState = 'started'
                                    } else {
                                      runState = 'new'
                                    }
                                  }
                                  
                                  const formatDate = (dateStr) => {
                                    if (!dateStr) return 'N/A'
                                    try {
                                      const date = new Date(dateStr)
                                      return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                                    } catch {
                                      return 'N/A'
                                    }
                                  }
                                  
                                  return (
                                    <div
                                      key={run.id || run.userInfo?.runNumber}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 16,
                                        padding: '12px 0',
                                        borderBottom: '1px solid #f0f0f0',
                                        cursor: 'pointer',
                                      }}
                                      onClick={() => setSelectedRun(run)}
                                    >
                                      <div style={{ width: 40, textAlign: 'center' }}>
                                        <Text strong>{run.userInfo?.runNumber || run.id}</Text>
                                      </div>
                                      <div style={{ flex: 1 }}>
                                        <Text strong style={{ display: 'block', marginBottom: 4 }}>
                                          {run.userInfo?.isGuest && run.userInfo?.email && run.userInfo.email !== 'guest' && run.userInfo.email.includes('@')
                                            ? `Guest (${run.userInfo.email.split('@')[0]})`
                                            : run.userInfo?.email?.split('@')[0] || 'Unknown'}
                                        </Text>
                                        <Text type="secondary" style={{ fontSize: '12px' }}>
                                          {formatDate(run.created)}
                                        </Text>
                                      </div>
                                      <div style={{ flex: 2 }}>
                                        <Progress
                                          percent={runPercentage}
                                          strokeColor={{
                                            '0%': '#108ee9',
                                            '100%': '#87d068',
                                          }}
                                          showInfo={false}
                                          style={{ height: 6 }}
                                        />
                                      </div>
                                      <div style={{ display: 'flex', gap: 16, minWidth: 200 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#52c41a' }} />
                                          <Text>{runPass}</Text>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f' }} />
                                          <Text>{runFail}</Text>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#faad14' }} />
                                          <Text>{runBlock}</Text>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#722ed1' }} />
                                          <Text>0</Text>
                                        </div>
                                      </div>
                                      <div style={{ minWidth: 80, textAlign: 'right' }}>
                                        <Text>{runPass}/{runTotal} {runPercentage}%</Text>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </Card>
                        )
                      })}
                    </div>
                  ) : (
                    // Grid view: original vertical cards
                    <Row gutter={[16, 16]}>
                      {Object.values(runsByScript).map((scriptGroup) => {
                        const scriptId = scriptGroup.script.id
                        const runs = scriptGroup.runs
                        const run = getSelectedRunForScript(scriptId, runs)
                        
                        if (!run) return null
                        
                        const progress = run.progress || {}
                        const total = progress.total || 0
                        const passed = progress.pass || 0
                        const failed = progress.fail || 0
                        const blocked = progress.block || 0
                        
                        // Calculate percentage (don't modify this number - it comes from the data)
                        // - If run is new/empty, show 0%
                        // - Otherwise, calculate based on passed/total
                        let percentage = 0
                        if (total > 0) {
                          percentage = Math.round((passed / total) * 100)
                        } else {
                          percentage = 0
                        }
                        
                        // Use state from API if available, otherwise determine it based on percentage
                        // - 100% → 'completed'
                        // - > 0% but < 100% → 'started'
                        // - 0% → 'new'
                        let runState = run.state
                        if (!runState) {
                          // Only determine state from percentage if API didn't provide it
                          if (percentage === 100) {
                            runState = 'completed'
                          } else if (percentage > 0) {
                            runState = 'started'
                          } else {
                            runState = 'new'
                          }
                          // Update the run's state for display
                          run.state = runState
                        }
                        // If API provided state, use it as-is (don't override)
                        // Check if this script's card is selected (compare by scriptId, not run.id)
                        const isSelected = selectedRun?.script?.id === scriptId
                        const isActive = run.state === 'started'
                        const hasIssues = failed > 0 || blocked > 0

                        // Create unique key for script (one card per script)
                        const uniqueKey = `${run.project?.id || 'p'}-${scriptId}`

                        return (
                          <Col key={uniqueKey} xs={24} sm={12} lg={8}>
                            <Card
                              hoverable
                              onClick={() => setSelectedRun(run)}
                              style={{
                                height: '100%',
                                border: isSelected ? '2px solid #1890ff' : '1px solid #d9d9d9',
                                boxShadow: isSelected ? '0 2px 8px rgba(24, 144, 255, 0.2)' : 'none',
                                animation: isActive ? 'pulse 2s infinite' : 'none',
                              }}
                            >
                              {/* Badge for alerts */}
                              {hasIssues && (
                                <Badge.Ribbon 
                                  text={failed > 0 ? 'Failures' : 'Blocks'} 
                                  color={failed > 0 ? 'red' : 'orange'}
                                />
                              )}

                              {/* Header with user */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <Avatar 
                                    size="small"
                                    style={{ backgroundColor: '#1890ff' }}
                                    icon={<UserOutlined />}
                                  >
                                    {getInitials(run.userInfo?.email)}
                                  </Avatar>
                                  <div>
                                    <Text strong style={{ fontSize: '12px', display: 'block' }}>
                                      {run.userInfo?.isGuest && run.userInfo?.email && run.userInfo.email !== 'guest' && run.userInfo.email.includes('@')
                                        ? `Guest (${run.userInfo.email.split('@')[0]})`
                                        : run.userInfo?.email?.split('@')[0] || 'Unknown'}
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: '11px' }}>
                                      {run.project.name}
                                      {run.folder && ` / ${run.folder.name}`}
                                    </Text>
                                  </div>
                                </div>
                                <Tag color={getStateColor(run)} icon={getStateIcon(run)} style={{ fontSize: '11px' }}>
                                  {run.state || 'unknown'}
                                </Tag>
                              </div>

                              {/* Test Suite with Run Selector */}
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                  <Text 
                                    strong 
                                    style={{ 
                                      fontSize: '13px', 
                                      cursor: 'pointer',
                                      color: '#1890ff'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      navigate(`/test-suite/${run.script.id}`, {
                                        state: {
                                          project: run.project,
                                          folder: null
                                        }
                                      })
                                    }}
                                  >
                                    {run.script.name}
                                  </Text>
                                  {runs.length > 1 && (
                                    <Select
                                      size="small"
                                      value={run.id || run.userInfo?.runNumber}
                                      style={{ width: 100, fontSize: '11px' }}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(value) => {
                                        setSelectedRunByScript(prev => ({
                                          ...prev,
                                          [scriptId]: value
                                        }))
                                      }}
                                      popupMatchSelectWidth={false}
                                    >
                                      {runs.map((r) => (
                                        <Option key={r.id || r.userInfo?.runNumber} value={r.id || r.userInfo?.runNumber}>
                                          Run #{r.userInfo?.runNumber || r.id} {r.userInfo?.email ? (
                                            r.userInfo?.isGuest && r.userInfo.email !== 'guest' && r.userInfo.email.includes('@')
                                              ? `(Guest - ${r.userInfo.email.split('@')[0]})`
                                              : `(${r.userInfo.email.split('@')[0]})`
                                          ) : ''}
                                        </Option>
                                      ))}
                                    </Select>
                                  )}
                                </div>
                                {runs.length > 1 && (
                                  <Text type="secondary" style={{ fontSize: '10px' }}>
                                    {runs.length} run(s) available
                                  </Text>
                                )}
                              </div>

                              {/* Progreso compacto */}
                              <div style={{ marginBottom: 12 }}>
                                <Progress
                                  percent={percentage}
                                  size="small"
                                  strokeColor={{
                                    '0%': '#108ee9',
                                    '100%': '#87d068',
                                  }}
                                  format={() => `${percentage}%`}
                                />
                              </div>

                              {/* Contadores compactos */}
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                                {passed > 0 && <Tag color="green" style={{ margin: 0, fontSize: '10px' }}>✓ {passed}</Tag>}
                                {failed > 0 && <Tag color="red" style={{ margin: 0, fontSize: '10px' }}>✗ {failed}</Tag>}
                                {blocked > 0 && <Tag color="orange" style={{ margin: 0, fontSize: '10px' }}>⚠ {blocked}</Tag>}
                                <Tag style={{ margin: 0, fontSize: '10px' }}>{total}</Tag>
                              </div>

                              {/* Time */}
                              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                                <Text type="secondary" style={{ fontSize: '11px' }}>
                                  ⏱️ {formatElapsedTime(run.created)}
                                </Text>
                              </div>
                            </Card>
                          </Col>
                        )
                      })}
                    </Row>
                  )}
                </>
              )}
            </Content>

            {/* Side Panel: Selected run details */}
            <Sider width={400} style={{ background: '#fff', padding: '16px', borderRadius: '4px' }}>
              {selectedRun ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Title level={4} style={{ margin: 0 }}>Run Details</Title>
                    <Text 
                      type="secondary" 
                      style={{ cursor: 'pointer', fontSize: '12px' }}
                      onClick={() => setSelectedRun(null)}
                    >
                      Close
                    </Text>
                  </div>

                  <Divider style={{ margin: '12px 0' }} />

                  {/* User Information */}
                  <Card size="small" style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <Avatar 
                        style={{ backgroundColor: '#1890ff' }}
                        icon={<UserOutlined />}
                      >
                        {getInitials(selectedRun.userInfo?.email)}
                      </Avatar>
                      <div>
                        <Text strong style={{ display: 'block' }}>
                          {selectedRun.userInfo?.isGuest && selectedRun.userInfo?.email && selectedRun.userInfo.email !== 'guest' && selectedRun.userInfo.email.includes('@')
                            ? `Guest (${selectedRun.userInfo.email})`
                            : selectedRun.userInfo?.email || 'Unknown'}
                        </Text>
                        <Text type="secondary" style={{ fontSize: '12px' }}>
                          {selectedRun.project.name}
                          {selectedRun.folder && ` / ${selectedRun.folder.name}`}
                        </Text>
                      </div>
                    </div>
                    <Tag color={getStateColor(selectedRun)} icon={getStateIcon(selectedRun)}>
                      {selectedRun.state || 'unknown'}
                    </Tag>
                  </Card>

                  {/* Test Suite */}
                  <Card size="small" style={{ marginBottom: 16 }}>
                    <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 8 }}>
                      Test Suite
                    </Text>
                    <Text 
                      style={{ 
                        fontSize: '14px', 
                        cursor: 'pointer',
                        color: '#1890ff'
                      }}
                      onClick={() => navigate(`/test-suite/${selectedRun.script.id}`, {
                        state: {
                          project: selectedRun.project,
                          folder: selectedRun.folder
                        }
                      })}
                    >
                      {selectedRun.script.name}
                    </Text>
                    <div style={{ marginTop: 8 }}>
                      <Text type="secondary" style={{ fontSize: '11px' }}>
                        Run #{selectedRun.userInfo?.runNumber || selectedRun.id}
                      </Text>
                    </div>
                  </Card>

                  {/* Progreso detallado */}
                  {selectedRun.progress && (
                    <Card size="small" style={{ marginBottom: 16 }}>
                      <Text strong style={{ fontSize: '14px', display: 'block', marginBottom: 16 }}>
                        Progress
                      </Text>
                      
                      {/* Circular Progress - Centered */}
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                        <Progress
                          type="circle"
                          percent={
                            selectedRun.state === 'completed' 
                              ? 100 
                              : selectedRun.progress?.total > 0 
                                ? Math.round((selectedRun.progress.pass / selectedRun.progress.total) * 100) 
                                : 0
                          }
                          size={120}
                          strokeColor={{
                            '0%': '#108ee9',
                            '100%': '#87d068',
                          }}
                          format={() => {
                            const percent = selectedRun.state === 'completed' 
                              ? 100 
                              : selectedRun.progress?.total > 0 
                                ? Math.round((selectedRun.progress.pass / selectedRun.progress.total) * 100) 
                                : 0
                            return `${percent}%`
                          }}
                        />
                      </div>

                      {/* Statistics Grid */}
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: '1fr 1fr', 
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
                            {selectedRun.progress.total || 0}
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
                            {selectedRun.progress.pass || 0}
                          </Text>
                        </div>
                        {(selectedRun.progress.fail > 0 || selectedRun.progress.block > 0) && (
                          <>
                            {selectedRun.progress.fail > 0 && (
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
                                  {selectedRun.progress.fail || 0}
                                </Text>
                              </div>
                            )}
                            {selectedRun.progress.block > 0 && (
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
                                  {selectedRun.progress.block || 0}
                                </Text>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* Summary Line */}
                      <div style={{ 
                        padding: '10px 12px', 
                        backgroundColor: '#fafafa', 
                        borderRadius: '4px',
                        border: '1px solid #e8e8e8'
                      }}>
                        <Text style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                          Pass: <Text strong style={{ color: '#52c41a' }}>{selectedRun.progress.pass || 0}</Text>{' '}
                          Fail: <Text strong style={{ color: '#ff4d4f' }}>{selectedRun.progress.fail || 0}</Text>{' '}
                          Block: <Text strong style={{ color: '#faad14' }}>{selectedRun.progress.block || 0}</Text>{' '}
                          Query: <Text strong>0</Text>{' '}
                          Total: <Text strong>{selectedRun.progress.pass || 0}/{selectedRun.progress.total || 0}</Text>
                        </Text>
                      </div>
                    </Card>
                  )}

                  {/* Run Information */}
                  <Card size="small" style={{ marginBottom: 16 }}>
                    <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 8 }}>
                      Information
                    </Text>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div>
                        <Text type="secondary" style={{ fontSize: '11px' }}>Run ID: </Text>
                        <Text style={{ fontSize: '11px' }}>{selectedRun.id}</Text>
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: '11px' }}>Created: </Text>
                        <Text style={{ fontSize: '11px' }}>{selectedRun.created}</Text>
                      </div>
                      {selectedRun.userInfo?.date && (
                        <div>
                          <Text type="secondary" style={{ fontSize: '11px' }}>Date: </Text>
                          <Text style={{ fontSize: '11px' }}>{selectedRun.userInfo.date}</Text>
                        </div>
                      )}
                      <div>
                        <Text type="secondary" style={{ fontSize: '11px' }}>Elapsed Time: </Text>
                        <Text style={{ fontSize: '11px' }}>{formatElapsedTime(selectedRun.created)}</Text>
                      </div>
                    </div>
                  </Card>

                  {/* Test Cases (if available) */}
                  {selectedRun.tests && Array.isArray(selectedRun.tests) && selectedRun.tests.length > 0 && (
                    <Card size="small">
                      <Text strong style={{ fontSize: '12px', display: 'block', marginBottom: 12 }}>
                        Test Cases ({selectedRun.tests.length})
                      </Text>
                      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <List
                          size="small"
                          dataSource={selectedRun.tests}
                          renderItem={(test, index) => (
                            <List.Item style={{ padding: '6px 0' }}>
                              <div style={{ width: '100%' }}>
                                <Text style={{ fontSize: '11px' }}>
                                  {index + 1}. {test.name || test.text || 'Test Case without name'}
                                </Text>
                                {test.status && (
                                  <Tag 
                                    color={test.status === 'pass' ? 'green' : test.status === 'fail' ? 'red' : 'default'}
                                    style={{ fontSize: '10px', marginLeft: 8 }}
                                  >
                                    {test.status}
                                  </Tag>
                                )}
                              </div>
                            </List.Item>
                          )}
                        />
                        {selectedRun.tests.length > 50 && (
                          <Text type="secondary" style={{ fontSize: '11px' }}>
                            ... and {selectedRun.tests.length - 50} more
                          </Text>
                        )}
                      </div>
                    </Card>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8c8c8c' }}>
                  <Text type="secondary">Select a run to view details</Text>
                </div>
              )}
            </Sider>
          </Layout>
        </div>
      </Content>

      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.8;
          }
        }
      `}</style>
    </Layout>
  )
}

export default Dashboard