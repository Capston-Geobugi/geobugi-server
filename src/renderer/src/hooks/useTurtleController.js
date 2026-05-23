import { useEffect } from 'react'

export default function useTurtleController(rive) {

  useEffect(() => {

    if (!rive) return

    const inputs = rive.stateMachineInputs('State Machine 1')

    const armTrigger = inputs.find(
      i => i.name === 'arm_trigger'
    )

    const legTrigger = inputs.find(
      i => i.name === 'leg_trigger'
    )

    const tailTrigger = inputs.find(
      i => i.name === 'tail_trigger'
    )

    let timeoutId

    function playRandomIdle() {

      // 4~9초 랜덤 대기
      const delay = 4000 + Math.random() * 5000

      timeoutId = setTimeout(() => {

        // 행동 확률 차등
        const random = Math.random()

        if (random < 0.5) {
          tailTrigger?.fire()
        }
        else if (random < 0.8) {
          armTrigger?.fire()
        }
        else {
          legTrigger?.fire()
        }

        // 다음 행동 예약
        playRandomIdle()

      }, delay)
    }

    // 시작
    playRandomIdle()

    return () => {
      clearTimeout(timeoutId)
    }

  }, [rive])
}