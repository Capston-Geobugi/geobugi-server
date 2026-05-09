/* eslint-disable react/prop-types */
import { Grid2X2, Pause, Play } from 'lucide-react'

import turtleImage from '../assets/geobugi-turtle.png'

function IdleScreen({ realtime, paused, onPause, onOpenHome }) {
  const neckStage = realtime?.neck_stage ?? 1
  const cumulativeScore = realtime?.cumulative_score ?? 0

  return (
    <main className="idle-widget">
      <div className="idle-controls">
        <button className="idle-menu" onClick={onOpenHome} aria-label="홈 화면 열기">
          <Grid2X2 size={21} />
        </button>
        <button
          className="idle-pause"
          onClick={onPause}
          aria-label={paused ? '촬영 재개' : '촬영 중단'}
        >
          {paused ? (
            <Play size={19} fill="currentColor" />
          ) : (
            <Pause size={19} fill="currentColor" />
          )}
        </button>
      </div>

      <div className="idle-turtle" style={{ '--neck-stage': neckStage }}>
        <img src={turtleImage} alt="" />
      </div>

      <div className="idle-status">
        <strong>{paused ? 'PAUSE' : `${cumulativeScore.toFixed(1)}점`}</strong>
        <span>목 단계 {neckStage}/10</span>
      </div>
    </main>
  )
}

export default IdleScreen
