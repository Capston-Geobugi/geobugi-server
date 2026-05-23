/* eslint-disable react/prop-types */
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Info, LoaderCircle, Plus, Trash2, X } from 'lucide-react'

import BottomNav from '../components/BottomNav'
import { geobugiApi } from '../lib/api'

const DEFAULT_SETTINGS = {
  widget: {
    opacity: 1,
    scale: 1
  },
  stretching: {
    intervalMinutes: 60
  }
}

const EMPTY_MODE = {
  name: '',
  userSensitivity: 10
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalizeSettings(settings) {
  return {
    widget: {
      opacity: Number(settings?.widget?.opacity ?? DEFAULT_SETTINGS.widget.opacity),
      scale: Number(settings?.widget?.scale ?? DEFAULT_SETTINGS.widget.scale)
    },
    stretching: {
      intervalMinutes: Number(
        settings?.stretching?.intervalMinutes ?? DEFAULT_SETTINGS.stretching.intervalMinutes
      )
    }
  }
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  leftLabel,
  rightLabel,
  onChange,
  onCommit
}) {
  const progress = ((value - min) / (max - min)) * 100
  const handleCommit = (event) => {
    onCommit?.(Number(event.currentTarget.value))
  }

  return (
    <label className="settings-slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--range-progress': `${progress}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
        onPointerUp={handleCommit}
        onKeyUp={handleCommit}
      />
      <em>
        <small>{leftLabel}</small>
        <small>{rightLabel}</small>
      </em>
    </label>
  )
}

function SettingsScreen({ onBack, onOpenReport, onOpenStretching }) {
  const [modes, setModes] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [newMode, setNewMode] = useState(EMPTY_MODE)
  const [modeFormOpen, setModeFormOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [error, setError] = useState('')

  const activeMode = useMemo(() => modes.find((mode) => mode.isActive) ?? null, [modes])
  const modeNameTooLong = newMode.name.trim().length > 30
  const canCreateMode = newMode.name.trim().length > 0 && !modeNameTooLong && !savingKey

  async function loadSettings() {
    setError('')
    setLoading(true)

    try {
      const [nextModes, nextSettings] = await Promise.all([
        geobugiApi.getSensitivityModes(),
        geobugiApi.getSettings()
      ])

      setModes(Array.isArray(nextModes) ? nextModes : [])
      setSettings(normalizeSettings(nextSettings))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '설정을 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadSettings()

    return geobugiApi.onSettingsChanged((nextSettings) => {
      setSettings(normalizeSettings(nextSettings))
    })
  }, [])

  async function activateMode(modeId) {
    if (activeMode?.id === modeId || savingKey) {
      return
    }

    const previousModes = modes
    setError('')
    setSavingKey(`mode-${modeId}`)
    setModes((currentModes) =>
      currentModes.map((mode) => ({
        ...mode,
        isActive: mode.id === modeId
      }))
    )

    try {
      const activatedMode = await geobugiApi.activateSensitivityMode({ id: modeId })
      setModes((currentModes) =>
        currentModes.map((mode) => ({
          ...mode,
          isActive: mode.id === activatedMode?.id
        }))
      )
    } catch (nextError) {
      setModes(previousModes)
      setError(nextError instanceof Error ? nextError.message : '모드를 변경하지 못했어요.')
    } finally {
      setSavingKey('')
    }
  }

  async function createMode() {
    const name = newMode.name.trim()

    if (!name || modeNameTooLong || savingKey) {
      return
    }

    setError('')
    setSavingKey('create-mode')

    try {
      await geobugiApi.createSensitivityMode({
        name,
        userSensitivity: clamp(newMode.userSensitivity, 1, 20),
        activate: false
      })
      const nextModes = await geobugiApi.getSensitivityModes()
      setModes(Array.isArray(nextModes) ? nextModes : [])
      setNewMode(EMPTY_MODE)
      setModeFormOpen(false)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '새 모드를 추가하지 못했어요.')
    } finally {
      setSavingKey('')
    }
  }

  async function deleteMode(modeId) {
    if (savingKey) {
      return
    }

    const targetMode = modes.find((mode) => mode.id === modeId)

    if (!targetMode || targetMode.isDefault) {
      return
    }

    const previousModes = modes
    setError('')
    setSavingKey(`delete-${modeId}`)
    setModes((currentModes) => currentModes.filter((mode) => mode.id !== modeId))

    try {
      await geobugiApi.deleteSensitivityMode({ id: modeId })
      const nextModes = await geobugiApi.getSensitivityModes()
      setModes(Array.isArray(nextModes) ? nextModes : [])
    } catch (nextError) {
      setModes(previousModes)
      setError(nextError instanceof Error ? nextError.message : '모드를 삭제하지 못했어요.')
    } finally {
      setSavingKey('')
    }
  }

  function updateWidgetDraft(key, value) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      widget: {
        ...currentSettings.widget,
        [key]: value
      }
    }))
  }

  async function commitWidgetSettings() {
    const widget = {
      opacity: clamp(settings.widget.opacity, 0.3, 1),
      scale: clamp(settings.widget.scale, 0.7, 1.4)
    }

    setError('')
    setSavingKey('widget')

    try {
      const nextSettings = await geobugiApi.updateWidgetSettings(widget)
      setSettings(normalizeSettings(nextSettings))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '위젯 설정을 저장하지 못했어요.')
      void loadSettings()
    } finally {
      setSavingKey('')
    }
  }

  async function commitStretchingSettings(
    nextIntervalMinutes = settings.stretching.intervalMinutes
  ) {
    const intervalMinutes = clamp(nextIntervalMinutes, 10, 240)

    setError('')
    setSavingKey('stretching')

    try {
      const nextSettings = await geobugiApi.updateStretchingSettings({ intervalMinutes })
      setSettings(normalizeSettings(nextSettings))
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : '스트레칭 알림 설정을 저장하지 못했어요.'
      )
      void loadSettings()
    } finally {
      setSavingKey('')
    }
  }

  return (
    <main className="app-frame settings-screen">
      <header className="settings-header">
        <button
          className="icon-button settings-back"
          type="button"
          onClick={onBack}
          aria-label="뒤로 가기"
        >
          <ArrowLeft size={28} />
        </button>
        <div>
          <h1>설정</h1>
          <p>내 몸에 꼭 맞는 측정 환경을 만드세요</p>
        </div>
      </header>

      {error ? <p className="settings-error">{error}</p> : null}

      <section className="settings-card mode-card" aria-busy={loading}>
        <div className="settings-card-title">
          <h2>측정 모드 선택</h2>
          <span>총 {modes.length}개</span>
          <div className="mode-card-actions">
            <div className="info-popover-wrap">
              <button className="mode-info-toggle" type="button" aria-label="측정 모드 설명 보기">
                <Info size={18} />
              </button>
              <div className="mode-info-popover" role="tooltip">
                <div>
                  <strong>측정 모드</strong>
                  <p>상황에 맞는 민감도를 저장해두고 빠르게 전환할 수 있어요.</p>
                </div>
                <div>
                  <strong>민감도 범위</strong>
                  <p>민감도는 1부터 20까지 설정할 수 있고, 숫자가 클수록 자세 변화에 민감해요.</p>
                </div>
                <div>
                  <strong>모드 추가</strong>
                  <p>플러스 버튼을 눌러 이름과 민감도를 정한 뒤 새 모드를 추가하세요.</p>
                </div>
                <div>
                  <strong>모드 삭제</strong>
                  <p>
                    휴지통 버튼으로 직접 만든 모드를 삭제할 수 있고, 기본 모드는 삭제할 수 없어요.
                  </p>
                </div>
              </div>
            </div>
            <button
              className="mode-form-toggle"
              type="button"
              aria-label={modeFormOpen ? '새 모드 만들기 닫기' : '새 모드 만들기'}
              onClick={() => setModeFormOpen((isOpen) => !isOpen)}
            >
              {modeFormOpen ? <X size={19} /> : <Plus size={20} />}
            </button>
          </div>
        </div>

        {modeFormOpen ? (
          <div className="mode-create-panel">
            <label className="settings-input">
              <span>모드 이름</span>
              <input
                type="text"
                maxLength={30}
                value={newMode.name}
                placeholder="예: 독서 모드, 휴식 모드 등"
                onChange={(event) =>
                  setNewMode((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <SliderField
              label="민감도 설정"
              min={1}
              max={20}
              value={newMode.userSensitivity}
              leftLabel="둔감"
              rightLabel="민감"
              onChange={(value) =>
                setNewMode((current) => ({ ...current, userSensitivity: value }))
              }
              onCommit={() => {}}
            />
            {modeNameTooLong ? (
              <p className="field-error">모드 이름은 30자 이하로 입력해주세요.</p>
            ) : null}
            <button
              className="primary-button settings-add-button"
              type="button"
              disabled={!canCreateMode}
              onClick={() => void createMode()}
            >
              {savingKey === 'create-mode' ? '추가 중' : '새 모드 추가'}
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="settings-loading">
            <LoaderCircle size={24} />
            <span>불러오는 중</span>
          </div>
        ) : (
          <div className="mode-list">
            {modes.map((mode) => (
              <div key={mode.id} className={`mode-option ${mode.isActive ? 'active' : ''}`}>
                <button
                  className="mode-select-button"
                  type="button"
                  disabled={Boolean(savingKey)}
                  onClick={() => void activateMode(mode.id)}
                >
                  <i>{mode.isActive ? <Check size={18} strokeWidth={4} /> : null}</i>
                  <strong>{mode.name}</strong>
                  <span>민감도: {mode.userSensitivity}</span>
                </button>
                <button
                  className="mode-delete-button"
                  type="button"
                  disabled={mode.isDefault || Boolean(savingKey)}
                  aria-label={`${mode.name} 삭제`}
                  title={mode.isDefault ? '기본 모드는 삭제할 수 없어요' : '모드 삭제'}
                  onClick={(event) => {
                    event.stopPropagation()
                    void deleteMode(mode.id)
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="settings-card settings-panel">
        <div className="settings-card-title">
          <h2>위젯 및 알림 설정</h2>
          <div className="mode-card-actions">
            <div className="info-popover-wrap">
              <button
                className="mode-info-toggle"
                type="button"
                aria-label="위젯 및 알림 설정 설명 보기"
              >
                <Info size={18} />
              </button>
              <div className="mode-info-popover" role="tooltip">
                <div>
                  <strong>투명도</strong>
                  <p>위젯을 더 투명하거나 선명하게 조절해 화면을 가리지 않도록 설정해요.</p>
                </div>
                <div>
                  <strong>거북이 크기</strong>
                  <p>거북이 크기는 0.7배부터 1.4배까지 조절할 수 있어요.</p>
                </div>
                <div>
                  <strong>스트레칭 알림 주기</strong>
                  <p>
                    10분부터 240분까지 설정할 수 있고, 설정한 주기마다 스트레칭 알림에 사용돼요.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <SliderField
          label="투명도"
          min={0.3}
          max={1}
          step={0.05}
          value={settings.widget.opacity}
          leftLabel="투명하게"
          rightLabel="선명하게"
          onChange={(value) => updateWidgetDraft('opacity', value)}
          onCommit={() => void commitWidgetSettings()}
        />
        <SliderField
          label="거북이 크기"
          min={0.7}
          max={1.4}
          step={0.05}
          value={settings.widget.scale}
          leftLabel="작게"
          rightLabel="크게"
          onChange={(value) => updateWidgetDraft('scale', value)}
          onCommit={() => void commitWidgetSettings()}
        />
        <SliderField
          label="스트레칭 알림 주기"
          min={10}
          max={240}
          step={10}
          value={settings.stretching.intervalMinutes}
          leftLabel="10분"
          rightLabel="4시간"
          onChange={(value) =>
            setSettings((currentSettings) => ({
              ...currentSettings,
              stretching: {
                intervalMinutes: value
              }
            }))
          }
          onCommit={(value) => void commitStretchingSettings(value)}
        />
      </section>

      <BottomNav
        active="settings"
        onReport={onOpenReport}
        onStretching={onOpenStretching}
        onSettings={() => {}}
      />
    </main>
  )
}

export default SettingsScreen
