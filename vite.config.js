import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Helper function to rewrite cookies for localhost
  function rewriteCookiesForLocalhost(proxyRes) {
    const setCookie = proxyRes.headers['set-cookie']
    if (setCookie) {
      proxyRes.headers['set-cookie'] = setCookie.map(cookie => {
        return cookie
          // Remove Domain attribute
          .replace(/;\s*Domain=[^;]*/gi, '')
          // Remove Secure attribute
          .replace(/;\s*Secure/gi, '')
          // Change SameSite to Lax
          .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
          .replace(/;\s*SameSite=Strict/gi, '; SameSite=Lax')
          // Ensure path is root
          .replace(/;\s*Path=[^;]*/gi, '; Path=/')
      })
      console.log('[PROXY] Rewritten cookies:', proxyRes.headers['set-cookie'])
    }
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'https://api.testpad.com',
          changeOrigin: true,
          secure: true
        },
        '/app-proxy': {
          target: 'https://app.testpad.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/app-proxy/, ''),
          configure: (proxy, options) => {
            proxy.on('proxyRes', (proxyRes, req, res) => {
              rewriteCookiesForLocalhost(proxyRes)
            })
          }
        },
        '/web-proxy': {
          target: 'https://bitfinex.testpad.com',
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/web-proxy/, ''),
          configure: (proxy, options) => {
            proxy.on('proxyRes', (proxyRes, req, res) => {
              rewriteCookiesForLocalhost(proxyRes)
            })
          }
        }
      }
    },
    define: {
      'import.meta.env.VITE_PASSWORD_TESTPAD': JSON.stringify(
        env.PASSWORD_TESTPAD || process.env.PASSWORD_TESTPAD || ''
      ),
      'import.meta.env.VITE_USER_TESTPAD': JSON.stringify(
        env.USER_TESTPAD || process.env.USER_TESTPAD || ''
      )
    }
  }
})
