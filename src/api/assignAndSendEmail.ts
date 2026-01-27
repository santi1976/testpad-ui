// assignAndSendEmail.ts - Frontend version
// Calls backend API endpoint that handles Testpad authentication

export interface AssignAndSendEmailResponse {
  message: string
  success: boolean
}

export async function assignAndSendEmail(
  scriptId: number | string,
  runId: number | string,
  targetEmail: string,
  scriptName: string
): Promise<AssignAndSendEmailResponse> {
  console.log('[assignAndSendEmail] Starting...')
  console.log(`  scriptId: ${scriptId}`)
  console.log(`  runId: ${runId}`)
  console.log(`  targetEmail: ${targetEmail}`)
  console.log(`  scriptName: ${scriptName}`)

  try {
    const response = await fetch('/api/assign-and-send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scriptId,
        runId,
        targetEmail,
        scriptName
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `Request failed with status ${response.status}`)
    }

    console.log('[assignAndSendEmail] ✅ Success:', data.message)
    return data
  } catch (error) {
    console.error('[assignAndSendEmail] ❌ Error:', (error as Error).message)
    throw error
  }
}
