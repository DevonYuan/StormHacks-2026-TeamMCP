import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NetworkDataProvider } from './data/NetworkData'
import { AuthProvider } from './auth/AuthContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <NetworkDataProvider>
        <App />
      </NetworkDataProvider>
    </AuthProvider>
  </StrictMode>
)
