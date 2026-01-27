import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../utils/api'

interface Folder {
  id: number | string
  name: string
  contents?: FolderItem[]
}

interface FolderItem {
  id: number | string
  name: string
  type: 'folder' | 'script'
  contents?: FolderItem[]
}

interface Run {
  tester?: string
  assignee?: { email?: string }
}

// Extract scripts from folder structure
function extractScripts(items: FolderItem[]): { id: string | number; name: string }[] {
  const scripts: { id: string | number; name: string }[] = []

  function traverse(items: FolderItem[]) {
    for (const item of items) {
      if (item.type === 'script') {
        scripts.push({ id: item.id, name: item.name })
      }
      if (item.contents) {
        traverse(item.contents)
      }
    }
  }

  traverse(items)
  return scripts
}

export function useTesters(projectId: string | number | null | undefined, folders: Folder[]) {
  return useQuery({
    queryKey: ['testers', projectId],
    queryFn: async () => {
      if (!projectId || folders.length === 0) return []

      const testerSet = new Set<string>()

      // Get scripts from the 3 most recent releases
      const releasesToScan = folders.slice(0, 3)

      for (const release of releasesToScan) {
        if (!release.contents) continue

        const scripts = extractScripts(release.contents)

        // Fetch runs for each script (limit to first 10 scripts per release)
        const scriptsToCheck = scripts.slice(0, 10)

        await Promise.all(
          scriptsToCheck.map(async (script) => {
            try {
              const runsData = await apiGet(
                `/api/v1/projects/${projectId}/scripts/${script.id}/runs`
              )
              const runs: Run[] = runsData?.runs || []

              runs.forEach((run) => {
                if (run.tester && run.tester.includes('@')) {
                  testerSet.add(run.tester)
                }
                if (run.assignee?.email && run.assignee.email.includes('@')) {
                  testerSet.add(run.assignee.email)
                }
              })
            } catch {
              // Ignore errors for individual scripts
            }
          })
        )
      }

      return Array.from(testerSet).sort()
    },
    enabled: !!projectId && folders.length > 0,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
  })
}
