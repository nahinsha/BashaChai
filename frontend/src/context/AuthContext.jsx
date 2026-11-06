import { useCallback, useEffect, useState } from 'react'
import { AuthContext } from './AuthContextValue.js'
import {
  getCurrentUser,
  hasStoredSession,
  login as loginRequest,
  logout as logoutRequest,
} from '../api.js'

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(() => hasStoredSession() ? 'checking' : 'anonymous')
  const [user, setUser] = useState(null)
  const [sessionExpired, setSessionExpired] = useState(false)

  useEffect(() => {
    let active = true
    const handleExpired = () => {
      if (!active) return
      setUser(null)
      setStatus('anonymous')
      setSessionExpired(true)
    }

    window.addEventListener('basachai:session-expired', handleExpired)
    if (hasStoredSession()) {
      getCurrentUser()
        .then((currentUser) => {
          if (!active) return
          setUser(currentUser)
          setStatus('authenticated')
          setSessionExpired(false)
        })
        .catch(() => {
          if (!active) return
          setUser(null)
          setStatus('anonymous')
        })
    }

    return () => {
      active = false
      window.removeEventListener('basachai:session-expired', handleExpired)
    }
  }, [])

  const signIn = useCallback(async (email, password) => {
    setStatus('checking')
    setSessionExpired(false)
    try {
      await loginRequest(email, password)
      const currentUser = await getCurrentUser()
      setUser(currentUser)
      setStatus('authenticated')
      return currentUser
    } catch (error) {
      setUser(null)
      setStatus('anonymous')
      throw error
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logoutRequest()
    } finally {
      setUser(null)
      setStatus('anonymous')
      setSessionExpired(false)
    }
  }, [])

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser)
    setStatus('authenticated')
  }, [])

  return (
    <AuthContext.Provider value={{ status, user, sessionExpired, signIn, signOut, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}
