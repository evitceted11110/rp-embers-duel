import type { AudioDirector } from './director.js'
import type { AudioBus } from './audio-frame.js'

const BUS_LABELS: Record<AudioBus, string> = {
  music: '音樂',
  effects: '效果',
  ui: '介面',
}

const DEFAULT_VOLUMES: Record<AudioBus, number> = {
  music: 0.35,
  effects: 0.7,
  ui: 0.55,
}

export function mountAudioControls(container: HTMLElement, director: AudioDirector): HTMLElement {
  const root = document.createElement('section')
  const title = document.createElement('strong')
  title.textContent = '音訊'
  root.appendChild(title)

  for (const bus of ['music', 'effects', 'ui'] as const) {
    const label = document.createElement('label')
    label.style.display = 'block'
    label.textContent = `${BUS_LABELS[bus]} `
    const input = document.createElement('input')
    input.type = 'range'
    input.min = '0'
    input.max = '1'
    input.step = '0.05'
    input.value = String(DEFAULT_VOLUMES[bus])
    input.setAttribute('aria-label', `${BUS_LABELS[bus]}音量`)
    input.addEventListener('input', () => director.setBusVolume(bus, Number(input.value)))
    label.appendChild(input)
    root.appendChild(label)
  }

  const muteLabel = document.createElement('label')
  muteLabel.style.display = 'block'
  const mute = document.createElement('input')
  mute.type = 'checkbox'
  mute.addEventListener('change', () => director.setMuted(mute.checked))
  muteLabel.appendChild(mute)
  muteLabel.append(' 全部靜音')
  root.appendChild(muteLabel)
  container.appendChild(root)
  return root
}
