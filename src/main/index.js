// src/main/index.js
import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

import { initDB } from './database/db'
import { registerIpcHandlers } from './ipc/ipcRouter'

// 🌟 추가 1: createWindow 함수의 실제 구현부 (앱 창 크기와 옵션 설정)
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false, // 로딩 전 깜빡임 방지
    autoHideMenuBar: true, // 윈도우 상단 메뉴바 숨기기
    webPreferences: {
      // 보안을 위해 preload.js 연결
      preload: join(__dirname, '../preload/index.js'), 
      sandbox: false
    }
  })

  // 창이 준비되면 화면에 보여주기
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 외부 링크 클릭 시 시스템 기본 브라우저로 열기
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Vite를 이용한 개발 환경/배포 환경 분기 로드
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDB()                 // 1. DB 세팅
  registerIpcHandlers()    // 2. 통신 API 연결
  createWindow()           // 3. 화면 띄우기

  // 🌟 추가 2: macOS 대응 (창이 꺼져도 앱이 실행 중일 때 아이콘 클릭 시 새 창 열기)
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 🌟 추가 3: 모든 창이 닫혔을 때 앱 완전히 끄기 (macOS 제외)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})