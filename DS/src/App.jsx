import { useState } from 'react'
import { ApplianceSidebar } from './components/layout/ApplianceSidebar'
import { ApplianceScene } from './scenes/ApplianceScene'
import { StatusPanel } from './components/common/StatusPanel'
import { NotificationResult } from './components/common/NotificationResult'
import { useSimulatorController } from './hooks/useSimulatorController'

function App() {
  const [selectedApplianceId, setSelectedApplianceId] = useState('washingMachine')
  const [targetUserId, setTargetUserId] = useState('1')
  const { currentState, latestEvent, notificationResult, busyAction, statusView, actions } =
    useSimulatorController(selectedApplianceId, targetUserId)

  return (
    <div className="sim-app">
      <ApplianceSidebar
        selectedApplianceId={selectedApplianceId}
        targetUserId={targetUserId}
        onChangeUserId={setTargetUserId}
        onSelect={setSelectedApplianceId}
      />

      <main className="sim-main">
        <div className="sim-stage-grid">
          <ApplianceScene applianceId={selectedApplianceId} sceneState={currentState} />

          <StatusPanel
            applianceName={statusView.applianceName}
            powerState={statusView.powerState}
            operatingState={statusView.operatingState}
            modeLabel={statusView.modeLabel}
            statusLines={statusView.statusLines}
            latestEvent={latestEvent}
            notificationResult={notificationResult}
          >
            {selectedApplianceId === 'washingMachine' ? (
              <>
                <div className="button-row">
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.startWashing}>
                    세탁 시작
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.openDoor}>
                    문 열기
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.triggerError}>
                    오류 발생
                  </button>
                </div>
                <div className="button-row">
                  {['표준', '쾌속', '탈수'].map((mode) => (
                    <button key={mode} disabled={Boolean(busyAction)} type="button" onClick={() => actions.changeMode(mode)}>
                      {mode}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {selectedApplianceId === 'airQualitySensor' ? (
              <>
                <div className="button-row">
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.increaseCo2}>
                    CO2 증가
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.increaseFineDust}>
                    미세먼지 증가
                  </button>
                </div>
                <div className="slider-group">
                  <label>
                    <span>온도</span>
                    <input
                      type="range"
                      min="18"
                      max="35"
                      value={currentState.temperature}
                      onChange={(event) => actions.updateTemperature(Number(event.target.value))}
                    />
                  </label>
                  <label>
                    <span>습도</span>
                    <input
                      type="range"
                      min="25"
                      max="80"
                      value={currentState.humidity}
                      onChange={(event) => actions.updateHumidity(Number(event.target.value))}
                    />
                  </label>
                </div>
              </>
            ) : null}

            {selectedApplianceId === 'tv' ? (
              <>
                <div className="button-row">
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.togglePower}>
                    전원
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={() => actions.changeVolume(1)}>
                    볼륨 +
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={() => actions.changeVolume(-1)}>
                    볼륨 -
                  </button>
                </div>
                <div className="button-row">
                  <button disabled={Boolean(busyAction)} type="button" onClick={() => actions.changeChannel(1)}>
                    채널 +
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={() => actions.changeChannel(-1)}>
                    채널 -
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.findRemote}>
                    리모컨 찾기
                  </button>
                </div>
              </>
            ) : null}

            {selectedApplianceId === 'electricRange' ? (
              <>
                <div className="button-row">
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.powerOn}>
                    전원 켜기
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.startCooking}>
                    조리 시작
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.triggerOverheating}>
                    과열 발생
                  </button>
                </div>
                <div className="button-row">
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.turnOff}>
                    전원 끄기
                  </button>
                </div>
              </>
            ) : null}

            {selectedApplianceId === 'doorSensor' ? (
              <>
                <div className="button-row">
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.openDoor}>
                    문 열기
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.awayMode}>
                    외출 모드
                  </button>
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.sleepMode}>
                    취침 모드
                  </button>
                </div>
              </>
            ) : null}

            {selectedApplianceId === 'refrigerator' ? (
              <>
                <div className="button-row">
                  <button disabled={Boolean(busyAction)} type="button" onClick={actions.openDoor}>
                    문 열기
                  </button>
                </div>
                <div className="button-row">
                  {['우유', '계란', '물', '채소'].map((item) => (
                    <button key={item} disabled={Boolean(busyAction)} type="button" onClick={() => actions.findItem(item)}>
                      {item} 찾기
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            <NotificationResult result={notificationResult} />
          </StatusPanel>
        </div>
      </main>
    </div>
  )
}

export default App
