export function ChatbotFeatureSelect({ onOpenSpeak, onOpenTalk }) {
  return (
    <section className="tab-stack chatbot-choice-screen" aria-labelledby="chatbot-choice-title">
      <div className="chatbot-choice-hero">
        <div className="chatbot-bot-visual" aria-hidden="true">
          <span className="chatbot-bot-head">AI</span>
          <span className="chatbot-bot-dots">•••</span>
        </div>
        <h2 id="chatbot-choice-title">AI 챗봇</h2>
        <p>어떤 도움이 필요하신가요?</p>
      </div>

      <div className="chatbot-choice-grid" role="list">
        <button
          className="chatbot-choice-card speak-card"
          type="button"
          aria-label="대신말하기 화면으로 이동"
          onClick={onOpenSpeak}
        >
          <span className="chatbot-choice-icon" aria-hidden="true">
            <MessageIcon />
          </span>
          <span>
            <strong>대신말하기</strong>
            <small>내 말을 대신 전해주세요</small>
          </span>
          <span className="chatbot-choice-arrow" aria-hidden="true">›</span>
        </button>

        <button
          className="chatbot-choice-card talk-card"
          type="button"
          aria-label="AI에게 묻기 화면으로 이동"
          onClick={onOpenTalk}
        >
          <span className="chatbot-choice-icon" aria-hidden="true">
            <SearchIcon />
          </span>
          <span>
            <strong>AI에게 묻기</strong>
            <small>정보를 찾아드려요</small>
          </span>
          <span className="chatbot-choice-arrow" aria-hidden="true">›</span>
        </button>
      </div>

      <div className="chatbot-wake-area">
        <button
          className="chatbot-wake-button"
          type="button"
          aria-label="챗봇 음성 호출로 시작"
          onClick={onOpenTalk}
        >
          <MicrophoneIcon />
        </button>
        <p>‘챗봇 켜줘’라고 말하면 바로 시작해요.</p>
      </div>
    </section>
  )
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v4A3.5 3.5 0 0 1 15.5 14h-3.7L7 18v-4.1a3.5 3.5 0 0 1-2-3.2z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M10.5 4a6.5 6.5 0 0 1 5.16 10.45l3.45 3.44-1.42 1.42-3.44-3.45A6.5 6.5 0 1 1 10.5 4zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z" />
    </svg>
  )
}

function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M12 3a3 3 0 0 0-3 3v5a3 3 0 1 0 6 0V6a3 3 0 0 0-3-3z" />
      <path d="M6 10.5h2A4 4 0 0 0 16 11v-.5h2v.5a6 6 0 0 1-5 5.92V20h3v2H8v-2h3v-3.08A6 6 0 0 1 6 11z" />
    </svg>
  )
}
