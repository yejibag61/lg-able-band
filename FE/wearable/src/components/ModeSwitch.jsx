const modes = [
  { id: 'alert', label: '알림' },
  { id: 'uwb', label: '내 가전' },
  { id: 'idle', label: 'AI' },
]

export function ModeSwitch({ activeMode, onModeChange }) {
  return (
    <nav className="mode-switch" aria-label="웨어러블 화면 전환">
      {modes.map((mode) => (
        <button
          className={activeMode === mode.id ? 'mode-button active' : 'mode-button'}
          key={mode.id}
          type="button"
          aria-pressed={activeMode === mode.id}
          onClick={() => onModeChange(mode.id)}
        >
          {mode.label}
        </button>
      ))}
    </nav>
  )
}
