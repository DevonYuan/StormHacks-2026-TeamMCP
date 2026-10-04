import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NetworkDataProvider } from './data/NetworkData'
import { ThemeProvider } from './theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <NetworkDataProvider>
        <App />
      </NetworkDataProvider>
    </ThemeProvider>
  </StrictMode>
)
