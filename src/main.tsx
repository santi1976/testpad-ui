import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { TestersProvider } from './contexts/TestersContext'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import App from './App'
import TestSuiteDetails from './pages/TestSuiteDetails'
import TestRuns from './pages/TestRuns'
import CreateAndAssign from './pages/CreateAndAssign'
import AssignmentsAndEmail from './pages/AssignmentsAndEmail'
import Dashboard from './pages/Dashboard'
import Settings from './pages/Settings'
import { Toaster } from '@/components/ui/sonner'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TestersProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/test-runs"
              element={
                <ProtectedRoute>
                  <TestRuns />
                </ProtectedRoute>
              }
            />
            <Route
              path="/test-suites"
              element={
                <ProtectedRoute>
                  <App />
                </ProtectedRoute>
              }
            />
            <Route
              path="/test-suite/:scriptName"
              element={
                <ProtectedRoute>
                  <TestSuiteDetails />
                </ProtectedRoute>
              }
            />
            <Route
              path="/create-run"
              element={
                <ProtectedRoute>
                  <CreateAndAssign />
                </ProtectedRoute>
              }
            />
            <Route
              path="/assignments"
              element={
                <ProtectedRoute>
                  <AssignmentsAndEmail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
        </TestersProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
