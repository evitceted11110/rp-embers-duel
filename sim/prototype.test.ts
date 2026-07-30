import { describe, expect, it } from 'vitest'
import {
  runOnce,
  runPrototype,
  runSeedWithSchool,
  validateContent,
  type MarkId,
  type SchoolId,
} from './prototype.js'
import { createRng } from '@rogue-paradise/rng'
import { simulate } from '@rogue-paradise/sim'

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length
}

// 出現率（有沒有機會被選）不等於效用（選了之後有沒有真的常常觸發）。
// 這兩枚印記過去觸發率過低，根因彼此不同——且處置方式也不同：一枚是真的內容數值
// 缺陷（已修好），另一枚是本原型模擬能力的已知限制（無法修好，只能登記）。
//
// - 雙核共振：前置條件（兩枚核心同時武裝）本身每局只發生 ≈1.6 次——瓶頸在 Q 冷卻(5s)
//   ＋武裝延遲(2s)疊加，第一枚核心幾乎總在第二枚武裝前就被閃避引爆。這是內容數值層級
//   的設計問題。Gate 2 修訂（2026-07-30）已修正：chain_probability_pct 40→100（移除
//   連鎖本身的不確定性），並新增雙核共振專屬的縮短 Q 冷卻（5→2 秒），讓兩核的武裝時間差
//   大幅縮小。修正後每局觸發次數回升到 ≈15.3（見下方 3000 局回歸測試量測），已脫離
//   「結構性窄視窗」分類，回歸下方主要的「印記健康度回歸測試」統一用 HEALTHY_FLOOR
//   檢查，不再需要白名單。
// - 餘波護盾：原型的自動施放 AI 只要 guardStacks > 0 且冷卻好就會自動施放 E 並清空層數，
//   約 45% 的「蓄能滿 3 層」視窗在被任何攻擊判定考驗前就先被 AI 自動清空，導致觸發率
//   偏低（≈1.08 次／局）。Designer 一度依此重新設計印記本身（改為 E 後機率觸發部分格擋），
//   但 Studio Head 審閱後駁回：(1) 那個設計讓 changes_actions:['dodge'] 變成假 metadata
//   （實際只改受擊傷害，不再改閃避）；(2) 那個設計是機率×減傷的純數值印記，牴觸「沒有一枚
//   是純數值印記」的招牌主張；(3) 校準出來的兩個折扣數字是為了同時湊出「觸發率≥3」與
//   「不擊穿勝率門檻」反推出來的指標驅動結果，不是設計驅動。Studio Head 的判斷：真正的
//   根因是**原型 AI 缺乏「屏住層數」這個策略選項**（模型限制），不是印記設計自我衝突——
//   真人玩家可以自主選擇「屏住 3 層換格擋保底」或「層數>0 就先花掉換傷害」，這正是這枚
//   印記要創造的操作張力。因此餘波護盾**還原為原始設計**（滿 3 層必定完全格擋），
//   觸發率因此也還原為 ≈1.08 次／局，低於 3 次／局的健康門檻——這是預期中、可接受的
//   結果，代表「此印記的實際效用無法由本原型驗證，需 Gate 3 真人試玩量測」，而不是靠
//   重新設計印記本身去湊出綠燈。
//
// 因此白名單只剩餘波護盾一枚（登記為「已知的原型 AI 限制」，不是「已知的窄視窗設計」）；
// 下方用長度斷言鎖住白名單不能被默默加長（例如未來有新印記觸發率崩壞時，不能只是把它
// 塞進白名單掩蓋問題，而必須重新診斷根因是內容缺陷還是模型限制）。
const KNOWN_STRUCTURALLY_NARROW_MARKS: MarkId[] = ['aftershock-shield']

const TOTAL_ENCOUNTERS = 7 // 6 場非 Boss 遭遇戰 + 1 場 Boss 戰，對齊 zones.json
const ALL_MARK_IDS: MarkId[] = [
  'ember-core',
  'cracking-flame-combo',
  'twin-core-resonance',
  'ember-sacrifice',
  'precision-afterimage',
  'pursuit-strike',
  'phantom-reset',
  'shadow-harvest',
  'charged-retaliation',
  'aftershock-shield',
  'mirror-plating',
  'bulwark-chain',
]
const KEYSTONE_BY_SCHOOL: Record<SchoolId, MarkId> = {
  ember: 'ember-core',
  shadow: 'precision-afterimage',
  guard: 'charged-retaliation',
}

describe('餘燼決鬥場 Gate 2 原型', () => {
  it('內容只有合法的十二枚印記、三種敵人＋Boss、三個戰區', () => {
    expect(validateContent()).toEqual([])
  })

  it('同 seed 產生完全相同的單局與批次結果', () => {
    expect(runOnce(createRng('same-run'))).toEqual(runOnce(createRng('same-run')))
    expect(runPrototype(500, 'same-seed')).toEqual(runPrototype(500, 'same-seed'))
  })

  it('每一局選取的印記不會重複，且遵守 requires／slot 互斥規則', () => {
    const summary = runPrototype(800, 'no-duplicate-marks')
    for (const buildSignature of Object.keys(summary.winningBuildFrequency)) {
      const [, marksPart] = buildSignature.split(':')
      const markList = marksPart === undefined || marksPart === '' ? [] : marksPart.split('+')
      expect(new Set(markList).size).toBe(markList.length)
    }
  })

  it('三個流派在相同 seed 下產生不同的印記觸發特徵', () => {
    const schools: SchoolId[] = ['ember', 'shadow', 'guard']
    const results = schools.map((school) => runSeedWithSchool('decision-probe', school))
    expect(new Set(results.map((result) => result.buildSignature)).size).toBe(3)
    expect(
      results.find((result) => result.schoolAffinity === 'ember')?.markTriggers['ember-core'],
    ).toBeGreaterThanOrEqual(0)
    expect(
      results.find((result) => result.schoolAffinity === 'shadow')?.markTriggers[
        'precision-afterimage'
      ],
    ).toBeGreaterThanOrEqual(0)
    expect(
      results.find((result) => result.schoolAffinity === 'guard')?.markTriggers[
        'charged-retaliation'
      ],
    ).toBeGreaterThanOrEqual(0)
  })

  it('沒有非法遭遇組成，且能完成多局模擬並回報三流派與十二印記', () => {
    const summary = runPrototype(1500)
    expect(summary.runs).toBe(1500)
    expect(Object.keys(summary.schoolWinRate)).toHaveLength(3)
    expect(Object.keys(summary.winningMarkInclusionRate)).toHaveLength(12)
    expect(Object.keys(summary.markTriggerCount)).toHaveLength(12)
    expect(summary.legalContentViolations).toEqual([])
    expect(summary.winRate).toBeGreaterThanOrEqual(0)
    expect(summary.winRate).toBeLessThanOrEqual(1)
  })

  it('中型樣本維持 Gate 2 平衡目標區間', () => {
    const summary = runPrototype(6000, 'gate-2-structure')
    const schoolRates = Object.values(summary.schoolWinRate)

    expect(summary.winRate).toBeGreaterThanOrEqual(0.4)
    expect(summary.winRate).toBeLessThanOrEqual(0.65)
    expect(Math.max(...schoolRates) - Math.min(...schoolRates)).toBeLessThanOrEqual(0.15)
    expect(
      Math.min(...Object.values(summary.winningMarkInclusionRate)),
    ).toBeGreaterThanOrEqual(0.1)
    expect(summary.topFiveBuildShare).toBeLessThanOrEqual(0.65)
    expect(Object.values(summary.markTriggerCount).every((count) => count > 0)).toBe(true)
    expect(summary.timeStats.p10).toBeGreaterThanOrEqual(13 * 60 * 1000)
    expect(summary.timeStats.p90).toBeLessThanOrEqual(21 * 60 * 1000)
  })

  it('沒有被抽中的印記，其觸發次數必須恆為 0（回歸測試：曾發生餘燼核心計時器只 push 從未遞減，導致三枚裂焰印記觸發次數恆為 0 的 bug，此測試反過來守住「未選取＝不可能觸發」這個更根本的不變量）', () => {
    for (let i = 0; i < 400; i += 1) {
      const result = runOnce(createRng(`unselected-marks-zero-${i}`))
      for (const markId of ALL_MARK_IDS) {
        if (!result.selected.includes(markId)) {
          expect(result.markTriggers[markId]).toBe(0)
        }
      }
    }
  })

  it('三個流派在大樣本下真的產生可區分的決策與戰鬥過程，而非退化成同一套數值換皮（對應 design/spec.md 揭露的 0.56pp 流派勝率差是否代表模型退化的疑慮）', () => {
    const schools: SchoolId[] = ['ember', 'shadow', 'guard']
    const SAMPLE = 1500

    const bySchool = Object.fromEntries(
      schools.map((school) => [
        school,
        Array.from({ length: SAMPLE }, (_, i) =>
          runSeedWithSchool(`decision-profile-${school}-${i}`, school),
        ),
      ]),
    ) as Record<SchoolId, ReturnType<typeof runSeedWithSchool>[]>

    const avgKeystoneTrigger = (affinity: SchoolId, keystoneOwner: SchoolId): number => {
      const rows = bySchool[affinity]
      const keystoneId = KEYSTONE_BY_SCHOOL[keystoneOwner]
      return rows.reduce((sum, r) => sum + r.markTriggers[keystoneId], 0) / rows.length
    }

    // 每個流派觸發「自己的」keystone 的平均次數，必須嚴格高於其他兩個流派
    // 觸發同一枚 keystone 的次數——這是「流派真的各自主導不同機制」的直接證據，
    // 而不只是三個 buildSignature 字串不同（字串不同不代表玩法過程真的不同）。
    for (const owner of schools) {
      const ownRate = avgKeystoneTrigger(owner, owner)
      for (const other of schools) {
        if (other === owner) continue
        expect(ownRate).toBeGreaterThan(avgKeystoneTrigger(other, owner))
      }
    }

    // 傷害／閃避／格擋的行為剖面也應彼此不同，而不只是勝率打平。
    // 歸屬：sim/prototype.ts 裡 blockedHits 有兩處遞增，對應兩枚不同印記——(1)
    // `aftershock-shield` 分支：蓄能滿 3 層時遭遇原本會命中的攻擊，改為必定完全格擋
    // （原始設計，Studio Head 2026-07-30 駁回「E 後機率格擋」的重新設計後還原）；
    // (2) `charged-retaliation` 分支：閃避尾段 0.15 秒格擋判定（`dodge_trailing_parry_s`）
    // 換算成固定 3% 機率把本來會命中的攻擊改判為格擋，見 sim/prototype.ts 對
    // CHARGED_RETALIATION_PARRY_CHANCE 的註解。兩者都只在守勢（或跨流派選取蓄能反震／
    // 餘波護盾）時才會發生，因此下方斷言仍然成立。
    const avgBlockedHits = (school: SchoolId): number =>
      bySchool[school].reduce((sum, r) => sum + r.blockedHits, 0) / bySchool[school].length
    // 守勢的餘波護盾格擋機制（需先選蓄能反震把層數堆到滿）應讓其 blockedHits 明顯高於另外兩流派。
    expect(avgBlockedHits('guard')).toBeGreaterThan(avgBlockedHits('ember') * 2)
    expect(avgBlockedHits('guard')).toBeGreaterThan(avgBlockedHits('shadow') * 2)
  })

  it('閃避成功率（playerSkill）從 0.5 掃到 0.95，不會產生非法狀態：勝率落在 [0,1]、清理場次不超過總遭遇數、所有數值有限且非負（無負生命等價量、無無限迴圈殘留）', () => {
    const skills = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95]
    for (const skill of skills) {
      for (let i = 0; i < 60; i += 1) {
        const result = runOnce(createRng(`sensitivity-illegal-state-${skill}-${i}`), skill)
        expect(result.encountersCleared).toBeGreaterThanOrEqual(0)
        expect(result.encountersCleared).toBeLessThanOrEqual(TOTAL_ENCOUNTERS)
        expect(Number.isFinite(result.totalCycles)).toBe(true)
        expect(result.totalCycles).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(result.totalTimeMs)).toBe(true)
        expect(result.totalTimeMs).toBeGreaterThan(0)
        expect(Number.isFinite(result.damageDealt)).toBe(true)
        expect(result.damageDealt).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(result.damageTaken)).toBe(true)
        expect(result.damageTaken).toBeGreaterThanOrEqual(0)
        if (result.encountersCleared === TOTAL_ENCOUNTERS) expect(result.won).toBe(true)
      }

      const summary = runPrototype(400, `sensitivity-summary-${skill}`, {
        forcedPlayerSkill: skill,
      })
      expect(summary.winRate).toBeGreaterThanOrEqual(0)
      expect(summary.winRate).toBeLessThanOrEqual(1)
      expect(summary.legalContentViolations).toEqual([])
    }
  })

  it('runPrototype 在 0% 勝率（極端低閃避成功率）下不會拋例外——曾經 winningBuildFrequency／winningTimeStats 對空陣列呼叫 frequency()／numericStats() 會直接 throw', () => {
    expect(() => runPrototype(300, 'zero-winrate-guard', { forcedPlayerSkill: 0.5 })).not.toThrow()
    const summary = runPrototype(300, 'zero-winrate-guard', { forcedPlayerSkill: 0.5 })
    expect(summary.winRate).toBe(0)
    expect(summary.winningBuildFrequency).toEqual({})
    expect(summary.winningTimeStats.count).toBe(0)
  })

  it('random draftMode 產生合法且可重現的結果，供 build 集中度的理論基準線比較使用', () => {
    const a = runPrototype(400, 'random-draft-determinism', { draftMode: 'random' })
    const b = runPrototype(400, 'random-draft-determinism', { draftMode: 'random' })
    expect(a).toEqual(b)
    expect(a.legalContentViolations).toEqual([])
  })

  it('結構性窄視窗白名單必須恰好只有 1 枚——避免未來有印記劣化成幾乎不觸發時，被默默加進白名單吸收掉，而不是被當成新問題揭露（雙核共振已於 Gate 2 修訂中修好、移出白名單，見上方註解）', () => {
    expect(KNOWN_STRUCTURALLY_NARROW_MARKS).toHaveLength(1)
    expect(new Set(KNOWN_STRUCTURALLY_NARROW_MARKS).size).toBe(1)
  })

  it('印記健康度回歸測試：出現率不能取代效用——每枚「應該健康」的印記，一旦被選取，每局平均觸發次數必須維持在有感知的下限之上（防堵「計時器只 push 從未遞減」這類讓觸發率大幅退化、卻不會被出現率或總觸發次數 > 0 這類粗檢查抓到的實作缺陷）', () => {
    const raw = simulate((rng) => runOnce(rng), { seed: 'mark-trigger-health-regression', runs: 3000 })
      .results

    const HEALTHY_FLOOR = 5 // 目前 11 枚「健康」印記的每局觸發次數落在 11.3–100+，5 留了充足緩衝

    for (const markId of ALL_MARK_IDS) {
      const selectedRuns = raw.filter((result) => result.selected.includes(markId))
      const avgTriggerGivenSelected = mean(
        selectedRuns.map((result) => result.markTriggers[markId]),
      )

      if (KNOWN_STRUCTURALLY_NARROW_MARKS.includes(markId)) {
        // 餘波護盾是已知的原型 AI 限制（見上方註解），只守住「沒有被新 bug 打成恆為 0」，
        // 不要求達到健康門檻——它預期會停在 gate2.markTriggerHealth 判準（3）之下，
        // 這是誠實反映「效用待 Gate 3 驗證」，不是靠測試放寬去掩蓋。
        expect(avgTriggerGivenSelected).toBeGreaterThan(0)
      } else {
        expect(avgTriggerGivenSelected).toBeGreaterThanOrEqual(HEALTHY_FLOOR)
      }
    }
  })

  it('雙核共振已脫離結構性窄視窗、餘波護盾維持在已知的原型 AI 限制範圍——如果數字大幅偏離現況（無論變好或變壞），代表模型或內容已經改變，需要重新診斷根因，而不是靜默接受新數字', () => {
    const raw = simulate((rng) => runOnce(rng), { seed: 'mark-trigger-health-regression', runs: 3000 })
      .results
    const avgFor = (markId: MarkId): number => {
      const selectedRuns = raw.filter((result) => result.selected.includes(markId))
      return mean(selectedRuns.map((result) => result.markTriggers[markId]))
    }

    // Gate 2 修訂後量測值（3000 局回歸種子）：雙核共振 ≈15.3／局（已脫離窄視窗，落入
    // 其餘健康印記 11.3–100+ 的區間，內容數值層級的修法）。餘波護盾還原原始設計後
    // ≈1.05–1.08／局（原型 AI 缺乏層數保留策略導致的已知限制，非內容缺陷，不強求
    // 達到健康門檻）。區間刻意留寬（涵蓋不同局數下的自然抖動），但足以在數字大幅
    // 偏離時失敗提醒。
    expect(avgFor('twin-core-resonance')).toBeGreaterThan(10)
    expect(avgFor('twin-core-resonance')).toBeLessThan(25)
    expect(avgFor('aftershock-shield')).toBeGreaterThan(0.3)
    expect(avgFor('aftershock-shield')).toBeLessThan(2)
  })
})
