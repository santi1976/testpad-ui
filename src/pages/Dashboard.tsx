import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { apiGet } from '@/utils/api';
import { StatCard } from '@/components/ui/stat-card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ResultsPieChart } from '@/components/charts/results-pie-chart';
import { TesterKanbanBoard, type TesterData, type Assignment } from '@/components/ui/tester-kanban-board';
import { ListChecks, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface Project {
  id: number;
  name: string;
}

interface FolderItem {
  id: number | string;
  name: string;
  type: 'folder' | 'script';
  contents?: FolderItem[];
  progress?: { total?: number; pass?: number; fail?: number; block?: number; query?: number };
  runs?: Array<{
    id?: string;
    state?: string;
    progress?: { total?: number; pass?: number; fail?: number; block?: number; query?: number };
    assignee?: { name: string; email?: string };
    headers?: { _tester?: string };
    results?: Record<string, { result?: string; comment?: string }>;
  }>;
}

interface Stats {
  total: number;
  pass: number;
  fail: number;
  block: number;
  query: number;
}

interface TesterInfo {
  name: string;
  email?: string;
  initial: string;
  progress: number;
  total: number;
  completed: number;
  color: string;
  textColor: string;
  assignments: Array<{
    runId: string;
    scriptName: string;
    projectName: string;
    status: 'complete' | 'started' | 'new' | 'unknown';
    progress: string;
  }>;
}

interface FailedTest {
  title: string;
  path: string;
  scriptId: string | number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [stats, setStats] = useState<Stats>({ total: 0, pass: 0, fail: 0, block: 0, query: 0 });
  const [testers, setTesters] = useState<TesterInfo[]>([]);
  const [failedTests, setFailedTests] = useState<FailedTest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFailingOnly, setShowFailingOnly] = useState(false);

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await apiGet<{ projects: Project[] }>('/api/v1/projects');
        setProjects(data.projects || []);
      } catch (error) {
        console.error('Failed to load projects:', error);
      }
    };
    loadProjects();
  }, []);

  // Auto-select Testpad Api Testing project (or first if not found)
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      const testpadProject = projects.find(p =>
        p.name.toLowerCase().includes('testpad api testing')
      );
      setSelectedProjectId(String(testpadProject?.id || projects[0].id));
    }
  }, [projects, selectedProjectId]);

  // Load folders when project changes
  useEffect(() => {
    if (!selectedProjectId) {
      setFolders([]);
      return;
    }

    const loadFolders = async () => {
      setIsLoading(true);
      try {
        const query = new URLSearchParams({
          subfolders: 'all',
          scripts: 'terse',
          runs: 'full',
          progress: 'full',
          tests: 'none',
          fields: 'none',
          results: 'none',
        }).toString();

        const data = await apiGet<{ folder?: { contents?: FolderItem[] }; folders?: FolderItem[] }>(
          `/api/v1/projects/${selectedProjectId}/folders?${query}`
        );

        const folderList = data.folder?.contents || data.folders || [];
        setFolders(folderList);

        // Auto-select all folders
        const allIds = new Set<string>();
        const collectIds = (items: FolderItem[]) => {
          items.forEach(item => {
            if (item.type === 'folder') {
              allIds.add(String(item.id));
              if (item.contents) collectIds(item.contents);
            }
          });
        };
        collectIds(folderList);
        setSelectedFolders(allIds);

        // Auto-analyze
        analyzeSelection(folderList, allIds);
      } catch (error) {
        console.error('Failed to load folders:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFolders();
  }, [selectedProjectId]);

  // Helper: Get all scripts from folders
  const getAllScripts = (items: FolderItem[], selectedIds: Set<string>): FolderItem[] => {
    const scripts: FolderItem[] = [];
    const traverse = (list: FolderItem[], parentSelected: boolean) => {
      list.forEach(item => {
        const isSelected = selectedIds.has(String(item.id)) || parentSelected;
        if (item.type === 'script' && isSelected) {
          scripts.push(item);
        } else if (item.type === 'folder' && item.contents) {
          traverse(item.contents, isSelected);
        }
      });
    };
    traverse(items, false);
    return scripts;
  };

  // Helper: Get latest run
  const getLatestRun = (runs?: FolderItem['runs']) => {
    if (!runs || runs.length === 0) return null;
    return runs[0]; // Usually first is latest
  };

  // Helper: Get tester from run
  const getTester = (run: NonNullable<FolderItem['runs']>[0]): string => {
    return run.assignee?.name || run.headers?._tester || 'Unassigned';
  };

  // Analyze selected folders
  const analyzeSelection = (folderList: FolderItem[] = folders, selectedIds: Set<string> = selectedFolders) => {
    setIsAnalyzing(true);

    const scripts = getAllScripts(folderList, selectedIds);
    const newStats: Stats = { total: 0, pass: 0, fail: 0, block: 0, query: 0 };
    const testerMap: Record<string, {
      total: number;
      completed: number;
      pass: number;
      email?: string;
      assignments: Array<{
        runId: string;
        scriptName: string;
        projectName: string;
        status: 'complete' | 'started' | 'new' | 'unknown';
        progress: string;
      }>;
    }> = {};
    const failures: FailedTest[] = [];

    scripts.forEach(script => {
      const latestRun = getLatestRun(script.runs);
      if (latestRun?.progress) {
        const p = latestRun.progress;
        newStats.total += p.total || 0;
        newStats.pass += p.pass || 0;
        newStats.fail += p.fail || 0;
        newStats.block += p.block || 0;
        newStats.query += p.query || 0;

        // Track tester
        const tester = getTester(latestRun);
        if (!testerMap[tester]) {
          testerMap[tester] = {
            total: 0,
            completed: 0,
            pass: 0,
            email: latestRun.assignee?.email,
            assignments: []
          };
        }
        testerMap[tester].total += p.total || 0;
        testerMap[tester].completed += (p.pass || 0) + (p.fail || 0) + (p.block || 0);
        testerMap[tester].pass += p.pass || 0;

        // Track assignment for this tester
        const runState = latestRun.state || 'unknown';
        testerMap[tester].assignments.push({
          runId: latestRun.id || '',
          scriptName: script.name,
          projectName: selectedProject?.name || 'Unknown',
          status: runState as 'complete' | 'started' | 'new' | 'unknown',
          progress: `${p.pass || 0}/${p.total || 0}`
        });

        // Track failures
        if ((p.fail || 0) > 0) {
          failures.push({
            title: `${script.name} - ${p.fail} failed`,
            path: script.name,
            scriptId: script.id,
          });
        }
      }
    });

    setStats(newStats);
    setFailedTests(failures);

    // Build tester list
    const colors = [
      { border: 'border-green-500', text: 'text-green-600' },
      { border: 'border-blue-500', text: 'text-blue-600' },
      { border: 'border-orange-500', text: 'text-orange-600' },
      { border: 'border-purple-500', text: 'text-purple-600' },
      { border: 'border-pink-500', text: 'text-pink-600' },
    ];

    const testerList: TesterInfo[] = Object.entries(testerMap)
      .filter(([name]) => name !== 'Unassigned')
      .map(([name, data], idx) => ({
        name: name.split('@')[0],
        email: data.email,
        initial: name.charAt(0).toUpperCase(),
        progress: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
        total: data.total,
        completed: data.completed,
        color: colors[idx % colors.length].border,
        textColor: colors[idx % colors.length].text,
        assignments: data.assignments,
      }))
      .sort((a, b) => b.progress - a.progress);

    setTesters(testerList);
    setIsAnalyzing(false);
  };

  // Toggle folder selection
  const toggleFolder = (folderId: string) => {
    setSelectedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Calculate rates
  const passRate = stats.total > 0 ? Math.round((stats.pass / stats.total) * 100) : 0;
  const completionRate = stats.total > 0 ? Math.round(((stats.pass + stats.fail + stats.block) / stats.total) * 100) : 0;

  // Filter folders by search
  const filterFolders = (items: FolderItem[]): FolderItem[] => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const hasFailures = showFailingOnly ? (item.progress?.fail || 0) > 0 : true;
      return matchesSearch && hasFailures;
    });
  };

  // Render folder tree
  const renderFolderTree = (items: FolderItem[], depth = 0) => {
    const filtered = filterFolders(items.filter(i => i.type === 'folder'));

    return filtered.map(folder => {
      const folderId = String(folder.id);
      const isSelected = selectedFolders.has(folderId);
      const scriptCount = folder.contents?.filter(c => c.type === 'script').length || 0;

      return (
        <div key={folder.id}>
          <div
            className={`flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer ${isSelected ? 'bg-blue-50' : ''}`}
            onClick={() => toggleFolder(folderId)}
            style={{ marginLeft: `${depth * 16}px` }}
          >
            <Checkbox checked={isSelected} />
            <svg className={`w-4 h-4 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-sm flex-1 truncate">{folder.name}</span>
            {scriptCount > 0 && (
              <span className="text-xs bg-gray-200 px-1.5 rounded">{scriptCount}</span>
            )}
          </div>
          {folder.contents && (
            <div className="border-l border-gray-200 ml-4">
              {renderFolderTree(folder.contents, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const selectedProject = projects.find(p => String(p.id) === selectedProjectId);

  const navItems = [
    { key: 'dashboard', label: 'Dashboard', path: '/', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
    { key: 'divider1', label: 'Test Execution', type: 'divider' },
    { key: 'create-run', label: 'Create Run', path: '/create-run', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6' },
    { key: 'assignments', label: 'Assignments & Email', path: '/assignments', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { key: 'divider-management', label: 'Test Management', type: 'divider' },
    { key: 'test-suites', label: 'Test Suites', path: '/test-suites', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { key: 'test-runs', label: 'Test Runs', path: '/test-runs', icon: 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { key: 'divider2', type: 'separator' },
    { key: 'reports', label: 'Reports', path: '#', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', disabled: true, badge: 'FUTURE' },
    { key: 'settings', label: 'Settings', path: '/settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  ];

  const handleSignOut = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Navigation Sidebar */}
      <aside className="w-64 text-white flex flex-col" style={{ backgroundColor: '#121827' }}>
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-bold text-lg">Testpad Admin</h2>
          <p className="text-xs text-gray-400 mt-1">{user?.email || 'user@bitfinex.com'}</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            if (item.type === 'divider') {
              return (
                <div key={item.key} className="pt-2">
                  <p className="px-4 text-xs text-gray-500 uppercase tracking-wider mb-2">{item.label}</p>
                </div>
              );
            }
            if (item.type === 'separator') {
              return <div key={item.key} className="border-t border-gray-700 my-4" />;
            }
            const isActive = location.pathname === item.path;
            return (
              <a
                key={item.key}
                href={item.disabled ? undefined : item.path}
                onClick={(e) => {
                  if (item.disabled) {
                    e.preventDefault();
                    return;
                  }
                  e.preventDefault();
                  navigate(item.path!);
                }}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : item.disabled
                    ? 'text-gray-500 cursor-not-allowed'
                    : 'text-gray-300 hover:bg-gray-800'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {item.label}
                {item.badge && (
                  <span className="ml-auto text-xs bg-yellow-600 text-white px-1.5 py-0.5 rounded">{item.badge}</span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Folders Sidebar */}
      {sidebarOpen && (
        <aside className="w-80 border-r bg-white flex flex-col overflow-hidden">
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                Scope Selector
              </h3>
              <button
                className="text-xs text-blue-600 hover:underline"
                onClick={() => setSelectedFolders(new Set())}
              >
                Clear
              </button>
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <Input
                placeholder="Filter folders..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <Checkbox
                checked={showFailingOnly}
                onCheckedChange={(checked) => setShowFailingOnly(!!checked)}
              />
              <span>Only show failing</span>
            </label>
          </div>

          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading folders...</div>
            ) : selectedProjectId ? (
              <div className="space-y-1">
                {/* Project Root */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 mb-2">
                  <Checkbox checked={true} disabled />
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <span className="text-sm font-medium flex-1 truncate">{selectedProject?.name}</span>
                </div>
                {renderFolderTree(folders)}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">Select a project to view folders</div>
            )}
          </ScrollArea>
        </aside>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Top Toolbar */}
        <div className="border-b bg-white px-4 py-3 flex items-center justify-between gap-4 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className={cn(
                "w-[200px]",
                selectedProjectId && "bg-cyan-50 border-cyan-400"
              )}>
                <SelectValue placeholder="Select Project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map(p => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => navigate('/create-run')} className="bg-blue-600 hover:bg-blue-700">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Create Run
            </Button>
            <Button onClick={() => navigate('/assignments')} className="bg-green-600 hover:bg-green-700">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Assignments & Email
            </Button>
            <div className="border-l border-gray-300 h-8 mx-2" />
            <Badge variant="secondary" className="px-3 py-1">
              {selectedFolders.size} folders selected
            </Badge>
            <Button
              variant="outline"
              onClick={() => analyzeSelection()}
              disabled={isAnalyzing || selectedFolders.size === 0}
            >
              {isAnalyzing ? (
                <svg className="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              )}
              Analyze
            </Button>
            <Button variant="outline" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Dashboard Content */}
        <div className="p-6 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              title="Total Tests"
              value={stats.total}
              icon={ListChecks}
              variant="default"
            />
            <StatCard
              title="Passed"
              value={stats.pass}
              icon={CheckCircle}
              variant="success"
            />
            <StatCard
              title="Failed"
              value={stats.fail}
              icon={XCircle}
              variant="destructive"
            />
            <StatCard
              title="Blocked/Query"
              value={stats.block + stats.query}
              icon={AlertTriangle}
              variant="warning"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-3 gap-6">
            {/* Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Result Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResultsPieChart
                  progress={{
                    total: stats.total,
                    pass: stats.pass,
                    fail: stats.fail,
                    block: stats.block,
                    query: stats.query
                  }}
                />
              </CardContent>
            </Card>

            {/* Execution Status */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Execution Status</CardTitle>
                <CardDescription>Aggregate status across selected folders</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium">Completion Rate</span>
                    <span className="text-gray-500">{completionRate}%</span>
                  </div>
                  <ProgressBar
                    progress={{
                      total: stats.total,
                      pass: stats.pass,
                      fail: stats.fail,
                      block: stats.block,
                      query: stats.query
                    }}
                    showLabels
                    height="lg"
                  />
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-center">
                    <div className="text-xl font-bold text-green-600">{stats.pass}</div>
                    <div className="text-xs text-green-700">Passed</div>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-center">
                    <div className="text-xl font-bold text-red-600">{stats.fail}</div>
                    <div className="text-xs text-red-700">Failed</div>
                  </div>
                  <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-center">
                    <div className="text-xl font-bold text-yellow-600">{stats.block}</div>
                    <div className="text-xs text-yellow-700">Blocked</div>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-center">
                    <div className="text-xl font-bold text-blue-600">{stats.query}</div>
                    <div className="text-xs text-blue-700">Query</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Failed Tests */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b">
              <div>
                <CardTitle className="text-base text-red-600 flex items-center gap-2">
                  Failed Test Cases
                  <Badge variant="destructive" className="text-xs">{failedTests.length}</Badge>
                </CardTitle>
                <CardDescription>Tests requiring attention</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => analyzeSelection()}>
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="p-4 space-y-2 max-h-40 overflow-y-auto">
              {failedTests.length > 0 ? (
                failedTests.map((test, idx) => (
                  <div key={idx} className="p-3 bg-red-50 rounded-lg border border-red-100">
                    <div className="font-medium text-red-800">{test.title}</div>
                    <div className="text-sm text-gray-600">{test.path}</div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500">
                  {stats.fail > 0 ? 'Click Refresh to load details' : 'No failed tests'}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team Status Board */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="text-base">Team Status Board</CardTitle>
              <CardDescription>Track tester progress by status</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {selectedProjectId ? (
                <TesterKanbanBoard
                  data={testers.map(t => ({
                    name: t.name,
                    email: t.email,
                    runs: t.total,
                    fails: 0,
                    completed: t.completed,
                    inProgress: t.total - t.completed,
                    assignments: t.assignments
                  }))}
                />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Select a project to see team status
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
