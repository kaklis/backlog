import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LockGate } from './components/LockGate'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LockGate>
      <App />
    </LockGate>
  </StrictMode>,
)

// offline support; only in production builds so the dev server is never served stale files
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
}
