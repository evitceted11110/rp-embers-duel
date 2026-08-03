import { describe, expect, it, vi } from 'vitest'
import { createRun } from '../core/index.js'
import { createAudioDirector, type AudioBackend } from './director.js'

function fakeBackend(): AudioBackend {
  return {
    resume: vi.fn(async () => {}),
    play: vi.fn(),
    setMusicLayers: vi.fn(),
    setBusVolume: vi.fn(),
    setMuted: vi.fn(),
    setTimeScale: vi.fn(),
    dispose: vi.fn(),
  }
}

describe('createAudioDirector', () => {
  it('首次互動 unlock 前不建立 AudioContext backend 或播放', async () => {
    const backend = fakeBackend()
    const factory = vi.fn(() => backend)
    const director = createAudioDirector(factory)
    const initial = createRun('audio-director')

    director.handleState(initial, {
      ...initial,
      tick: 1,
      events: [{ type: 'dodgeStart', precision: false, bent: false }],
    })
    expect(factory).not.toHaveBeenCalled()

    await director.unlock()
    expect(factory).toHaveBeenCalledOnce()
    expect(backend.resume).toHaveBeenCalledOnce()
  })

  it('支援 music/effects/ui 三匯流排與總靜音', async () => {
    const backend = fakeBackend()
    const director = createAudioDirector(() => backend)
    await director.unlock()
    vi.mocked(backend.setBusVolume).mockClear()

    director.setBusVolume('music', 0.25)
    director.setBusVolume('effects', 0.5)
    director.setBusVolume('ui', 0.75)
    director.setMuted(true)

    expect(backend.setBusVolume).toHaveBeenNthCalledWith(1, 'music', 0.25)
    expect(backend.setBusVolume).toHaveBeenNthCalledWith(2, 'effects', 0.5)
    expect(backend.setBusVolume).toHaveBeenNthCalledWith(3, 'ui', 0.75)
    expect(backend.setMuted).toHaveBeenCalledWith(true)
  })

  it('解鎖後把事件 cue 與動態層送到 backend', async () => {
    const backend = fakeBackend()
    const director = createAudioDirector(() => backend)
    const previous = createRun('audio-playback')
    await director.unlock()

    director.handleState(previous, {
      ...previous,
      tick: 1,
      events: [{ type: 'playerBlocked' }],
    })

    expect(backend.play).toHaveBeenCalledWith(expect.objectContaining({ id: 'player-blocked', bus: 'effects' }))
    expect(backend.setMusicLayers).toHaveBeenCalled()
  })

  it('慢動作時間倍率直接同步到音訊 backend', async () => {
    const backend = fakeBackend()
    const director = createAudioDirector(() => backend)
    await director.unlock()
    vi.mocked(backend.setTimeScale).mockClear()

    director.setTimeScale(0.45)
    director.setTimeScale(1)

    expect(backend.setTimeScale).toHaveBeenNthCalledWith(1, 0.45)
    expect(backend.setTimeScale).toHaveBeenNthCalledWith(2, 1)
  })
})
