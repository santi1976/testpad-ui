// API helper functions
// Use relative paths so Vite proxy can intercept requests

// Get API token from user session or fallback to env
function getApiToken(): string | undefined {
  // Try to get from localStorage (user's token)
  try {
    const storedUser = localStorage.getItem('testpad_user')
    if (storedUser) {
      const userData = JSON.parse(storedUser)
      if (userData.apiToken) {
        return userData.apiToken
      }
    }
  } catch (e) {
    // Fallback to env token
  }
  // Fallback to env token (for backward compatibility)
  return import.meta.env.VITE_TESTPAD_API_TOKEN
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const token = getApiToken()
  if (!token) {
    throw new Error('API token not found. Please log in.')
  }
  // Use relative path so Vite proxy works
  const res = await fetch(path, {
    headers: {
      Authorization: `apikey ${token}`
    }
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`API Error ${res.status}: ${errorText}`)
  }
  return res.json()
}

export async function apiPost<T = unknown>(path: string, body: unknown): Promise<T> {
  const token = getApiToken()
  if (!token) {
    throw new Error('API token not found. Please log in.')
  }
  // Use relative path so Vite proxy works
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      Authorization: `apikey ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`API Error ${res.status}: ${errorText}`)
  }
  return res.json()
}

export async function apiPut<T = unknown>(path: string, body: unknown): Promise<T> {
  const token = getApiToken()
  if (!token) {
    throw new Error('API token not found. Please log in.')
  }
  // Use relative path so Vite proxy works
  const res = await fetch(path, {
    method: 'PUT',
    headers: {
      Authorization: `apikey ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`API Error ${res.status}: ${errorText}`)
  }
  return res.json()
}

export async function apiPatch<T = unknown>(path: string, body: unknown): Promise<T> {
  const token = getApiToken()
  if (!token) {
    throw new Error('API token not found. Please log in.')
  }
  // Use relative path so Vite proxy works
  const res = await fetch(path, {
    method: 'PATCH',
    headers: {
      Authorization: `apikey ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`API Error ${res.status}: ${errorText}`)
  }
  return res.json()
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  const token = getApiToken()
  if (!token) {
    throw new Error('API token not found. Please log in.')
  }
  // Use relative path so Vite proxy works
  const res = await fetch(path, {
    method: 'DELETE',
    headers: {
      Authorization: `apikey ${token}`
    }
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`API Error ${res.status}: ${errorText}`)
  }
  return res.json()
}

// Helper to assign a Test Suite to a user
export async function assignTestSuite(scriptId: string, userEmail: string): Promise<unknown> {
  // Try different possible endpoints
  // Option 1: PATCH directly on the script
  try {
    return await apiPatch(`/api/v1/scripts/${scriptId}`, {
      assigned_to: userEmail
    })
  } catch (error) {
    // If it fails, try other formats
    try {
      return await apiPut(`/api/v1/scripts/${scriptId}/assign`, {
        user: userEmail
      })
    } catch (error2) {
      throw new Error(`Failed to assign: ${(error as Error).message}`)
    }
  }
}

// Helper to unassign a Test Suite
export async function unassignTestSuite(scriptId: string): Promise<unknown> {
  try {
    return await apiPatch(`/api/v1/scripts/${scriptId}`, {
      assigned_to: null
    })
  } catch (error) {
    try {
      return await apiDelete(`/api/v1/scripts/${scriptId}/assign`)
    } catch (error2) {
      throw new Error(`Failed to unassign: ${(error as Error).message}`)
    }
  }
}
