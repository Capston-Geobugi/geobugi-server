/* eslint-disable react/prop-types */
import { Dumbbell, Grid2X2, Pause, Play } from 'lucide-react'
import useTurtleController from '../hooks/useTurtleController'
import { useRive, useStateMachineInput } from '@rive-app/react-canvas'

function IdleScreen({
  realtime,
  paused,
  widgetSettings,
  showStretchingReminder,
  onPause,
  onOpenHome,
  onOpenStretching
}) {
  const neckStage = realtime?.neck_stage ?? 1
  const cumulativeScore = realtime?.cumulative_score ?? 0
  const widgetOpacity = Number(widgetSettings?.opacity ?? 1)
  const widgetScale = Number(widgetSettings?.scale ?? 1)
  const { rive, RiveComponent } = useRive({
    src: '/src/assets/turtle.riv',
    stateMachines: 'State Machine 1',
    autoplay: true,
  })
  useTurtleController(rive)
  const neckInput = useStateMachineInput(
    rive,
    'State Machine 1',
    'neck_step'
  )
  if (neckInput) {
    neckInput.value = neckStage
  } 

  return (
    <main className="idle-widget" style={{ opacity: widgetOpacity }}>
      <div className="idle-turtle-zone" style={{ '--widget-scale': widgetScale }}>
        <div className={`idle-controls ${showStretchingReminder ? 'with-stretching' : ''}`}>
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
        {showStretchingReminder ? (
          <button
            className="idle-stretching"
            onClick={onOpenStretching}
            aria-label="스트레칭 알림 열기"
          >
            <Dumbbell size={19} strokeWidth={3.1} />
          </button>
        ) : null}

        <div className="idle-turtle">
          <RiveComponent />
        </div>
      </div>

      <div className="idle-status">
        <strong>{paused ? 'PAUSE' : `${cumulativeScore.toFixed(1)}점`}</strong>
        <span>목 단계 {neckStage}/10</span>
      </div>
    </main>
  )
}

export default IdleScreen
