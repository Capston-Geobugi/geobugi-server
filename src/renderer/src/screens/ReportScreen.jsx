/* eslint-disable react/prop-types */
import { BarChart3, Dumbbell, Power } from 'lucide-react'

function ReportScreen({ report, score, onBack, onOpenStretching }) {
  const scoreLabel = typeof score === 'number' ? `${score}점` : '--'
  const scoreDelta = typeof score === 'number' ? Math.max(1, score - 78) : 0

  return (
    <main className="app-frame report-screen">
      <header className="report-title">
        <h1>일일 리포트</h1>
        <p>2026년 4월 16일 목요일</p>
      </header>

      <section className="report-card">
        <div className="card-heading">
          <h2>오늘의 자세 추이</h2>
          <strong>{typeof score === 'number' ? `양호 ${score}점` : '데이터 없음'}</strong>
        </div>
        <svg className="chart" viewBox="0 0 300 130" aria-hidden="true">
          <path
            className="chart-fill"
            d="M15 84 C52 88 74 118 108 100 C132 85 133 58 164 56 C196 54 215 44 242 42 C258 41 270 15 288 10 L288 122 L15 122 Z"
          />
          <path
            className="chart-line"
            d="M15 84 C52 88 74 118 108 100 C132 85 133 58 164 56 C196 54 215 44 242 42 C258 41 270 15 288 10"
          />
        </svg>
        <div className="chart-labels">
          <span>09:00</span>
          <span>12:00</span>
          <span>15:00</span>
          <span>18:00</span>
        </div>
      </section>

      <section className="report-card score-card">
        <h2>평균 자세 점수 비교</h2>
        <div className="score-row">
          <div>
            <span>어제</span>
            <b>78점</b>
          </div>
          <em>▲ {scoreDelta}점</em>
          <div>
            <span>오늘</span>
            <strong>{scoreLabel}</strong>
          </div>
        </div>
      </section>

      <section className="report-card review-card">
        <h2>오늘의 자세 평가</h2>
        <div className="review-grid">
          <div className="weak">
            <span>가장 아쉬운 부위</span>
            <strong>어깨</strong>
          </div>
          <div className="time">
            <span>가장 흐트러진 시간대</span>
            <strong>{report?.badEventCount ? '14:00 ~ 15:00' : '없음'}</strong>
          </div>
        </div>
        <p>
          오늘 하루 자세가 가장 아쉬웠던 부위는 어깨이며, 오후 2시경에 집중적으로 자세가
          무너졌습니다.
        </p>
      </section>

      <nav className="bottom-nav">
        <button onClick={onBack}>
          <BarChart3 size={25} />
          <span>월간 리포트</span>
        </button>
        <button onClick={onOpenStretching}>
          <Dumbbell size={25} />
          <span>설정</span>
        </button>
        <button className="danger">
          <Power size={25} />
          <span>종료</span>
        </button>
      </nav>
    </main>
  )
}

export default ReportScreen
