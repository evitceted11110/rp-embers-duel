/**
 * 最小可用的重綁設定面板：純 DOM、無框架，直接用真實的 `window`/`document`
 * 全域物件（不像 `controller.ts` 那樣走可注入的最小介面）——因為這個檔案本來就
 * 只在瀏覽器裡跑，沒有需要在無頭環境測試的理由。
 *
 * 刻意不為這個檔案寫測試：所有「邏輯」（衝突偵測、swap/override/cancel 處置、
 * 禁綁鍵驗證、版本化保存）都在 `bindings.ts` / `settings-storage.ts`，兩者都有
 * 完整測試；這裡只是把那些純函式接到按鈕點擊與畫面文字，沿用
 * `src/render/main.ts` 對「DOM 接線本身不特別測試」的既有慣例。使用
 * `window.prompt`/`window.alert` 是刻意的最小化——Vertical Slice 要驗的是手感與
 * 印記可讀性，不是設定選單的美觀度；能觸發、能看到結果即可。
 */
import type { PlatformSdk } from '@rogue-paradise/platform-sdk'
import { BINDINGS_CONFIG, proposeRebind, resolveConflict, type ActionId, type BindingsState } from './bindings.js'
import type { InputController } from './controller.js'
import { saveBindingsSafely } from './settings-storage.js'

const ACTION_LABELS: Record<ActionId, string> = {
  moveUp: '上移',
  moveDown: '下移',
  moveLeft: '左移',
  moveRight: '右移',
  attack: '攻擊',
  dodge: '閃避',
  skillQ: '戰技一（Q）',
  skillE: '戰技二（E）',
}

export type RebindPanelHandle = {
  dispose(): void
}

export function mountRebindPanel(
  container: HTMLElement,
  controller: InputController,
  sdk: Pick<PlatformSdk, 'storage'>,
): RebindPanelHandle {
  const config = BINDINGS_CONFIG
  let capturing: ActionId | null = null

  const root = document.createElement('div')
  container.appendChild(root)

  function render(): void {
    root.replaceChildren()
    const bindings = controller.getBindings()
    for (const action of config.actions) {
      const row = document.createElement('div')
      const label = document.createElement('span')
      label.textContent = `${ACTION_LABELS[action.id]}：${bindings[action.id] ?? '（未綁定）'}`
      const button = document.createElement('button')
      button.textContent = capturing === action.id ? '請按下新鍵…' : '重新綁定'
      button.addEventListener('click', () => {
        capturing = action.id
        render()
      })
      row.appendChild(label)
      row.appendChild(button)
      root.appendChild(row)
    }
  }

  async function commit(bindings: BindingsState): Promise<void> {
    controller.setBindings(bindings)
    render()
    const result = await saveBindingsSafely(sdk, bindings)
    if (!result.ok) {
      window.alert('鍵位已在本局套用，但無法保存；重新整理後會回復先前設定。')
    }
  }

  function applyCapturedCode(actionId: ActionId, code: string): void {
    const outcome = proposeRebind(controller.getBindings(), actionId, code, config)

    if (outcome.status === 'rejected') {
      window.alert(
        outcome.reason === 'non-bindable'
          ? `「${code}」是系統保留鍵，不能綁定。`
          : `「${code}」保留給方向鍵移動備援，不能綁定給其他動作。`,
      )
      render()
      return
    }

    if (outcome.status === 'applied') {
      void commit(outcome.bindings)
      return
    }

    // conflict：一律明確要求玩家選擇，不得靜默覆蓋（bindings.json 的
    // silent_rebind_allowed: false）。
    const conflictLabel = outcome.conflictingActionIds.map((id) => ACTION_LABELS[id]).join('、')
    const choice = window.prompt(
      `「${code}」目前綁定給「${conflictLabel}」。輸入 swap（交換）/ override（覆蓋）/ cancel（取消）：`,
      'cancel',
    )
    const resolution = choice === 'swap' || choice === 'override' ? choice : 'cancel'
    void commit(resolveConflict(controller.getBindings(), actionId, code, outcome.conflictingActionIds, resolution))
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (capturing === null) return
    event.preventDefault()
    const actionId = capturing
    capturing = null
    applyCapturedCode(actionId, event.code)
  }

  const onMouseDown = (event: MouseEvent): void => {
    if (capturing === null) return
    event.preventDefault()
    const actionId = capturing
    capturing = null
    applyCapturedCode(actionId, `Mouse${event.button}`)
  }

  // 擷取模式中允許右鍵（Mouse2）被綁定，而不是跳出瀏覽器右鍵選單。
  const onContextMenu = (event: MouseEvent): void => {
    if (capturing !== null) event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown, { capture: true })
  window.addEventListener('mousedown', onMouseDown, { capture: true })
  window.addEventListener('contextmenu', onContextMenu)

  render()

  return {
    dispose(): void {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('mousedown', onMouseDown, { capture: true })
      window.removeEventListener('contextmenu', onContextMenu)
      root.remove()
    },
  }
}
