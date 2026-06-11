const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const apiUrlInput = document.querySelector("#apiUrl");
const startBtn = document.querySelector("#startBtn");
const stopBtn = document.querySelector("#stopBtn");
const sendBtn = document.querySelector("#sendBtn");
const userText = document.querySelector("#userText");
const statusText = document.querySelector("#statusText");
const answerText = document.querySelector("#answerText");
const intentText = document.querySelector("#intentText");
const actionText = document.querySelector("#actionText");
const backendText = document.querySelector("#backendText");
const jsonText = document.querySelector("#jsonText");

let recognition = null;

function makeDemoContext() {
  return {
    unreadAlerts: [
      {
        id: 101,
        deviceType: "WASHER",
        title: "세탁 완료",
        message: "세탁이 완료되었습니다.",
        severity: "LOW",
      },
    ],
    dangerAlerts: [
      {
        id: 201,
        deviceType: "RANGE",
        title: "주방 위험 알림",
        message: "인덕션이 오래 켜져 있습니다.",
        severity: "HIGH",
      },
    ],
    recentAlert: {
      id: 101,
      deviceType: "WASHER",
      title: "세탁 완료",
      message: "세탁이 완료되었습니다.",
    },
    lastSpokenAlert: {
      id: 102,
      deviceType: "REFRIGERATOR",
      title: "냉장고 문 열림",
      message: "냉장고 문이 열려 있습니다.",
    },
    devices: {
      washer: { status: "RUNNING", remainingMinutes: 12 },
      refrigerator: { doorOpen: true, temperatureStatus: "NORMAL" },
      airSensor: { airQuality: "GOOD", ventilationNeeded: false },
      tv: { hasPopup: false },
      range: { powerOn: true, longOn: true },
      doorSensor: { doorOpen: false, securityEvent: false },
    },
  };
}

function setStatus(message) {
  statusText.textContent = message;
}

function speak(text) {
  if (!("speechSynthesis" in window)) {
    setStatus("TTS를 지원하지 않는 브라우저입니다.");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ko-KR";
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

async function sendToChatbot(text) {
  const apiUrl = apiUrlInput.value.trim();
  const payload = {
    sessionId: "web-demo",
    text,
    language: "ko-KR",
    user: {
      userId: 1,
      name: "민수",
      accessibilityType: "VISUAL",
      guardianLinked: true,
    },
    context: makeDemoContext(),
  };

  setStatus("챗봇에 요청 중...");
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status}`);
  }

  return response.json();
}

function renderResponse(data) {
  answerText.textContent = data.answerText || data.voiceText || "응답 문장이 없습니다.";
  intentText.textContent = data.intent || "-";
  actionText.textContent = data.action || "-";
  backendText.textContent = data.needsBackendAction ? JSON.stringify(data.backendAction) : "필요 없음";
  jsonText.textContent = JSON.stringify(data, null, 2);
  speak(data.voiceText || data.answerText);
}

async function handleSend() {
  const text = userText.value.trim();
  if (!text) {
    setStatus("먼저 문장을 말하거나 입력해 주세요.");
    return;
  }

  try {
    const data = await sendToChatbot(text);
    renderResponse(data);
    setStatus("응답 완료");
  } catch (error) {
    setStatus(error.message);
    answerText.textContent = "챗봇 서버 연결을 확인해 주세요.";
  }
}

function setupRecognition() {
  if (!SpeechRecognition) {
    startBtn.disabled = true;
    setStatus("이 브라우저는 Web Speech API 음성 인식을 지원하지 않습니다. Chrome 사용을 권장합니다.");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    setStatus("듣는 중...");
    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join("");
    userText.value = transcript;

    const lastResult = event.results[event.results.length - 1];
    if (lastResult.isFinal) {
      setStatus("음성 인식 완료");
      handleSend();
    }
  };

  recognition.onerror = (event) => {
    setStatus(`음성 인식 오류: ${event.error}`);
  };

  recognition.onend = () => {
    startBtn.disabled = false;
    stopBtn.disabled = true;
  };
}

startBtn.addEventListener("click", () => {
  if (recognition) {
    recognition.start();
  }
});

stopBtn.addEventListener("click", () => {
  if (recognition) {
    recognition.stop();
  }
});

sendBtn.addEventListener("click", handleSend);

document.querySelectorAll("[data-sample]").forEach((button) => {
  button.addEventListener("click", () => {
    userText.value = button.dataset.sample;
    handleSend();
  });
});

setupRecognition();
