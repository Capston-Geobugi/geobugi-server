/* eslint-disable react/prop-types */
import { Activity } from 'lucide-react'

import useTurtleController from '../hooks/useTurtleController'
import { useRive } from '@rive-app/react-canvas'
import turtleRiv from '../assets/turtle.riv'

import BottomNav from '../components/BottomNav'

function HomeScreen({ hasCalibration, score, onMeasure, onReport, onStretching, onSettings }) {
  const scoreLabel = typeof score === 'number' ? `${score}점` : '--'
  const hasScore = typeof score === 'number'
  const { rive, RiveComponent } = useRive({
    src: '/src/assets/turtle.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
  })
  useTurtleController(rive)

  return (
    <main className="app-frame home-screen">
      <section className="home-hero">
        <div className="home-copy">
          <span className="chip">Geobugi</span>
          <h1>실시간 자세 점수</h1>
          <strong>{scoreLabel}</strong>
          <p>
            {hasScore
              ? '실시간 자세 점수가 기록되고 있어요.'
              : hasCalibration
                ? '실시간 자세 측정을 시작할 수 있어요.'
                : '먼저 바른 자세를 측정해주세요.'}
          </p>
        </div>
        <div className="turtle-image">
          <RiveComponent />
        </div>
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

      <BottomNav onReport={onReport} onStretching={onStretching} onSettings={onSettings} />
    </main>
  )
}

export default HomeScreen
