// Utility to track which runs have had emails sent
// Since Testpad API doesn't support updating runs, we track this locally

const STORAGE_KEY = 'testpad_emails_sent'

type EmailData = Record<string, string | null>

/**
 * Get unique ID for a run (scriptId-runId combination)
 */
export function getRunUniqueId(scriptId: string, runId: string): string {
  return `${scriptId}-${runId}`
}

/**
 * Get all runs that have had emails sent
 */
export function getEmailsSentRuns(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return new Set()
    const data = JSON.parse(stored)
    // Handle both old format (array) and new format (object)
    if (Array.isArray(data)) {
      return new Set(data)
    }
    return new Set(Object.keys(data))
  } catch (e) {
    console.warn('Error reading emails sent from localStorage:', e)
    return new Set()
  }
}

/**
 * Get recipient email for a run that had an email sent
 */
export function getEmailRecipient(scriptId: string, runId: string): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const data = JSON.parse(stored)
    // Handle old format (array)
    if (Array.isArray(data)) {
      return null // No recipient info in old format
    }
    const uniqueId = getRunUniqueId(scriptId, runId)
    return data[uniqueId] || null
  } catch (e) {
    console.warn('Error reading email recipient from localStorage:', e)
    return null
  }
}

/**
 * Mark a run as having an email sent
 */
export function markEmailSent(scriptId: string, runId: string, recipientEmail: string | null = null): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    let emailData: EmailData = {}
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // Migrate old format (array) to new format (object)
        if (Array.isArray(parsed)) {
          const oldSet = new Set(parsed)
          emailData = {}
          oldSet.forEach(id => {
            emailData[id] = null // No recipient info for old entries
          })
        } else {
          emailData = parsed
        }
      } catch (e) {
        emailData = {}
      }
    }

    const uniqueId = getRunUniqueId(scriptId, runId)
    emailData[uniqueId] = recipientEmail
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emailData))
    return true
  } catch (e) {
    console.warn('Error saving email sent to localStorage:', e)
    return false
  }
}

/**
 * Check if a run has had an email sent
 */
export function hasEmailSent(scriptId: string, runId: string): boolean {
  const runs = getEmailsSentRuns()
  const uniqueId = getRunUniqueId(scriptId, runId)
  return runs.has(uniqueId)
}

/**
 * Clear all email sent tracking (useful for testing or reset)
 */
export function clearEmailSentTracking(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch (e) {
    console.warn('Error clearing email sent tracking:', e)
    return false
  }
}
