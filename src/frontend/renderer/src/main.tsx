import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { NetworkDataProvider } from './data/NetworkData'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NetworkDataProvider>
      <App />
    </NetworkDataProvider>
  </StrictMode>
)
