/**
 * `src/input/` 公開介面。渲染層／遊戲迴圈只應該從這個檔案 import，
 * 不要直接深入 import 內部模組——見 `src/input/README.md` 給下一位工程師的完整說明。
 */
export {
  ACTION_IDS,
  BINDINGS_CONFIG,
  defaultBindingsState,
  isBindable,
  isReservedSecondaryCode,
  proposeRebind,
  resolveConflict,
  type ActionBindingConfig,
  type ActionId,
  type BindingsConfig,
  type BindingsState,
  type RebindOutcome,
} from './bindings.js'

export {
  createInputController,
  RESTART_CODE,
  type CreateInputControllerOptions,
  type ContextMenuEvent,
  type ContextMenuTarget,
  type InputController,
  type InputDocumentLike,
  type InputWindowLike,
  type KeyCodeEvent,
  type MouseButtonEvent,
} from './controller.js'

export {
  BINDINGS_STORAGE_KEY,
  deserializeBindings,
  loadBindings,
  saveBindings,
  saveBindingsSafely,
  serializeBindings,
  type StoredBindings,
  type SaveBindingsResult,
} from './settings-storage.js'

export { mountRebindPanel, type RebindPanelHandle } from './rebind-panel.js'

export { assembleTickInput, computeActionStates, computeMoveAxis, type ActionStates } from './input-state.js'
