/* eslint-disable react/prop-types */
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import neckStretch1 from '../assets/neck_1.png'
import neckStretch2 from '../assets/neck_2.png'
import neckStretch3 from '../assets/neck_3.png'
import neckStretch4 from '../assets/neck_4.png'

const neckStretchSteps = [
  {
    title: '턱 당기고 뒤로 젖히기',
    description: '엄지로 턱을 살짝 밀어 올리며 10초간 시선을 위로 향해주세요.',
    durationSeconds: 10,
    image: neckStretch1
  },
  {
    title: '한 손으로 머리 당기기',
    description:
      '한쪽 손을 머리 위로 넘겨 귀 윗부분을 잡고 어깨가 따라오지 않게 주의하며 천천히 당겨주세요.',
    durationSeconds: 10,
    image: neckStretch2
  },
  {
    title: '양손 깍지 끼고 머리 뒤로 넘기기',
    description: '양손을 깍지 껴서 뒤통수에 가볍게 대고 지그시 눌러 턱이 가슴에 닿도록 숙여주세요.',
    durationSeconds: 10,
    image: neckStretch3
  },
  {
    title: '양손 머리 뒤로 깍지 끼고 당기기',
    description: '양손을 깍지 껴서 머리 뒷부분을 감싸고 턱이 가슴을 향하도록 지그시 당겨주세요.',
    durationSeconds: 10,
    image: neckStretch4
  }
]

function StretchingScreen({ onBack, onComplete }) {
  const [stepIndex, setStepIndex] = useState(0)
  const activeStep = neckStretchSteps[stepIndex]
  const [remainingSeconds, setRemainingSeconds] = useState(activeStep.durationSeconds)
  const [timerRunning, setTimerRunning] = useState(false)
  const isLastStep = stepIndex === neckStretchSteps.length - 1
  const progressLabel = useMemo(() => `${stepIndex + 1} / ${neckStretchSteps.length}`, [stepIndex])

  useEffect(() => {
    setRemainingSeconds(activeStep.durationSeconds)
    setTimerRunning(false)
  }, [activeStep])

  useEffect(() => {
    if (!timerRunning || remainingSeconds <= 0) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setRemainingSeconds((currentSeconds) => Math.max(0, currentSeconds - 1))
    }, 1000)

    return () => window.clearTimeout(timerId)
  }, [remainingSeconds, timerRunning])

  useEffect(() => {
    if (remainingSeconds === 0) {
      setTimerRunning(false)
    }
  }, [remainingSeconds])

  function handlePrevious() {
    setStepIndex((currentIndex) => Math.max(0, currentIndex - 1))
  }

  function handleNext() {
    setStepIndex((currentIndex) => Math.min(neckStretchSteps.length - 1, currentIndex + 1))
  }

  return (
    <main className="app-frame stretching-screen">
      <header className="stretching-top">
        <button className="icon-button" onClick={onBack} aria-label="뒤로 가기">
          <ArrowLeft size={30} />
        </button>
        <h1>거부기 타임</h1>
      </header>

      <section className="stretching-copy">
        <h2>
          <b>긴장된 목을</b>
          <strong>천천히 풀어볼까요?</strong>
        </h2>
        <button
          className={remainingSeconds === 0 ? 'stretching-timer done' : 'stretching-timer'}
          type="button"
          onClick={() => {
            if (remainingSeconds === 0) {
              setRemainingSeconds(activeStep.durationSeconds)
            }
            setTimerRunning(true)
          }}
          aria-label={
            timerRunning ? `남은 시간 ${remainingSeconds}초` : '스트레칭 타이머 시작'
          }
        >
          {timerRunning || remainingSeconds === 0 ? (
            <>
              <strong>{remainingSeconds}</strong>
              <span>초</span>
            </>
          ) : (
            <strong>시작</strong>
          )}
        </button>
      </section>

      <section className="stretching-media">
        <img src={activeStep.image} alt={`${activeStep.title} 자세`} />
      </section>

      <section className="stretching-guide">
        <h2>{activeStep.title}</h2>
        <p>{activeStep.description}</p>
      </section>

      <nav className="stretching-step-nav" aria-label="스트레칭 단계 이동">
        <button onClick={handlePrevious} disabled={stepIndex === 0} aria-label="이전 동작">
          <ChevronLeft size={22} />
        </button>
        <strong>{progressLabel}</strong>
        <button onClick={handleNext} disabled={isLastStep} aria-label="다음 동작">
          <ChevronRight size={22} />
        </button>
      </nav>

      {isLastStep && (
        <button className="stretching-complete-button" onClick={onComplete}>
          스트레칭 완료
        </button>
      )}
    </main>
  )
}

export default StretchingScreen
