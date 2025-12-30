// Utility to track which runs have had emails sent
// Since Testpad API doesn't support updating runs, we track this locally

const STORAGE_KEY = 'testpad_emails_sent'

/**
 * Get unique ID for a run (scriptId-runId combination)
 */
export function getRunUniqueId(scriptId, runId) {
  return `${scriptId}-${runId}`
}

/**
 * Get all runs that have had emails sent
 * @returns {Set<string>} Set of unique run IDs
 */
export function getEmailsSentRuns() {
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
 * @param {string} scriptId - The script ID
 * @param {string} runId - The run ID
 * @returns {string|null} The recipient email or null if not found
 */
export function getEmailRecipient(scriptId, runId) {
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
 * @param {string} scriptId - The script ID
 * @param {string} runId - The run ID
 * @param {string} recipientEmail - The email address of the recipient
 */
export function markEmailSent(scriptId, runId, recipientEmail = null) {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    let emailData = {}
    if (stored) {
      try {
        emailData = JSON.parse(stored)
        // Migrate old format (array) to new format (object)
        if (Array.isArray(emailData)) {
          const oldSet = new Set(emailData)
          emailData = {}
          oldSet.forEach(id => {
            emailData[id] = null // No recipient info for old entries
          })
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
 * @param {string} scriptId - The script ID
 * @param {string} runId - The run ID
 * @returns {boolean} True if email was sent
 */
export function hasEmailSent(scriptId, runId) {
  const runs = getEmailsSentRuns()
  const uniqueId = getRunUniqueId(scriptId, runId)
  return runs.has(uniqueId)
}

/**
 * Clear all email sent tracking (useful for testing or reset)
 */
export function clearEmailSentTracking() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    return true
  } catch (e) {
    console.warn('Error clearing email sent tracking:', e)
    return false
  }
}

