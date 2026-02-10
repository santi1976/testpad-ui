import { testerConfig } from '../config/testerConfig'

/**
 * Normaliza un tester y decide si debe mostrarse.
 * Retorna email normalizado o null si debe filtrarse.
 */
export function normalizeTester(tester: string | null | undefined): string | null {
  if (!tester || typeof tester !== 'string') return null

  const trimmed = tester.trim()
  if (!trimmed) return null

  // Extract email from "Guest (email)" format if it exists
  const guestMatch = trimmed.match(/^guest\s*\((.+@.+)\)$/i)
  if (guestMatch) {
    const email = guestMatch[1].trim().toLowerCase()
    const domain = email.split('@')[1]
    if (testerConfig.blacklistedDomains.includes(domain)) return null
    return email
  }

  // If it has @, it's an email
  if (trimmed.includes('@')) {
    const domain = trimmed.split('@')[1]?.toLowerCase()
    if (!domain) return null
    if (testerConfig.blacklistedDomains.includes(domain)) return null
    return trimmed.toLowerCase()
  }

  // Check for known alias
  const aliasEmail = testerConfig.aliases[trimmed] || testerConfig.aliases[trimmed.toLowerCase()]
  if (aliasEmail) return aliasEmail.toLowerCase()

  // Apply exclusion patterns
  for (const pattern of testerConfig.excludePatterns) {
    if (pattern.test(trimmed)) return null
  }

  // Valid name (3+ letters, no numbers)
  if (trimmed.length >= 3 && /^[a-zA-Z]+$/.test(trimmed)) {
    return trimmed
  }

  return null
}

/**
 * Sorts testers: emails first, names at the end
 */
export function sortTesters(testers: string[]): string[] {
  const emails = testers.filter(t => t.includes('@')).sort((a, b) => a.localeCompare(b))
  const names = testers.filter(t => !t.includes('@')).sort((a, b) => a.localeCompare(b))
  return [...emails, ...names]
}
