/* eslint-disable react/prop-types */
import { Dumbbell, Pause, Play, Power } from 'lucide-react'
import useTurtleController from '../hooks/useTurtleController'
import { useRive, useStateMachineInput } from '@rive-app/react-canvas'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { geobugiApi } from '../lib/api'

const RIVE_LEFT_VISUAL_TRIM_RATIO = 0.18
const RIVE_RIGHT_VISUAL_TRIM_RATIO = 0.18

function IdleScreen({
  realtime,
  paused,
  widgetSettings,
  showStretchingReminder,
  onPause,
  onClose,
  onOpenHome,
  onOpenStretching,
  onToggleFlip
}) {
  const neckStage = realtime?.neck_stage ?? 1
  const widgetOpacity = Number(widgetSettings?.opacity ?? 1)
  const widgetScale = Number(widgetSettings?.scale ?? 1)
  const widgetFlipped = Boolean(widgetSettings?.flipX)
  const controlsTopPercent = Math.max(0, 6 - (widgetScale - 1) * 20)
  const [controlsVisible, setControlsVisible] = useState(false)
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const [turtleMenu, setTurtleMenu] = useState(null)
  const [modes, setModes] = useState([])
  const [savingModeId, setSavingModeId] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [riveBounds, setRiveBounds] = useState(null)
  const turtleZoneRef = useRef(null)
  const turtleRef = useRef(null)
  const hideControlsTimerRef = useRef(null)
  const dragStateRef = useRef(null)
  const dragMoveFrameRef = useRef(null)
  const longPressTimerRef = useRef(null)
  const suppressClickRef = useRef(false)
  const { rive, RiveComponent } = useRive({
    src: '/src/assets/turtle.riv',
    stateMachines: 'State Machine 1',
    shouldDisableRiveListeners: true,
    autoplay: true
  })
  useTurtleController(rive)
  const neckInput = useStateMachineInput(rive, 'State Machine 1', 'neck_step')
  if (neckInput) {
    neckInput.value = neckStage
  }
  const smoothNeckRef = useRef(neckStage)
  useEffect(() => {
    let animationFrame

    function animate() {
      if (!neckInput) return

      const current = smoothNeckRef.current
      const target = neckStage

      // 부드럽게 따라가게
      const next = current + (target - current) * 0.03

      smoothNeckRef.current = next

      neckInput.value = next

      animationFrame = requestAnimationFrame(animate)
    }

    animate()

    return () => cancelAnimationFrame(animationFrame)
  }, [neckInput, neckStage])

  useEffect(() => {
    return () => {
      window.clearTimeout(hideControlsTimerRef.current)
      window.clearTimeout(longPressTimerRef.current)
      window.cancelAnimationFrame(dragMoveFrameRef.current)
    }
  }, [])

  useLayoutEffect(() => {
    const zoneElement = turtleZoneRef.current
    const turtleElement = turtleRef.current

    if (!zoneElement || !turtleElement) {
      return undefined
    }

    function updateRiveBounds() {
      const zoneRect = zoneElement.getBoundingClientRect()
      const turtleRect = turtleElement.getBoundingClientRect()
      const baseWidth = turtleRect.width / Math.max(widgetScale, 1)
      const centerX = turtleRect.left - zoneRect.left + turtleRect.width / 2

      setRiveBounds({
        left: centerX - baseWidth / 2,
        right: centerX + baseWidth / 2
      })
    }

    updateRiveBounds()

    const resizeObserver = new ResizeObserver(updateRiveBounds)
    resizeObserver.observe(zoneElement)
    resizeObserver.observe(turtleElement)
    window.addEventListener('resize', updateRiveBounds)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateRiveBounds)
    }
  }, [widgetScale])

  useEffect(() => {
    if (!turtleMenu) {
      return undefined
    }

    function closeTurtleMenu() {
      setTurtleMenu(null)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeTurtleMenu()
      }
    }

    window.addEventListener('pointerdown', closeTurtleMenu)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', closeTurtleMenu)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [turtleMenu])

  function showControls() {
    window.clearTimeout(hideControlsTimerRef.current)
    setControlsVisible(true)
  }

  function hideControlsSoon() {
    window.clearTimeout(hideControlsTimerRef.current)
    hideControlsTimerRef.current = window.setTimeout(() => {
      if (!modeMenuOpen) {
        setControlsVisible(false)
      }
    }, 140)
  }

  function keepControlsVisibleIfOpen() {
    if (controlsVisible) {
      window.clearTimeout(hideControlsTimerRef.current)
    }
  }

  async function toggleModeMenu() {
    const nextOpen = !modeMenuOpen
    showControls()
    setModeMenuOpen(nextOpen)

    if (nextOpen) {
      const nextModes = await geobugiApi.getSensitivityModes()
      setModes(Array.isArray(nextModes) ? nextModes : [])
    }
  }

  async function activateMode(modeId) {
    setSavingModeId(modeId)

    try {
      const activatedMode = await geobugiApi.activateSensitivityMode({ id: modeId })
      setModes((currentModes) =>
        currentModes.map((mode) => ({
          ...mode,
          isActive: mode.id === activatedMode?.id
        }))
      )
      setModeMenuOpen(false)
    } finally {
      setSavingModeId(null)
    }
  }

  async function handleTurtlePointerDown(event) {
    if (event.button !== 0) {
      return
    }

    const pointerId = event.pointerId
    const target = event.currentTarget
    const startScreenX = event.screenX
    const startScreenY = event.screenY
    const startClientX = event.clientX
    const startClientY = event.clientY

    target.setPointerCapture(pointerId)
    dragStateRef.current = {
      pointerId,
      startScreenX,
      startScreenY,
      startClientX,
      startClientY,
      startBounds: null,
      visualInsets: null,
      nextX: null,
      nextY: null,
      moved: false
    }

    const bounds = await geobugiApi.getIdleWindowBounds()
    if (dragStateRef.current?.pointerId === pointerId) {
      dragStateRef.current.startBounds = bounds
      const turtleRect = target.getBoundingClientRect()
      dragStateRef.current.visualInsets = {
        left: turtleRect.left + turtleRect.width * RIVE_LEFT_VISUAL_TRIM_RATIO,
        top: turtleRect.top,
        right:
          window.innerWidth - turtleRect.right + turtleRect.width * RIVE_RIGHT_VISUAL_TRIM_RATIO,
        bottom: window.innerHeight - turtleRect.bottom
      }
    }

    window.clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = window.setTimeout(() => {
      const dragState = dragStateRef.current

      if (!dragState || dragState.pointerId !== pointerId || dragState.moved) {
        return
      }

      suppressClickRef.current = true
      openTurtleMenuAt(startClientX, startClientY)
    }, 520)
  }

  function scheduleIdleWindowMove() {
    if (dragMoveFrameRef.current) {
      return
    }

    dragMoveFrameRef.current = window.requestAnimationFrame(() => {
      dragMoveFrameRef.current = null
      const dragState = dragStateRef.current

      if (dragState?.nextX == null || dragState?.nextY == null) {
        return
      }

      void geobugiApi.moveIdleWindow({
        x: dragState.nextX,
        y: dragState.nextY,
        visualInsets: dragState.visualInsets
      })
    })
  }

  function handleTurtlePointerMove(event) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId || !dragState.startBounds) {
      return
    }

    const deltaX = event.screenX - dragState.startScreenX
    const deltaY = event.screenY - dragState.startScreenY

    if (!dragState.moved && Math.hypot(deltaX, deltaY) < 6) {
      return
    }

    window.clearTimeout(longPressTimerRef.current)
    dragState.moved = true
    dragState.nextX = dragState.startBounds.x + deltaX
    dragState.nextY = dragState.startBounds.y + deltaY
    suppressClickRef.current = true

    if (!isDragging) {
      setIsDragging(true)
      setControlsVisible(false)
      setModeMenuOpen(false)
    }

    scheduleIdleWindowMove()
  }

  function handleTurtlePointerUp(event) {
    const dragState = dragStateRef.current

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }

    window.clearTimeout(longPressTimerRef.current)

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    if (dragState.nextX != null && dragState.nextY != null) {
      void geobugiApi.moveIdleWindow({
        x: dragState.nextX,
        y: dragState.nextY,
        visualInsets: dragState.visualInsets
      })
    }

    dragStateRef.current = null
    setIsDragging(false)
  }

  function handleTurtleClick(event) {
    if (suppressClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      suppressClickRef.current = false
      return
    }

    onOpenHome()
  }

  function openTurtleMenuAt(clientX, clientY) {
    const zoneRect = turtleZoneRef.current?.getBoundingClientRect()

    if (!zoneRect) {
      return
    }

    setControlsVisible(false)
    setModeMenuOpen(false)
    setTurtleMenu({
      x: Math.min(Math.max(clientX - zoneRect.left, 8), zoneRect.width - 128),
      y: Math.min(Math.max(clientY - zoneRect.top, 8), zoneRect.height - 48)
    })
  }

  function handleTurtleContextMenu(event) {
    event.preventDefault()
    openTurtleMenuAt(event.clientX, event.clientY)
  }

  async function handleToggleFlip() {
    setTurtleMenu(null)
    await onToggleFlip()
  }

  return (
    <main className="idle-widget">
      <div
        ref={turtleZoneRef}
        className={`idle-turtle-zone ${controlsVisible ? 'controls-visible' : ''} ${
          widgetFlipped ? 'flipped' : ''
        }`}
        style={{
          '--widget-scale': widgetScale,
          '--widget-opacity': widgetOpacity,
          '--idle-controls-top': `${controlsTopPercent}%`,
          '--rive-left': riveBounds ? `${riveBounds.left}px` : undefined,
          '--rive-right': riveBounds ? `${riveBounds.right}px` : undefined
        }}
      >
        <div
          ref={turtleRef}
          className={`idle-turtle ${isDragging ? 'dragging' : ''} ${
            widgetFlipped ? 'flipped' : ''
          }`}
          onPointerEnter={showControls}
          onPointerLeave={hideControlsSoon}
          onPointerDown={(event) => void handleTurtlePointerDown(event)}
          onPointerMove={handleTurtlePointerMove}
          onPointerUp={handleTurtlePointerUp}
          onPointerCancel={handleTurtlePointerUp}
          onContextMenu={handleTurtleContextMenu}
          onClick={handleTurtleClick}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpenHome()
            }
          }}
          aria-label="홈 화면 열기"
        >
          <div className="idle-turtle-art">
            <RiveComponent />
          </div>
        </div>

        {turtleMenu ? (
          <div
            className="idle-turtle-menu"
            style={{ left: turtleMenu.x, top: turtleMenu.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => void handleToggleFlip()}>
              {widgetFlipped ? '좌우 반전 해제' : '좌우 반전'}
            </button>
          </div>
        ) : null}

        <div
          className={`idle-controls ${showStretchingReminder ? 'with-stretching' : ''}`}
          onPointerEnter={keepControlsVisibleIfOpen}
          onPointerLeave={() => {
            if (controlsVisible && !modeMenuOpen) {
              hideControlsSoon()
            }
          }}
        >
          {showStretchingReminder ? (
            <button
              className="idle-stretching"
              onClick={onOpenStretching}
              aria-label="스트레칭 알림 열기"
            >
              <Dumbbell size={19} strokeWidth={3.1} />
            </button>
          ) : null}
          <button className="idle-menu" onClick={onClose} aria-label="자세 측정 종료">
            <Power size={21} strokeWidth={3.2} />
          </button>
          <button
            className={`idle-mode ${modeMenuOpen ? 'active' : ''}`}
            onClick={() => void toggleModeMenu()}
            aria-label="측정 모드 선택"
            aria-expanded={modeMenuOpen}
          >
            <span className="idle-mode-label">M</span>
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

        {modeMenuOpen ? (
          <div
            className="idle-mode-menu"
            onPointerEnter={showControls}
            onPointerLeave={() => {
              setModeMenuOpen(false)
              setControlsVisible(false)
            }}
          >
            {modes.map((mode) => (
              <button
                key={mode.id}
                className={mode.isActive ? 'active' : ''}
                type="button"
                disabled={savingModeId === mode.id}
                onClick={() => void activateMode(mode.id)}
              >
                <span>{mode.name}</span>
                <small>{mode.userSensitivity}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  )
}

export default IdleScreen
