'use client'
import { useState } from 'react'
import { createBrowserClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createBrowserClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('メールアドレスまたはパスワードが正しくありません')
      setLoading(false)
      return
    }

    // router.pushではなくwindow.locationで強制的に遷移
    window.location.href = '/expenses'
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#f8fafc', padding: '16px'
    }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: '#2563eb', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <span style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>T</span>
          </div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 4px' }}>
            タイ駐在員事務所
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>運営管理システム</p>
        </div>

        <form onSubmit={handleLogin} style={{
          background: 'white', borderRadius: '16px',
          border: '1px solid #e2e8f0', padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b', display: 'block', marginBottom: '6px' }}>
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%', height: '40px', border: '1px solid #cbd5e1',
                borderRadius: '8px', padding: '0 12px', fontSize: '14px',
                boxSizing: 'border-box', outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b', display: 'block', marginBottom: '6px' }}>
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%', height: '40px', border: '1px solid #cbd5e1',
                borderRadius: '8px', padding: '0 12px', fontSize: '14px',
                boxSizing: 'border-box', outline: 'none'
              }}
            />
          </div>

          {error && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '8px', padding: '10px 12px',
              fontSize: '14px', color: '#dc2626', marginBottom: '16px'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            style={{
              width: '100%', height: '40px', background: loading ? '#93c5fd' : '#2563eb',
              color: 'white', border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#94a3b8', marginTop: '16px' }}>
          アカウントはSupabaseで管理されています
        </p>
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'
