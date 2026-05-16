/* eslint-disable react/prop-types */
import { BarChart3, Dumbbell, Settings } from 'lucide-react'

function BottomNav({ active, onReport, onStretching, onSettings }) {
  return (
    <nav className="bottom-nav" aria-label="하단 메뉴">
      <button className={active === 'report' ? 'active' : ''} type="button" onClick={onReport}>
        <BarChart3 size={25} />
        <span>리포트</span>
      </button>
      <button
        className={active === 'stretching' ? 'active' : ''}
        type="button"
        onClick={onStretching}
      >
        <Dumbbell size={25} />
        <span>거부기 타임</span>
      </button>
      <button
        className={active === 'settings' ? 'active' : ''}
        type="button"
        onClick={onSettings}
        disabled={!onSettings}
      >
        <Settings size={25} />
        <span>설정</span>
      </button>
    </nav>
  )
}

export default BottomNav
