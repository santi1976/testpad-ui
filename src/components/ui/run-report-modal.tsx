import { useRef, useState } from 'react'
import { X, Copy, CheckCircle, XCircle, AlertTriangle, ExternalLink, Clock, Image, Link2, Loader2, ChevronDown, ChevronUp, MinusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import html2canvas from 'html2canvas'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface Test {
  id: string | number
  name?: string
  text?: string
  status?: string
}

interface RunProgress {
  total: number
  pass: number
  fail: number
  block: number
  query?: number
}

interface RunReportProps {
  isOpen: boolean
  onClose: () => void
  run: {
    id: string | number
    script: { id: string | number; name: string }
    project: { id: string | number; name: string }
    tests: Test[]
    results: Record<string, string | { result: string }>
    progress: RunProgress | null
    created: string
    userInfo?: { email?: string; runNumber?: string | number } | null
  }
}

const COLORS = {
  pass: '#22c55e',
  fail: '#ef4444',
  block: '#f59e0b',
  query: '#3b82f6',
  pending: '#6b7280',
}

function getTestStatus(testId: string | number, results: Record<string, string | { result: string }>): string {
  const result = results[String(testId)]
  if (!result) return 'pending'
  const status = typeof result === 'object' ? result?.result : result
  return status || 'pending'
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'pass':
    case 'passed':
      return <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
    case 'fail':
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500 shrink-0" />
    case 'block':
    case 'blocked':
      return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
    case 'query':
      return <MinusCircle className="w-4 h-4 text-blue-500 shrink-0" />
    default:
      return <Clock className="w-4 h-4 text-gray-400 shrink-0" />
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'pass':
    case 'passed':
      return <Badge className="bg-green-500 text-white text-[10px] shrink-0">PASS</Badge>
    case 'fail':
    case 'failed':
      return <Badge className="bg-red-500 text-white text-[10px] shrink-0">FAIL</Badge>
    case 'block':
    case 'blocked':
      return <Badge className="bg-yellow-500 text-white text-[10px] shrink-0">BLOCK</Badge>
    case 'query':
      return <Badge className="bg-blue-500 text-white text-[10px] shrink-0">OUT OF SCOPE</Badge>
    default:
      return <Badge variant="outline" className="text-[10px] shrink-0">PENDING</Badge>
  }
}

export function RunReportModal({ isOpen, onClose, run }: RunReportProps) {
  const reportRef = useRef<HTMLDivElement>(null)
  const [isCopyingImage, setIsCopyingImage] = useState(false)
  const [showAllIssues, setShowAllIssues] = useState(false)

  if (!isOpen) return null

  const progress = run.progress || { total: run.tests?.length || 0, pass: 0, fail: 0, block: 0, query: 0 }
  const pending = progress.total - progress.pass - progress.fail - progress.block - (progress.query || 0)
  const executed = progress.pass + progress.fail + progress.block
  const passRate = executed > 0 ? Math.round((progress.pass / executed) * 100) : 0
  const testpadUrl = `https://bitfinex.testpad.com/script/${run.script.id}/run/${run.userInfo?.runNumber || run.id}`
  const formattedDate = new Date(run.created).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })

  // Donut data - only show items with value > 0
  const donutData = [
    { name: 'Pass', value: progress.pass, color: COLORS.pass },
    { name: 'Fail', value: progress.fail, color: COLORS.fail },
    { name: 'Blocked', value: progress.block, color: COLORS.block },
    { name: 'Out of Scope', value: progress.query || 0, color: COLORS.query },
    { name: 'Pending', value: pending > 0 ? pending : 0, color: COLORS.pending },
  ].filter(item => item.value > 0)

  // Issues = Fail only (blocks are not bugs)
  const issueTests = run.tests?.filter(t => {
    const status = getTestStatus(t.id, run.results)
    return status === 'fail' || status === 'failed'
  }) || []

  const SUMMARY_LIMIT = 5
  const displayedIssues = showAllIssues ? issueTests : issueTests.slice(0, SUMMARY_LIMIT)
  const hiddenCount = issueTests.length - SUMMARY_LIMIT

  const copyTextSummary = () => {
    const failedTests = run.tests
      .filter(t => {
        const status = getTestStatus(t.id, run.results)
        return status === 'fail' || status === 'failed'
      })
      .map((t) => `  - ${t.text || t.name}`)
      .join('\n')

    const blockedTests = run.tests
      .filter(t => {
        const status = getTestStatus(t.id, run.results)
        return status === 'block' || status === 'blocked'
      })
      .map((t) => `  - ${t.text || t.name}`)
      .join('\n')

    let summary = `QA Summary: ${run.script.name}
Tested on: ${formattedDate}
Pass: ${progress.pass}/${progress.total} (${passRate}%)
Failed: ${progress.fail}${failedTests ? '\n' + failedTests : ''}
Blocked: ${progress.block}${blockedTests ? '\n' + blockedTests : ''}
Out of Scope: ${progress.query || 0}
TestPad: ${testpadUrl}`

    navigator.clipboard.writeText(summary)
    toast.success('Text summary copied!')
  }

  const copyTestPadLink = () => {
    navigator.clipboard.writeText(testpadUrl)
    toast.success('TestPad link copied!')
  }

  const copyAsImage = async () => {
    if (!reportRef.current) return
    
    setIsCopyingImage(true)
    try {
      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: '#f8fafc',
        scale: 2,
        logging: false,
        useCORS: true,
      })
      
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ])
            toast.success('Image copied to clipboard!')
          } catch (err) {
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `run-report-${run.script.name}-${run.userInfo?.runNumber || run.id}.png`
            a.click()
            URL.revokeObjectURL(url)
            toast.success('Image downloaded (clipboard not supported)')
          }
        }
      }, 'image/png')
    } catch (err) {
      console.error('Failed to copy image:', err)
      toast.error('Failed to copy image')
    } finally {
      setIsCopyingImage(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Run Report</h2>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyAsImage} disabled={isCopyingImage}>
              {isCopyingImage ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Image className="w-4 h-4 mr-1" />
              )}
              Copy Image
            </Button>
            <Button variant="outline" size="sm" onClick={copyTestPadLink}>
              <Link2 className="w-4 h-4 mr-1" />
              Copy Link
            </Button>
            <Button variant="outline" size="sm" onClick={copyTextSummary}>
              <Copy className="w-4 h-4 mr-1" />
              Copy Text
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Report Content */}
        <div className="overflow-y-auto p-4">
          <div 
            ref={reportRef} 
            className="bg-slate-50 rounded-lg p-6 border"
          >
            {/* Title */}
            <div className="mb-4 text-center">
              <h3 className="text-xl font-bold text-slate-800">{run.script.name}</h3>
              <p className="text-sm text-slate-500">{run.project.name} • Run #{run.userInfo?.runNumber || run.id}</p>
            </div>

            {/* Donut + Summary Layout */}
            <div className="flex items-center gap-6 mb-6">
              {/* Donut Chart - Left */}
              <div className="flex-1 min-w-[300px]">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="45%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => {
                        const pct = ((percent || 0) * 100).toFixed(0)
                        // Acortar nombres largos
                        const shortName = name === 'Out of Scope' ? 'OoS' : name
                        return `${shortName} ${pct}%`
                      }}
                      labelLine={true}
                      fontSize={10}
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [value, 'Tests']} />
                    <Legend 
                      wrapperStyle={{ fontSize: '10px' }}
                      formatter={(value) => value === 'Out of Scope' ? 'Out of Scope' : value}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* QA Summary - Right */}
              <div className="flex-1 bg-white rounded-lg border p-4">
                <h4 className="font-semibold text-slate-700 mb-3 text-sm">QA Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Tested on:</span>
                    <span className="font-medium">{formattedDate}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Tests:</span>
                    <span className="font-medium">{progress.total}</span>
                  </div>
                  <hr className="my-2" />
                  <div className="flex justify-between">
                    <span className="text-green-600">✓ Pass:</span>
                    <span className="font-medium text-green-600">{progress.pass}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-600">✗ Failed:</span>
                    <span className="font-medium text-red-600">{progress.fail}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600">⚠ Blocked:</span>
                    <span className="font-medium text-yellow-600">{progress.block}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">○ Out of Scope:</span>
                    <span className="font-medium text-blue-600">{progress.query || 0}</span>
                  </div>
                  {pending > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">◦ Pending:</span>
                      <span className="font-medium text-gray-500">{pending}</span>
                    </div>
                  )}
                  <hr className="my-2" />
                  <div className="flex justify-between">
                    <span className="text-slate-700 font-medium">Pass Rate:</span>
                    <span className={cn(
                      "font-bold",
                      passRate >= 80 ? "text-green-600" : passRate >= 50 ? "text-yellow-600" : "text-red-600"
                    )}>
                      {passRate}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Issues List - Failed tests only (blocks are not bugs) */}
            {issueTests.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-700">
                    Issues ({issueTests.length})
                  </p>
                  {issueTests.length > SUMMARY_LIMIT && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowAllIssues(!showAllIssues)}
                      className="text-xs h-7 px-2"
                    >
                      {showAllIssues ? (
                        <>
                          <ChevronUp className="w-3 h-3 mr-1" />
                          Show Less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3 h-3 mr-1" />
                          Show All ({issueTests.length})
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <div className="bg-white rounded-lg border divide-y">
                  {displayedIssues.map((test) => {
                    const status = getTestStatus(test.id, run.results)
                    return (
                      <div 
                        key={test.id} 
                        className="flex items-center gap-3 px-3 py-2 bg-red-50"
                      >
                        {getStatusIcon(status)}
                        <span className="text-sm flex-1 text-slate-700">
                          {test.text || test.name || 'Test Case'}
                        </span>
                        {getStatusBadge(status)}
                      </div>
                    )
                  })}
                  {!showAllIssues && hiddenCount > 0 && (
                    <div className="px-3 py-2 text-center text-sm text-slate-500 bg-slate-50">
                      ... and {hiddenCount} more issues
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t">
              <span>Generated from TestPad Dashboard</span>
              <a 
                href={testpadUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-500 hover:underline"
              >
                View in TestPad <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer hint */}
        <div className="p-3 border-t bg-slate-50 text-center">
          <p className="text-xs text-slate-500">
            💡 {showAllIssues ? 'All issues visible' : 'Showing summary'} — Click "Copy Image" to capture
          </p>
        </div>
      </div>
    </div>
  )
}