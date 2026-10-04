import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NetworkDataProvider } from './data/NetworkData'
import { AuthProvider } from './auth/AuthContext'
import { ThemeProvider } from './theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <NetworkDataProvider>
          <App />
        </NetworkDataProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
)
