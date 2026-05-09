/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft } from 'lucide-react'

function CalibrationScreen({ onBack, onStart, onPreviewStart, cvStatus, cvFrame }) {
  const timerRef = useRef(null)
  const [isMeasuring, setIsMeasuring] = useState(false)
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    void onPreviewStart()

    return () => {
      window.clearInterval(timerRef.current)
    }
  }, [onPreviewStart])

  function handleMeasureClick() {
    if (isMeasuring || !cvFrame) {
      return
    }

    setIsMeasuring(true)
    setCountdown(5)
    void onStart()

    timerRef.current = window.setInterval(() => {
      setCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timerRef.current)
          timerRef.current = null
          return 0
        }

        return current - 1
      })
    }, 1000)
  }

  return (
    <main className="measure-frame">
      <button className="icon-button measure-back" onClick={onBack} aria-label="뒤로 가기">
        <ArrowLeft size={28} />
      </button>

      <header className="measure-title">
        <h1>바른 자세 측정</h1>
        <p>카메라 정면을 보고 자세를 바르게 해주세요</p>
      </header>

      <section className="camera-box">
        {cvFrame ? <img className="cv-frame" src={cvFrame} alt="" /> : null}
        <div className="webcam-pill">
          <i />
          {cvFrame ? '웹캠 켜짐' : '웹캠 준비중'}
        </div>
        {!cvFrame ? (
          <div className="pose-guide">
            <span />
            <strong />
          </div>
        ) : null}
      </section>

      <button
        className="measure-button"
        onClick={handleMeasureClick}
        disabled={isMeasuring || !cvFrame}
      >
        {isMeasuring ? '측정 중입니다' : '자세 측정하기'}
      </button>

      <div className={`countdown ${isMeasuring ? 'active' : ''}`}>{countdown}</div>
      <p className="measure-help">{isMeasuring ? '초 후 측정이 완료됩니다' : cvStatus}</p>
    </main>
  )
}

export default CalibrationScreen
