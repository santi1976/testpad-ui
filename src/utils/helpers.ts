export function createSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function getInitials(email?: string | null): string {
    if (!email) return '??'
    const parts = email.split('@')[0].split('.')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return email.substring(0, 2).toUpperCase()
}

export function formatDate(iso: string | undefined | null): string {
    if (!iso) return ''
    try {
        return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    } catch {
        return ''
    }
}

export const AVATAR_COLORS = [
    'bg-green-200 text-green-800 border-green-300',
    'bg-blue-200 text-blue-800 border-blue-300',
    'bg-pink-200 text-pink-800 border-pink-300',
    'bg-purple-200 text-purple-800 border-purple-300',
    'bg-amber-200 text-amber-800 border-amber-300',
    'bg-cyan-200 text-cyan-800 border-cyan-300',
    'bg-red-200 text-red-800 border-red-300',
    'bg-indigo-200 text-indigo-800 border-indigo-300',
]

export function getAvatarColor(email?: string | null): string {
    if (!email) return AVATAR_COLORS[0]
    let hash = 0
    for (let i = 0; i < email.length; i++) hash = ((hash << 5) - hash) + email.charCodeAt(i)
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function displayNameFromEmail(email: string | null): string {
    if (!email) return 'Anyone'
    const namePart = email.split('@')[0]
    return namePart
        .split('.')
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ')
}

export function extractTesterFromRun(run: any): string | null {
    if (!run) return null
    const headers = run.headers
    const assignee = run.assignee
    const label = run.label
    const fielddata = run.fielddata

    const tester = headers?._tester
    if (tester && tester.includes('@') && tester !== 'anyone') return tester
    if (assignee?.email && assignee.email.includes('@')) return assignee.email
    if (label) {
        const parts = label.split(' / ')
        if (parts.length >= 2 && parts[1]?.includes('@')) return parts[1]
    }
    if (Array.isArray(fielddata) && fielddata[1]?.raw && fielddata[1].raw.includes('@')) return fielddata[1].raw
    return null
}
