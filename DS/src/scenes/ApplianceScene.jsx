import { Canvas } from '@react-three/fiber'
import { Environment, OrbitControls, RoundedBox, Text } from '@react-three/drei'
import { Suspense } from 'react'

function WashingMachineModel({ state }) {
  return (
    <group>
      <RoundedBox args={[3.2, 3.4, 2.5]} radius={0.12}>
        <meshStandardMaterial color="#f1f4f8" />
      </RoundedBox>
      <mesh position={[0, 0.1, 1.3]} rotation={[0, 0, state.doorOpen ? -0.9 : 0]}>
        <cylinderGeometry args={[0.95, 0.95, 0.14, 48]} />
        <meshStandardMaterial color={state.error ? '#ff8b7b' : '#d7e3f2'} />
      </mesh>
      <mesh position={[0, 0.1, 1.38]} rotation={[Math.PI / 2, 0, state.drumRotation]}>
        <torusGeometry args={[0.46, 0.16, 24, 64]} />
        <meshStandardMaterial color={state.running ? '#6e86a6' : '#8ea2bd'} emissive={state.running ? '#527dd7' : '#000000'} />
      </mesh>
    </group>
  )
}

function RefrigeratorModel({ state }) {
  return (
    <group>
      <RoundedBox args={[2.7, 4.8, 2.1]} radius={0.12}>
        <meshStandardMaterial color="#f7f7f4" />
      </RoundedBox>
      <mesh position={[0.9, 0.2, 1.08]} rotation={[0, state.doorOpen ? -0.75 : 0, 0]}>
        <boxGeometry args={[1.2, 4.2, 0.12]} />
        <meshStandardMaterial color={state.temperatureWarning ? '#ffd2bf' : '#ececeb'} emissive={state.doorOpen ? '#fff1b8' : '#000000'} />
      </mesh>
      {state.highlightShelf ? (
        <mesh position={[0, state.highlightShelf, 0.7]}>
          <boxGeometry args={[1.5, 0.12, 1.2]} />
          <meshStandardMaterial color="#6fc5ff" emissive="#6fc5ff" emissiveIntensity={0.9} />
        </mesh>
      ) : null}
    </group>
  )
}

function DoorSensorModel({ state }) {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[2.4, 4.6, 0.18]} />
        <meshStandardMaterial color="#7f5f4c" />
      </mesh>
      <mesh position={[1.1, 0.2, 0.18]} rotation={[0, state.open ? -0.95 : 0, 0]}>
        <boxGeometry args={[2.1, 4.4, 0.14]} />
        <meshStandardMaterial color="#a77e64" />
      </mesh>
      <mesh position={[1.25, 1.4, 0.22]}>
        <boxGeometry args={[0.15, 0.32, 0.15]} />
        <meshStandardMaterial color={state.warning ? '#ff8c5c' : '#c3d2e7'} emissive={state.warning ? '#ff8c5c' : '#000000'} />
      </mesh>
    </group>
  )
}

function ElectricRangeModel({ state }) {
  return (
    <group>
      <RoundedBox args={[3.6, 0.5, 2.4]} radius={0.08}>
        <meshStandardMaterial color="#20252c" />
      </RoundedBox>
      <mesh position={[0, 0.32, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.12, 48]} />
        <meshStandardMaterial
          color={state.glowColor}
          emissive={state.glowColor}
          emissiveIntensity={state.on ? (state.overheating ? 2.3 : state.residual ? 0.9 : 1.4) : 0}
        />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.82, 0.95, 0.84, 36]} />
        <meshStandardMaterial color="#696f7b" />
      </mesh>
    </group>
  )
}

function TVModel({ state }) {
  return (
    <group>
      <RoundedBox args={[4.3, 2.6, 0.2]} radius={0.08}>
        <meshStandardMaterial color="#101318" />
      </RoundedBox>
      <mesh position={[0, 0, 0.12]}>
        <planeGeometry args={[3.8, 2.15]} />
        <meshStandardMaterial color={state.on ? '#4f85ff' : '#181d24'} emissive={state.on ? '#284bd0' : '#000000'} />
      </mesh>
      <Text position={[0, 0.15, 0.16]} fontSize={0.28} color="#ffffff">
        {state.on ? `CH ${state.channel} · VOL ${state.volume}` : 'OFF'}
      </Text>
      <mesh position={[2.6, -1.2, 0.4]} rotation={[0.25, 0, state.remotePulse ? 0.4 : 0]}>
        <boxGeometry args={[0.45, 1.4, 0.18]} />
        <meshStandardMaterial color={state.remotePulse ? '#ffdf7a' : '#3b4351'} emissive={state.remotePulse ? '#ffdf7a' : '#000000'} />
      </mesh>
    </group>
  )
}

function AirQualitySensorModel({ state }) {
  const warning = state.co2 >= 1500 || state.fineDust >= 80 || state.temperature >= 31 || state.humidity >= 70

  return (
    <group>
      <RoundedBox args={[2, 3, 1.2]} radius={0.18}>
        <meshStandardMaterial color={warning ? '#ffe0d1' : '#f5f7fb'} />
      </RoundedBox>
      <Text position={[0, 0.9, 0.62]} fontSize={0.16} color={warning ? '#d44d26' : '#234'}>
        {`CO₂ ${state.co2} ppm`}
      </Text>
      <Text position={[0, 0.35, 0.62]} fontSize={0.16} color={warning ? '#d44d26' : '#234'}>
        {`${state.temperature}°C · ${state.humidity}%`}
      </Text>
      <Text position={[0, -0.2, 0.62]} fontSize={0.16} color={warning ? '#d44d26' : '#234'}>
        {`미세먼지 ${state.fineDust} μg/m³`}
      </Text>
      {state.fineDust >= 80 ? (
        <mesh position={[0, 0.1, 0]}>
          <sphereGeometry args={[1.6, 24, 24]} />
          <meshStandardMaterial color="#a2a7b4" transparent opacity={0.15} />
        </mesh>
      ) : null}
    </group>
  )
}

function GenericStage({ title }) {
  return (
    <group>
      <RoundedBox args={[3.4, 2.2, 1.6]} radius={0.14}>
        <meshStandardMaterial color="#edf1f7" />
      </RoundedBox>
      <Text position={[0, 0, 0.9]} fontSize={0.26} color="#2b3441">
        {title}
      </Text>
    </group>
  )
}

function SceneContent({ applianceId, sceneState }) {
  switch (applianceId) {
    case 'washingMachine':
      return <WashingMachineModel state={sceneState} />
    case 'refrigerator':
      return <RefrigeratorModel state={sceneState} />
    case 'doorSensor':
      return <DoorSensorModel state={sceneState} />
    case 'electricRange':
      return <ElectricRangeModel state={sceneState} />
    case 'tv':
      return <TVModel state={sceneState} />
    case 'airQualitySensor':
      return <AirQualitySensorModel state={sceneState} />
    default:
      return <GenericStage title="가전을 선택하세요" />
  }
}

export function ApplianceScene({ applianceId, sceneState }) {
  return (
    <div className="scene-shell">
      <Canvas camera={{ position: [0, 1.7, 7.5], fov: 42 }} shadows>
        <color attach="background" args={['#edf2f7']} />
        <ambientLight intensity={1.1} />
        <directionalLight position={[6, 8, 5]} intensity={2} castShadow />
        <Suspense fallback={null}>
          <SceneContent applianceId={applianceId} sceneState={sceneState} />
          <Environment preset="city" />
        </Suspense>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.45, 0]} receiveShadow>
          <planeGeometry args={[24, 24]} />
          <shadowMaterial opacity={0.18} />
        </mesh>
        <OrbitControls enablePan={false} minDistance={5} maxDistance={10} maxPolarAngle={Math.PI / 2.05} />
      </Canvas>
    </div>
  )
}
