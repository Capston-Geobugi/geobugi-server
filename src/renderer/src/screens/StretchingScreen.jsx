/* eslint-disable react/prop-types */
import { ArrowLeft, Play } from 'lucide-react'

function StretchingScreen({ onBack, onComplete }) {
  return (
    <main className="app-frame stretching-screen">
      <header className="stretching-top">
        <button className="icon-button" onClick={onBack} aria-label="뒤로 가기">
          <ArrowLeft size={30} />
        </button>
        <h1>거부기 타임</h1>
      </header>

      <section className="stretching-copy">
        <span>추천</span>
        <h2>
          <b>굳은 어깨를</b>
          <strong>가볍게 풀어볼까요?</strong>
        </h2>
      </section>

      <section className="stretching-media">
        <div>
          <Play size={30} fill="currentColor" />
        </div>
        <strong>어깨 스트레칭 이미지</strong>
        <p>또는 애니메이션 삽입</p>
      </section>

      <section className="stretching-guide">
        <h2>기지개 켜고 좌우로 기울이기</h2>
        <p>양손을 깍지 끼고 위로 쭉 뻗은 뒤, 좌우로 10초씩 천천히 기울여주세요.</p>
      </section>

      <button className="primary-button fixed-action" onClick={onComplete}>
        스트레칭 완료
      </button>
    </main>
  )
}

export default StretchingScreen
