import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import './student-features.css'
import './upgrades.css'
import App from './App.tsx'

const baseFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  const token = localStorage.getItem('bp_token')
  const headers = new Headers(init?.headers)
  if (token && !url.includes('/api/auth/login')) headers.set('Authorization', `Bearer ${token}`)
  if (init?.body && typeof init.body !== 'string' && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  return baseFetch(input, { ...init, headers })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)