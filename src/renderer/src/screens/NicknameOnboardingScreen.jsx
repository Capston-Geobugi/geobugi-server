/* eslint-disable react/prop-types */
import { XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'

function normalizeNickname(value) {
  return String(value ?? '').replace(/[^A-Za-z가-힣]/g, '').slice(0, 8)
}

function NicknameOnboardingScreen({ initialNickname = '거부기', onSubmit }) {
  const [nickname, setNickname] = useState(() => normalizeNickname(initialNickname) || '거부기')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const isValid = useMemo(() => /^[A-Za-z가-힣]{2,8}$/.test(nickname), [nickname])

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (!isValid) {
      setError('한글/영문 2~8자 이내로 입력해 주세요.')
      return
    }

    setSubmitting(true)

    try {
      await onSubmit({ displayName: nickname })
    } catch (nextError) {
      setError(nextError?.message ?? '닉네임을 저장하지 못했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="app-frame nickname-screen">
      <form className="nickname-panel" onSubmit={(event) => void handleSubmit(event)}>
        <div className="nickname-copy">
          <p>반가워요!</p>
          <h1>뭐라고 불러드릴까요?</h1>
          <span>거부기가 올바른 자세를 코칭해 드릴게요.</span>
        </div>

        <label className="nickname-field">
          <span>닉네임</span>
          <div className={error ? 'invalid' : ''}>
            <input
              type="text"
              value={nickname}
              onChange={(event) => setNickname(normalizeNickname(event.target.value))}
              autoFocus
            />
            {nickname ? (
              <button type="button" onClick={() => setNickname('')} aria-label="닉네임 지우기">
                <XCircle size={23} />
              </button>
            ) : null}
          </div>
          <small>
            <em>한글/영문 2~8자 이내로 입력해 주세요.</em>
            <strong>{nickname.length}/8</strong>
          </small>
        </label>

        {error ? <p className="nickname-error">{error}</p> : null}

        <button className="nickname-submit-button" type="submit" disabled={!isValid || submitting}>
          {submitting ? '저장 중...' : '시작하기'}
        </button>
      </form>
    </main>
  )
}

export default NicknameOnboardingScreen
