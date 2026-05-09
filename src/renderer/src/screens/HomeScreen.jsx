/* eslint-disable react/prop-types */
import { Activity, BarChart3, Dumbbell, Power } from 'lucide-react'

import turtleImage from '../assets/geobugi-turtle.png'

function HomeScreen({ hasCalibration, score, onMeasure, onReport, onStretching }) {
  const scoreLabel = typeof score === 'number' ? `${score}점` : '--'

  return (
    <main className="app-frame home-screen">
      <section className="home-hero">
        <div className="home-copy">
          <span className="chip">Geobugi</span>
          <h1>오늘의 자세 점수</h1>
          <strong>{scoreLabel}</strong>
          <p>
            {hasCalibration
              ? '실시간 자세 측정을 시작할 수 있어요.'
              : '먼저 바른 자세를 측정해주세요.'}
          </p>
        </div>
        <img className="turtle-image" src={turtleImage} alt="" />
      </section>

      <section className="home-card">
        <Activity size={24} />
        <div>
          <span>측정 상태</span>
          <strong>{hasCalibration ? '기준 자세 저장 완료' : '초기 측정 필요'}</strong>
        </div>
      </section>

      <div className="home-actions">
        <button className="primary-button" onClick={onMeasure}>
          자세 측정하기
        </button>
        <button className="secondary-button" onClick={onStretching}>
          거부기 타임
        </button>
      </div>

      <nav className="bottom-nav">
        <button onClick={onReport}>
          <BarChart3 size={25} />
          <span>월간 리포트</span>
        </button>
        <button onClick={onStretching}>
          <Dumbbell size={25} />
          <span>설정</span>
        </button>
        <button className="danger" type="button">
          <Power size={25} />
          <span>종료</span>
        </button>
      </nav>
    </main>
  )
}

export default HomeScreen
