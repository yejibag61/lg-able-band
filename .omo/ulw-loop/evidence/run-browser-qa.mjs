import { spawn } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const root = process.cwd()
const appDir = join(root, 'FE', 'app')
const evidenceDir = join(root, '.omo', 'ulw-loop', 'evidence')
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const userDataDir = join(evidenceDir, 'chrome-profile')
const devUrl = 'http://127.0.0.1:5173'
const remotePort = 9223

await mkdir(evidenceDir, { recursive: true })
await rm(userDataDir, { recursive: true, force: true })

const qaLog = []
let devServer
let chrome

try {
  devServer = spawn(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173', '--strictPort'],
    { cwd: appDir, shell: true, stdio: ['ignore', 'pipe', 'pipe'] },
  )

  devServer.stdout.on('data', (chunk) => qaLog.push(`[vite] ${chunk.toString().trim()}`))
  devServer.stderr.on('data', (chunk) => qaLog.push(`[vite:err] ${chunk.toString().trim()}`))

  await waitForHttp(devUrl)

  chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${remotePort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=375,667',
    devUrl,
  ])

  await waitForHttp(`http://127.0.0.1:${remotePort}/json/version`)
  const target = await openTarget()
  const cdp = await connectCdp(target.webSocketDebuggerUrl)

  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await cdp.send('Page.navigate', { url: devUrl })
  await cdp.waitFor('Page.loadEventFired')
  await sleep(250)

  await assertPage('initial-login', cdp, () => {
    const text = document.body.innerText
    return {
      pass:
        text.includes('Able Band 로그인') &&
        text.includes('사용자') &&
        text.includes('보호자') &&
        text.includes('로그인') &&
        !text.includes('Users Table') &&
        document.documentElement.scrollWidth <= window.innerWidth,
      text,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }
  })

  await runInPage(cdp, () => {
    setInput('input[type="email"]', 'wrong@example.com')
    setInput('input[type="password"]', 'wrong')
    clickTextButton('로그인')
  })
  await sleep(120)
  await assertPage('invalid-login', cdp, () => {
    const text = document.body.innerText
    return {
      pass:
        text.includes('이메일 또는 비밀번호가 올바르지 않습니다.') &&
        text.includes('Able Band 로그인'),
      text,
    }
  })

  await runInPage(cdp, () => {
    setInput('input[type="email"]', 'user@example.com')
    setInput('input[type="password"]', 'password1234')
    clickTextButton('로그인')
  })
  await sleep(180)
  await assertPage('user-home', cdp, () => {
    const text = document.body.innerText
    return {
      pass:
        text.includes('Able Band 홈') &&
        text.includes('현재 위험 알림이 없습니다.') &&
        text.includes('긴급 도움 요청') &&
        text.includes('최근 알림') &&
        document.documentElement.scrollWidth <= window.innerWidth,
      text,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }
  })

  await screenshot(cdp, join(evidenceDir, 'qa-user-home-375x667.png'))

  await cdp.send('Page.navigate', { url: devUrl })
  await cdp.waitFor('Page.loadEventFired')
  await sleep(120)
  await runInPage(cdp, () => {
    document.querySelector('input[value="GUARDIAN"]').click()
    setInput('input[type="email"]', 'guardian@example.com')
    setInput('input[type="password"]', 'password1234')
    clickTextButton('로그인')
  })
  await sleep(180)
  await assertPage('guardian-placeholder', cdp, () => {
    const text = document.body.innerText
    return {
      pass: text.includes('보호자 화면 준비 중') && !text.includes('Able Band 홈'),
      text,
    }
  })

  await screenshot(cdp, join(evidenceDir, 'qa-guardian-375x667.png'))
  await cdp.close()

  await writeFile(join(evidenceDir, 'browser-qa-log.json'), JSON.stringify(qaLog, null, 2), 'utf8')
  console.log(`PASS browser QA. Evidence: ${resolve(evidenceDir)}`)
} finally {
  if (chrome && !chrome.killed) {
    chrome.kill()
  }
  if (devServer && !devServer.killed) {
    devServer.kill()
  }
  await sleep(300)
  await rm(userDataDir, { recursive: true, force: true })
  console.log('cleanup: killed chrome/dev-server; removed chrome profile')
}

async function waitForHttp(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status < 500) {
        return
      }
    } catch {
      await sleep(100)
    }
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function openTarget() {
  const response = await fetch(`http://127.0.0.1:${remotePort}/json/list`)
  const targets = await response.json()
  return targets.find((target) => target.type === 'page')
}

async function connectCdp(url) {
  const socket = new WebSocket(url)
  const pending = new Map()
  const listeners = new Map()
  let nextId = 1

  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) {
        reject(new Error(message.error.message))
      } else {
        resolve(message.result)
      }
      return
    }

    const handlers = listeners.get(message.method) || []
    for (const handler of handlers) {
      handler(message.params)
    }
  })

  return {
    send(method, params = {}) {
      const id = nextId
      nextId += 1
      socket.send(JSON.stringify({ id, method, params }))
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
    },
    waitFor(method) {
      return new Promise((resolve) => {
        const handlers = listeners.get(method) || []
        handlers.push(resolve)
        listeners.set(method, handlers)
      })
    },
    close() {
      socket.close()
    },
  }
}

async function runInPage(cdp, fn) {
  const expression = `(() => {
    ${browserHelpers.toString()};
    browserHelpers();
    return (${fn.toString()})();
  })()`
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })

  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text
    throw new Error(detail)
  }

  return result.result.value
}

async function assertPage(name, cdp, fn) {
  const result = await runInPage(cdp, fn)
  qaLog.push({ scenario: name, ...result })

  if (!result.pass) {
    throw new Error(`Browser QA failed: ${name}`)
  }
}

async function screenshot(cdp, path) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  await writeFile(path, Buffer.from(result.data, 'base64'))
}

function browserHelpers() {
  globalThis.setInput = (selector, value) => {
    const element = document.querySelector(selector)
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }

  globalThis.clickTextButton = (text) => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === text)
    button.click()
  }
}
