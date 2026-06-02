/* eslint-disable react/prop-types */
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useEffect, useState } from 'react'

function AuthScreen({ mode, notice, onModeChange, onSubmit }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const isLogin = mode === 'login'
  const title = isLogin ? (
    <>
      안녕하세요,
      <br />
      다시 만나서 반가워요! 🐢
    </>
  ) : (
    '회원가입'
  )
  const subtitle = isLogin
    ? '계정 정보를 입력하고 계속해주세요.'
    : '계정을 생성하고 바른 자세를 시작해 보세요.'
  const passwordPlaceholder = isLogin ? '••••••••' : '영문, 숫자 포함 8자 이상'

  useEffect(() => {
    setPassword('')
    setPasswordVisible(false)
    setError('')
  }, [mode])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!email.trim() || !password) {
      setError('이메일과 비밀번호를 입력해주세요.')
      return
    }

    if (!isLogin && password.length < 8) {
      setError('비밀번호는 8자 이상 입력해주세요.')
      return
    }

    setSubmitting(true)

    try {
      await onSubmit({ email: email.trim(), password })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '인증 처리에 실패했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="app-frame auth-screen">
      <form className="auth-panel" onSubmit={(event) => void handleSubmit(event)}>
        <div className="auth-copy">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <div className="auth-fields">
          <label className="auth-field">
            <span>이메일 주소</span>
            <div>
              <Mail size={22} />
              <input
                type="email"
                value={email}
                placeholder="example@email.com"
                autoComplete="email"
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>비밀번호</span>
            <div>
              <Lock size={22} />
              <input
                type={passwordVisible ? 'text' : 'password'}
                value={password}
                placeholder={passwordPlaceholder}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                onChange={(event) => setPassword(event.target.value)}
              />
              {isLogin ? (
                <button
                  className="auth-password-toggle"
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  {passwordVisible ? <EyeOff size={21} /> : <Eye size={21} />}
                </button>
              ) : null}
            </div>
          </label>
        </div>

        {notice ? <p className="auth-notice">{notice}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <button className="auth-submit-button" type="submit" disabled={submitting}>
          {submitting ? '처리 중' : isLogin ? '로그인' : '가입 완료하기'}
        </button>

        {isLogin ? (
          <button className="auth-link-button" type="button" onClick={() => onModeChange('signup')}>
            이메일로 회원가입
          </button>
        ) : (
          <>
            <p className="auth-terms">가입 시 이용약관 및 개인정보 처리방침에 동의하게 됩니다.</p>
            <button className="auth-link-button" type="button" onClick={() => onModeChange('login')}>
              이미 계정이 있어요
            </button>
          </>
        )}
      </form>
    </main>
  )
}

export default AuthScreen
