import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { RuntimeLoader } from '@rive-app/react-canvas'

import App from './App'

import riveWasm from './assets/rive.wasm?url'

RuntimeLoader.setWasmUrl(riveWasm)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)