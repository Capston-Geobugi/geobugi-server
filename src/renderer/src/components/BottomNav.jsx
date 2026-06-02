/* eslint-disable react/prop-types */
import { CalendarDays, Home, Settings, UsersRound } from 'lucide-react'

function BottomNav({ active, onHome, onReport, onSocial, onSettings }) {
  return (
    <nav className="bottom-nav" aria-label="하단 메뉴">
      <button
        className={active === 'home' ? 'active' : ''}
        type="button"
        onClick={onHome}
        disabled={!onHome}
      >
        <Home size={25} />
        <span>홈</span>
      </button>
      <button className={active === 'report' ? 'active' : ''} type="button" onClick={onReport}>
        <CalendarDays size={25} />
        <span>리포트</span>
      </button>
      <button
        className={active === 'social' ? 'active' : ''}
        type="button"
        onClick={onSocial}
        disabled={!onSocial}
      >
        <UsersRound size={25} />
        <span>소셜</span>
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
