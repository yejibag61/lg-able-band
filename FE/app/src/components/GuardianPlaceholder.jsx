export function GuardianPlaceholder({ account, onLogout }) {
  return (
    <main className="phone-screen placeholder-screen">
      <p className="eyebrow">Guardian</p>
      <h1>보호자 화면 준비 중</h1>
      <section className="soft-card">
        <p className="card-label">로그인 계정</p>
        <h2>{account.name}</h2>
        <p>보호자 위험 알림과 이력 확인 화면은 다음 단계에서 연결합니다.</p>
      </section>
      <button className="secondary-button" type="button" onClick={onLogout}>
        로그인으로 돌아가기
      </button>
    </main>
  )
}
