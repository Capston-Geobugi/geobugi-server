/* eslint-disable react-hooks/immutability, react/prop-types */
import { useEffect } from 'react'
import { useRive, useStateMachineInput } from '@rive-app/react-canvas'

import useTurtleController from '../hooks/useTurtleController'

import turtleRiv from '../assets/turtle.riv?url'
import BottomNav from '../components/BottomNav'
import { getScoreToneClass } from '../lib/scoreTone'

function HomeScreen({
  hasCalibration,
  displayName,
  score,
  scoreTitle = '오늘의 평균 자세 점수',
  onMeasure,
  onStartWidget,
  onReport,
  onSocial,
  onSettings,
  neckStage
}) {
  const greetingName = String(displayName ?? '').trim() || '거부기'
  const hasScore = typeof score === 'number'
  const scoreToneClass = getScoreToneClass(score)
  const scoreValueLabel = hasScore ? Math.round(score) : '--'
  const statusLabel = hasCalibration ? '기준 자세 저장 완료' : '기준 자세 측정 필요'
  const statusMark = hasCalibration ? '✓' : '!'
  const { rive, RiveComponent } = useRive({
    src: turtleRiv,
    stateMachines: 'State Machine 1',
    autoplay: true
  })

  const neckInput = useStateMachineInput(rive, 'State Machine 1', 'neck_step')

  useEffect(() => {
    if (!neckInput) return

    neckInput.value = neckStage ?? 1
  }, [neckInput, neckStage])

  useTurtleController(rive)

  return (
    <main className="app-frame home-screen">
      <div className="home-main-content">
        <header className="home-greeting">
          <h1>
            <span>안녕하세요,</span>
            <br />
            {greetingName}
            <span>님. 🐢</span>
          </h1>
        </header>

        <section className="home-score-summary" aria-label={scoreTitle}>
          <span>{scoreTitle}</span>
          <strong className={scoreToneClass}>
            {scoreValueLabel}
            <em>점</em>
          </strong>
        </section>

        <div className="turtle-image" aria-hidden="true">
          <RiveComponent />
        </div>

        <div className={`home-status-pill ${hasCalibration ? 'complete' : 'needed'}`}>
          <span>{statusMark}</span>
          {statusLabel}
        </div>

        <div className="home-actions">
          {hasCalibration ? (
            <>
              <button className="primary-button" onClick={onStartWidget}>
                거부기 위젯 시작하기
              </button>
              <button className="secondary-button" onClick={onMeasure}>
                기준 자세 다시 측정하기
              </button>
            </>
          ) : (
            <button className="primary-button" onClick={onMeasure}>
              자세 측정하기
            </button>
          )}
        </div>
      </div>

      <BottomNav
        active="home"
        onHome={() => {}}
        onReport={onReport}
        onSocial={onSocial}
        onSettings={onSettings}
      />
    </main>
  )
}

export default HomeScreen
