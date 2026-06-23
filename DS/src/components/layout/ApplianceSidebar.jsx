import { APPLIANCES } from '../../constants/applianceEvents'

export function ApplianceSidebar({ selectedApplianceId, targetUserId, onChangeUserId, onSelect }) {
  return (
    <aside className="sim-sidebar">
      <div className="sim-sidebar-block">
        <h1>가전 시뮬레이터</h1>
      </div>

      <label className="sim-field">
        <input
          type="text"
          value={targetUserId}
          placeholder="사용자 ID를 입력하세요"
          onChange={(event) => onChangeUserId(event.target.value)}
        />
      </label>

      <nav className="sim-sidebar-nav" aria-label="가전 선택">
        {APPLIANCES.map((appliance) => (
          <button
            key={appliance.id}
            className={selectedApplianceId === appliance.id ? 'sim-nav-button active' : 'sim-nav-button'}
            type="button"
            onClick={() => onSelect(appliance.id)}
          >
            {appliance.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}
