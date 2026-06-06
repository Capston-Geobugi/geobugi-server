/* eslint-disable react/prop-types */
import { Check, ChevronLeft, ChevronRight, Copy, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import BottomNav from '../components/BottomNav'
import { geobugiApi } from '../lib/api'
import { getScoreToneClass } from '../lib/scoreTone'

function toLocalIsoDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function formatDuration(totalDurationSec) {
  const totalMinutes = Math.max(0, Math.round(Number(totalDurationSec ?? 0) / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  if (hours > 0) {
    return `${hours}h`
  }

  return `${minutes}m`
}

function formatRelativeTime(value) {
  if (!value) {
    return '기록 없음'
  }

  const timestamp = new Date(value).getTime()
  const now = Date.now()

  if (!Number.isFinite(timestamp)) {
    return '기록 없음'
  }

  const diffMinutes = Math.max(0, Math.round((now - timestamp) / 60000))

  if (diffMinutes < 1) {
    return '방금 전 갱신'
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분 전 갱신`
  }

  const diffHours = Math.round(diffMinutes / 60)

  if (diffHours < 24) {
    return `${diffHours}시간 전 갱신`
  }

  return `${Math.round(diffHours / 24)}일 전 갱신`
}

function normalizeInviteCode(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
}

function getRoomId(room) {
  return room?.id ?? room?.room_id
}

function getNullableScore(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const score = Number(value)
  return Number.isFinite(score) ? score : null
}

function getMeasuredScore(member) {
  const sampleCount = Number(member?.sample_count ?? 0)
  const totalDurationSec = Number(member?.total_duration_sec ?? 0)

  if (sampleCount <= 0 || totalDurationSec <= 0) {
    return null
  }

  return getNullableScore(member?.shared_score) ?? getNullableScore(member?.average_score)
}

const rankBadges = {
  1: { label: '🥇', className: 'gold', ariaLabel: '1등' },
  2: { label: '🥈', className: 'silver', ariaLabel: '2등' },
  3: { label: '🥉', className: 'bronze', ariaLabel: '3등' }
}

function getMemberDisplayName(member, isMe) {
  return member?.display_name || (isMe ? '거부기' : '친구')
}

function RoomMemberCard({ member, currentUserId, rank }) {
  const score = getMeasuredScore(member)
  const hasScore = score !== null
  const isMe = member?.user_id === currentUserId
  const name = getMemberDisplayName(member, isMe)
  const rankBadge = rankBadges[rank]

  return (
    <article className={`group-member-card${isMe ? ' me' : ''}${!hasScore ? ' empty' : ''}`}>
      <div
        className={`group-rank-badge ${rankBadge?.className ?? 'number'}`}
        aria-label={rankBadge?.ariaLabel ?? `${rank}등`}
      >
        {rankBadge?.label ?? rank}
      </div>
      <div className="group-member-copy">
        <div>
          {isMe ? <span>ME</span> : null}
          <strong>{name}</strong>
        </div>
        <p>
          {hasScore
            ? `측정 ${formatDuration(member?.total_duration_sec)} · ${formatRelativeTime(
                member?.score_updated_at
              )}`
            : '측정 기록 없음'}
        </p>
      </div>
      <div className="group-member-score">
        <span>오늘 평균</span>
        <strong className={hasScore ? getScoreToneClass(score) : ''}>
          {hasScore ? `${Math.round(score)}점` : '--점'}
        </strong>
      </div>
    </article>
  )
}

function SocialScreen({
  selectedRoom,
  onSelectRoom,
  onBackToList,
  onOpenHome,
  onOpenReport,
  onOpenSettings
}) {
  const [rooms, setRooms] = useState([])
  const [members, setMembers] = useState([])
  const [profile, setProfile] = useState(null)
  const [inviteCode, setInviteCode] = useState('')
  const [newRoomName, setNewRoomName] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [inviteCodeCopied, setInviteCodeCopied] = useState(false)
  const [error, setError] = useState('')
  const today = useMemo(() => toLocalIsoDate(), [])

  const sortedMembers = useMemo(
    () =>
      [...members].sort((left, right) => {
        const leftScore = getMeasuredScore(left)
        const rightScore = getMeasuredScore(right)

        if (leftScore !== null || rightScore !== null) {
          return (rightScore ?? -1) - (leftScore ?? -1)
        }

        return getMemberDisplayName(left, left.user_id === profile?.remoteUserId).localeCompare(
          getMemberDisplayName(right, right.user_id === profile?.remoteUserId),
          'ko-KR'
        )
      }),
    [members, profile?.remoteUserId]
  )

  const selectedRoomId = getRoomId(selectedRoom)

  const syncTodayScore = useCallback(async () => {
    const daily = await geobugiApi.getDailyReport({ date: today })
    await geobugiApi.syncDailyPostureScore(daily)
  }, [today])

  const loadRooms = useCallback(async () => {
    setError('')
    setLoading(true)

    try {
      const [nextProfile] = await Promise.all([geobugiApi.getProfile(), syncTodayScore()])
      const nextRooms = await geobugiApi.getMyRooms({ date: today })
      setProfile(nextProfile)
      setRooms(nextRooms)
    } catch (nextError) {
      setError(nextError?.message ?? '그룹 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [syncTodayScore, today])

  const loadRoomMembers = useCallback(async () => {
    if (!selectedRoomId) {
      setMembers([])
      return
    }

    setError('')
    setDetailLoading(true)

    try {
      await syncTodayScore()
      const nextMembers = await geobugiApi.getRoomDailyScores({
        roomId: selectedRoomId,
        date: today
      })
      setMembers(nextMembers)
    } catch (nextError) {
      setError(nextError?.message ?? '그룹 점수를 불러오지 못했어요.')
    } finally {
      setDetailLoading(false)
    }
  }, [selectedRoomId, syncTodayScore, today])

  useEffect(() => {
    if (selectedRoomId) {
      void loadRoomMembers()
      return
    }

    void loadRooms()
  }, [loadRoomMembers, loadRooms, selectedRoomId])

  async function handleJoinRoom(event) {
    event.preventDefault()
    const normalizedCode = normalizeInviteCode(inviteCode)

    if (!normalizedCode || submitting) {
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const room = await geobugiApi.joinRoom({ inviteCode: normalizedCode })
      setInviteCode('')
      await loadRooms()
      onSelectRoom(room)
    } catch (nextError) {
      setError(nextError?.message ?? '초대 코드로 입장하지 못했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateRoom(event) {
    event.preventDefault()
    const roomName = newRoomName.trim()

    if (!roomName || submitting) {
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const room = await geobugiApi.createRoom({ name: roomName })
      setNewRoomName('')
      setCreateOpen(false)
      await loadRooms()
      onSelectRoom(room)
    } catch (nextError) {
      setError(nextError?.message ?? '새 그룹을 만들지 못했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyInviteCode() {
    if (!selectedRoom?.invite_code || !navigator.clipboard) {
      return
    }

    await navigator.clipboard.writeText(selectedRoom.invite_code)
    setInviteCodeCopied(true)
    window.setTimeout(() => setInviteCodeCopied(false), 1600)
  }

  if (selectedRoomId) {
    return (
      <main className="app-frame group-screen group-detail-screen">
        <header className="group-detail-header">
          <button className="icon-button" type="button" onClick={onBackToList}>
            <ChevronLeft size={32} />
          </button>
          <h1>그룹 상세</h1>
        </header>

        <section className="group-invite-card">
          <div>
            <h2>{selectedRoom?.name ?? '거부기 그룹'}</h2>
            <p>참여 인원: {sortedMembers.length || selectedRoom?.member_count || 0}명</p>
            <small>생성일: {String(selectedRoom?.created_at ?? '').slice(0, 10) || '-'}</small>
          </div>
          <button
            className={inviteCodeCopied ? 'copied' : ''}
            type="button"
            onClick={copyInviteCode}
          >
            <span>
              {inviteCodeCopied ? '복사됨' : '초대 코드'}
              {inviteCodeCopied ? <Check size={14} /> : <Copy size={14} />}
            </span>
            <strong>{selectedRoom?.invite_code ?? '------'}</strong>
          </button>
        </section>

        <section className="group-member-section">
          <div className="group-section-heading">
            <h2>그룹 멤버</h2>
            <span>총 {sortedMembers.length}명</span>
          </div>

          {error ? <p className="group-error">{error}</p> : null}
          {detailLoading ? <p className="group-empty">점수를 불러오고 있어요.</p> : null}
          {!detailLoading && sortedMembers.length === 0 ? (
            <p className="group-empty">아직 표시할 멤버 점수가 없어요.</p>
          ) : null}
          {sortedMembers.map((member, index) => (
            <RoomMemberCard
              key={member.user_id}
              member={member}
              rank={index + 1}
              currentUserId={profile?.remoteUserId}
            />
          ))}
        </section>

        <BottomNav
          active="social"
          onHome={onOpenHome}
          onReport={onOpenReport}
          onSocial={onBackToList}
          onSettings={onOpenSettings}
        />
      </main>
    )
  }

  return (
    <main className="app-frame group-screen">
      <section className="group-main-content">
        <header className="group-title">
          <h1>거부기 그룹</h1>
          <p>친구들과 함께 바른 자세를 유지해요 🤝</p>
        </header>

        <form className="group-join-form" onSubmit={handleJoinRoom}>
          <label>
            <Search size={21} />
            <input
              type="text"
              value={inviteCode}
              onChange={(event) => setInviteCode(normalizeInviteCode(event.target.value))}
              placeholder="초대 코드 입력..."
              autoCapitalize="characters"
            />
          </label>
          <button type="submit" disabled={!inviteCode || submitting}>
            참여
          </button>
        </form>

        <button className="group-create-button" type="button" onClick={() => setCreateOpen(true)}>
          + 새로운 그룹 만들기
        </button>

        <div className="group-section-heading">
          <h2>참여 중인 그룹</h2>
          <span>{rooms.length}개</span>
        </div>

        {error ? <p className="group-error">{error}</p> : null}
        {loading ? <p className="group-empty">그룹을 불러오고 있어요.</p> : null}
        {!loading && rooms.length === 0 ? (
          <p className="group-empty">참여 중인 그룹이 없어요.</p>
        ) : null}
        <div className="group-list">
          {rooms.map((room) => (
            <button key={room.id} type="button" onClick={() => onSelectRoom(room)}>
              <div>
                <strong>{room.name}</strong>
                <span>👥 {room.member_count ?? 0}명</span>
              </div>
              <ChevronRight size={28} />
            </button>
          ))}
        </div>
      </section>

      {createOpen ? (
        <div className="group-modal-backdrop" role="presentation">
          <form className="group-create-modal" onSubmit={handleCreateRoom}>
            <div>
              <h2>새로운 그룹 만들기</h2>
              <button type="button" onClick={() => setCreateOpen(false)}>
                <X size={25} />
              </button>
            </div>
            <label>
              <span>그룹 이름</span>
              <input
                type="text"
                value={newRoomName}
                onChange={(event) => setNewRoomName(event.target.value.slice(0, 40))}
                placeholder="예) 캡스톤 A팀 화이팅"
                autoFocus
              />
            </label>
            <p>💡 방을 생성하면 친구 초대 코드가 발급됩니다.</p>
            <div className="group-modal-actions">
              <button type="button" onClick={() => setCreateOpen(false)}>
                취소
              </button>
              <button type="submit" disabled={!newRoomName.trim() || submitting}>
                만들기
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <BottomNav
        active="social"
        onHome={onOpenHome}
        onReport={onOpenReport}
        onSocial={() => {}}
        onSettings={onOpenSettings}
      />
    </main>
  )
}

export default SocialScreen
