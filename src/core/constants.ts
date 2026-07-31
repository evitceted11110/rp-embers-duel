/**
 * 固定時間步（tick）長度：0.01 秒（100 tick/秒）。
 *
 * 選擇理由：本作內容數值裡出現的所有時間常數——0.12（精準閃避窗）、0.15（蓄能反震格擋
 * 尾段）、0.28（閃避無敵幀）、0.35/0.5/0.8（三種敵人預兆秒數）、1.1（連擊循環參考值）、
 * 1.5/1.6/2.0/2.2（各印記持續時間／延遲）、4/5/6/8/12/16（冷卻秒數）——全部是 0.01 的
 * 整數倍。用 100Hz 當 tick 長度，`secondsToTicks()` 對這些值永遠得到剛好整除的整數
 * tick 數，不會有四捨五入誤差在不同秒數換算之間累積出「同一個 0.12 秒視窗，在這裡是
 * 12 tick、在那裡卻變成 11 或 13 tick」的隱性 drift——這正是決定性重播最怕的誤差來源。
 *
 * 100Hz 同時夠細：0.12 秒的精準閃避窗（12 tick）與 0.15 秒的格擋尾段（15 tick）在
 * tick 網格上仍是兩個可清楚區分的長度；若改用常見的 60Hz（≈0.0167 秒/tick），0.12s
 * 换算成 7.2 tick，四捨五入已經有誤差；30Hz 這類更粗的網格會讓兩個視窗都落在同一個
 * 整數 tick 上，直接讓「精準閃避窗比格擋尾段窄」這個 spec 明確要求的相對關係在網格上
 * 消失。100Hz 是「所有已知時間常數整除、且仍能分辨最窄的 0.12s 視窗」的最小代價選擇。
 *
 * 渲染層應以 accumulator pattern 呼叫 tick()：累積實際 dt，每滿 TICK_SECONDS 呼叫一次
 * tick()，可自行對渲染輸出做插值平滑；邏輯本身永遠以這個固定步長推進，不受畫面更新率
 * 影響（見 src/core/README.md）。
 */
export const TICK_SECONDS = 0.01

/** 秒數轉換為 tick 數，四捨五入、下限為 0。 */
export function secondsToTicks(seconds: number): number {
  return Math.max(0, Math.round(seconds / TICK_SECONDS))
}

// ---------------------------------------------------------------------------
// 玩家基礎數值（design/spec.md〈玩家角色〉一節；沒有印記改寫時的預設行為）。
// 這些不是印記可覆寫的欄位，content/*.json 也沒有對應欄位——來源是 spec.md 的
// 設計文字，與 sim/prototype.ts 的 BASE_* 常數引用同一段規格文字，但兩邊是各自
// 獨立宣告的常數（core 不 import sim/，因為 sim/ 是 Balance Engineer 的職權範圍）。
// ---------------------------------------------------------------------------
export const PLAYER_MAX_HP = 220
/** 三段普攻基礎傷害（design/spec.md：8/10/16）。keystone 印記均未改寫普攻本身。 */
export const COMBO_DAMAGE: readonly [number, number, number] = [8, 10, 16]
export const BASE_Q_DAMAGE = 12
export const BASE_Q_COOLDOWN_S = 6.0
export const BASE_E_PRIMARY_DAMAGE = 18
export const BASE_E_SECONDARY_DAMAGE = 9
export const BASE_E_COOLDOWN_S = 12.0
export const DODGE_INVINCIBILITY_S = 0.28
export const DODGE_BASE_COOLDOWN_S = 1.1

/**
 * 敵人 `attack_interval_cycles` 的「連擊循環」換算成秒的參考值
 * （design/spec.md：「一次完整連擊約 1.1 秒」）。sim/prototype.ts 的 CYCLE_SECONDS
 * 是同一段規格文字的另一份獨立宣告，兩邊刻意不互相 import，但都指向同一個權威來源。
 */
export const ENEMY_CYCLE_REFERENCE_S = 1.1

// ---------------------------------------------------------------------------
// 三段普攻的逐段時間切割（design/spec.md 只給了「合計約 1.1 秒」與三段各自的傷害，
// 沒有給逐段的 startup/active/連段窗口秒數——把抽象的「連擊循環」模擬展開成真的
// 即時引擎，這些數字必須有人決定）。
//
// 命名對齊 spec.md 原文用語：「連段窗口內輸入，逾時重置為第一段」——下面的
// ATTACK_COMBO_WINDOW_S 就是這個「連段窗口」，同時兼作後搖（此窗口內可被閃避打斷）。
// 三段各自 startup+active+連段窗口 = 0.1+0.07+0.2 = 0.37 秒，三段相連 = 1.11 秒，
// 貼齊 spec.md 的「約 1.1 秒」。此為工程假設，Gate 3 應依真人手感重新校準。
// ---------------------------------------------------------------------------
export const ATTACK_STARTUP_S = 0.1
export const ATTACK_ACTIVE_S = 0.07
export const ATTACK_COMBO_WINDOW_S = 0.2
/** 普攻命中判定半徑（工程假設，content/*.json 與 spec.md 均未規定確切距離）。 */
export const ATTACK_RANGE_UNITS = 1.4

// ---------------------------------------------------------------------------
// 其餘工程假設常數：design/spec.md 的原型模擬（sim/prototype.ts）把整場戰鬥抽象成
// 「連擊循環」計數，完全沒有空間座標、沒有移動速度、沒有攻擊/閃避距離。要做出一個
// 真的有座標、有幾何形狀（印記改寫動作幾何的前提）的即時引擎，這些數字必須有人先
// 決定一個合理值；全部列在這裡集中管理，且在 src/core/README.md 與交付報告中明確
// 標示為「工程假設，非 Designer／Balance Engineer 核定數值，待 Gate 3 真人手感回頭
// 調整」，避免日後有人誤以為這些是設計已核准的正式數值。
// ---------------------------------------------------------------------------
/** 玩家移動速度。介於敵人最快（影刺客 5.0）與最慢（甲衛 1.8）之間，靠近中位數。 */
export const PLAYER_MOVE_SPEED_UNITS_PER_S = 4.0
/** 閃避位移距離（直線或彎曲弧線的兩端距離）。 */
export const DODGE_DISTANCE_UNITS = 3.0
/** 閃避路徑偵測「範圍內是否存在武裝核心」的半徑（僅餘燼核心 keystone 使用）。 */
export const CORE_BEND_DETECTION_RADIUS_UNITS = 5.0
/** 閃避彎曲弧線的彎曲強度：控制點沿「中點→核心」方向偏移的比例。 */
export const CORE_BEND_STRENGTH = 0.5
/** 基礎版 Q（突進斬）位移距離。 */
export const Q_LUNGE_DISTANCE_UNITS = 2.0
/** 基礎版 E 對次要目標的擊退距離。 */
export const E_KNOCKBACK_DISTANCE_UNITS = 1.0
/** 蓄能反震 E（反震衝擊）的 AoE 半徑。 */
export const GUARD_E_RADIUS_UNITS = 3.0
/**
 * 敵人從「接近」轉為「開始攻擊循環」的接戰距離。刻意小於 `ATTACK_RANGE_UNITS`
 * （1.4），讓敵人停下攻擊時已經站在玩家普攻範圍內——否則會出現「敵人停在攻擊距離
 * 之外開始打你，你的普攻卻打不到牠」這種不合理的僵局。
 */
export const ENEMY_ENGAGE_RANGE_UNITS = 1.2
