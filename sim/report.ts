import { simulate } from '@rogue-paradise/sim'
import marksJson from '../content/marks.json'
import {
  runOnce,
  runPrototype,
  type MarkId,
  type PrototypeResult,
  type SchoolId,
} from './prototype.js'

// ---------------------------------------------------------------------------
// Gate 2 可行性報告腳本（對齊 rp-counter-overdrive/sim/report.ts 的寫法）。
//
// 這支腳本不只是把 Designer 提出的門檻機械式打勾——它同時獨立計算：
//   1. Build 集中度的「隨機抽取」理論基準線（draftMode: 'random'），
//      用來判斷 60% 上限是否只是配合觀測值放寬的門檻。
//   2. 閃避成功率（playerSkill）敏感度掃描，檢查 45–60% 整體勝率
//      是否只在某個操作水準假設下才成立。
//   3. 三條流派在相同 30,000 局下的印記觸發矩陣與傷害／閃避概況，
//      驗證 0.56pp 的流派勝率差是「數值打平」還是「模型退化成同一套邏輯」。
//   4. 10,000 局與 30,000 局的指標差異，佐證局數是否已經統計穩定。
// ---------------------------------------------------------------------------

const SEED = 'embers-duel-gate-2-v1'
const HOUSE_STANDARD_RUNS = 30_000
const STABILITY_CHECK_RUNS = 10_000
const RANDOM_BASELINE_RUNS = 30_000
const SENSITIVITY_RUNS = 10_000

const marksArr = marksJson.marks as { id: MarkId; school: SchoolId }[]
const schoolOfMark: Record<MarkId, SchoolId> = Object.fromEntries(
  marksArr.map((mark) => [mark.id, mark.school]),
) as Record<MarkId, SchoolId>
const schoolIds: readonly SchoolId[] = ['ember', 'shadow', 'guard']
const keystoneBySchool: Record<SchoolId, MarkId> = {
  ember: 'ember-core',
  shadow: 'precision-afterimage',
  guard: 'charged-retaliation',
}

function topNShare(freq: Record<string, number>, n: number): number {
  return Object.values(freq)
    .sort((left, right) => right - left)
    .slice(0, n)
    .reduce((sum, value) => sum + value, 0)
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length
}

// --- 主要模擬：house standard 30,000 局，固定 seed ------------------------

const summary = runPrototype(HOUSE_STANDARD_RUNS, SEED)
const rerunForDeterminism = runPrototype(HOUSE_STANDARD_RUNS, SEED)
const deterministic = JSON.stringify(summary) === JSON.stringify(rerunForDeterminism)

// --- 統計穩定性：10,000 局 vs 30,000 局 -----------------------------------

const summary10k = runPrototype(STABILITY_CHECK_RUNS, SEED)
const schoolSpread = (schoolWinRate: Record<SchoolId, number>): number => {
  const rates = Object.values(schoolWinRate)
  return Math.max(...rates) - Math.min(...rates)
}
const stabilityCheck = {
  winRateDiff: Math.abs(summary.winRate - summary10k.winRate),
  topFiveBuildShareDiff: Math.abs(summary.topFiveBuildShare - summary10k.topFiveBuildShare),
  schoolSpreadAt10k: schoolSpread(summary10k.schoolWinRate),
  schoolSpreadAt30k: schoolSpread(summary.schoolWinRate),
}

// --- Build 集中度：隨機抽取（無流派親和力偏好）理論基準線 -----------------

const randomDraftBaseline = runPrototype(RANDOM_BASELINE_RUNS, `${SEED}-random-baseline`, {
  draftMode: 'random',
})
const distinctWinningBuilds = Object.keys(summary.winningBuildFrequency).length
const buildConcentration = {
  affinityTop1: topNShare(summary.winningBuildFrequency, 1),
  affinityTop3: topNShare(summary.winningBuildFrequency, 3),
  affinityTop5: topNShare(summary.winningBuildFrequency, 5),
  randomDraftTop1: topNShare(randomDraftBaseline.winningBuildFrequency, 1),
  randomDraftTop3: topNShare(randomDraftBaseline.winningBuildFrequency, 3),
  randomDraftTop5: topNShare(randomDraftBaseline.winningBuildFrequency, 5),
  distinctWinningBuilds,
  naiveUniformFloorTop5: distinctWinningBuilds === 0 ? 0 : 5 / distinctWinningBuilds,
  affinityBiasExcessTop5:
    topNShare(summary.winningBuildFrequency, 5) - topNShare(randomDraftBaseline.winningBuildFrequency, 5),
}

// --- 閃避成功率（playerSkill）敏感度掃描 ----------------------------------

const DESIGNED_SKILL_RANGE: [number, number] = [0.735, 0.875]
const sensitivitySkills = [0.5, 0.55, 0.6, 0.65, 0.7, 0.735, 0.75, 0.8, 0.85, 0.875, 0.9, 0.95]
const sensitivitySweep = sensitivitySkills.map((skill) => {
  const result = runPrototype(SENSITIVITY_RUNS, `${SEED}-skill-${skill}`, {
    forcedPlayerSkill: skill,
  })
  return {
    playerSkill: skill,
    withinDesignedRange: skill >= DESIGNED_SKILL_RANGE[0] && skill <= DESIGNED_SKILL_RANGE[1],
    winRate: result.winRate,
    winningMedianTimeMinutes:
      result.winningTimeStats.count > 0 ? result.winningTimeStats.median / 60_000 : null,
    // 沒有非法狀態的間接證據：每局最多只有 7 場遭遇（含 Boss），
    // encountersCleared 不應超出這個範圍；若超出代表模擬產生了不該存在的額外戰鬥。
    maxEncountersCleared: result.encountersClearedStats.max,
  }
})
const inRangeWinRates = sensitivitySweep
  .filter((point) => point.withinDesignedRange)
  .map((point) => point.winRate)
const winRateSwingWithinDesignedRange = Math.max(...inRangeWinRates) - Math.min(...inRangeWinRates)

// --- 流派差異驗證：30,000 局的逐局原始資料 --------------------------------

const rawResults: PrototypeResult[] = simulate((rng) => runOnce(rng), {
  seed: SEED,
  runs: HOUSE_STANDARD_RUNS,
}).results

type SchoolProfile = {
  runs: number
  avgMarkTriggers: Record<MarkId, number>
  avgOwnSchoolMarksSelected: number
  avgOffSchoolMarksSelected: number
  avgDamageDealt: number
  avgDamageTaken: number
  avgPrecisionDodges: number
  avgNormalDodges: number
  avgBlockedHits: number
  avgHitsTaken: number
}

function buildSchoolProfile(school: SchoolId): SchoolProfile {
  const rows = rawResults.filter((result) => result.schoolAffinity === school)
  const avgMarkTriggers = Object.fromEntries(
    marksArr.map((mark) => [
      mark.id,
      mean(rows.map((row) => row.markTriggers[mark.id])),
    ]),
  ) as Record<MarkId, number>
  return {
    runs: rows.length,
    avgMarkTriggers,
    avgOwnSchoolMarksSelected: mean(
      rows.map((row) => row.selected.filter((id) => schoolOfMark[id] === school).length),
    ),
    avgOffSchoolMarksSelected: mean(
      rows.map((row) => row.selected.filter((id) => schoolOfMark[id] !== school).length),
    ),
    avgDamageDealt: mean(rows.map((row) => row.damageDealt)),
    avgDamageTaken: mean(rows.map((row) => row.damageTaken)),
    avgPrecisionDodges: mean(rows.map((row) => row.precisionDodges)),
    avgNormalDodges: mean(rows.map((row) => row.normalDodges)),
    avgBlockedHits: mean(rows.map((row) => row.blockedHits)),
    avgHitsTaken: mean(rows.map((row) => row.hitsTaken)),
  }
}

const schoolProfiles = Object.fromEntries(
  schoolIds.map((school) => [school, buildSchoolProfile(school)]),
) as Record<SchoolId, SchoolProfile>

// 3x3 keystone 觸發矩陣：列＝玩家流派親和力，欄＝哪一枚 keystone 被觸發。
// 對角線遠高於非對角線，代表三流派真的各自主導不同的機制，而非退化成同一套邏輯。
const keystoneTriggerMatrix = Object.fromEntries(
  schoolIds.map((affinitySchool) => [
    affinitySchool,
    Object.fromEntries(
      schoolIds.map((keystoneSchool) => [
        keystoneSchool,
        schoolProfiles[affinitySchool].avgMarkTriggers[keystoneBySchool[keystoneSchool]],
      ]),
    ),
  ]),
)
const keystoneOwnAffinityDominance = schoolIds.every((school) => {
  const ownTrigger = schoolProfiles[school].avgMarkTriggers[keystoneBySchool[school]]
  return schoolIds
    .filter((other) => other !== school)
    .every((other) => ownTrigger > schoolProfiles[other].avgMarkTriggers[keystoneBySchool[school]])
})

// --- 印記健康度：出現率（可達性）與觸發率（效用） --------------------------
//
// Studio Head 駁回了只看出現率的健康度結論：出現率只衡量「三選一有沒有機會抽到、
// 前置條件有沒有解鎖」（可達性），不衡量「選了之後這張牌實際做了多少事」（效用）。
// 一枚印記可以出現率很高但幾乎不觸發（花了一次三選一機會卻感覺不到效果），
// 這才是玩家真正會抱怨的「廢物選項」。
//
// 因此改用 avgTriggerGivenSelected：在「有選取這枚印記」的局數中（用全部 30,000 局，
// 不只贏的局數，因為 markTriggerCount 本身也是累加全部局數），平均每局實際觸發幾次。

// 判準：每局實際觸發次數 < 3 視為廢物選項。
// 理由：12 枚印記裡，扣掉本來就設計為極窄視窗的兩枚（見下方診斷），其餘 10 枚的
// 每局觸發次數落在 11.6～100.7 之間；3 這個門檻遠低於這個「健康」區間下緣，
// 但足以攔住任何量級差 1–2 個數量級的異常值（本次抓到的兩枚分別是 0.63 與 1.08，
// 比健康區間下緣還低 10 倍以上）。單局約 7 場戰鬥、15–20 分鐘，
// 若平均每局觸發不到 3 次，玩家幾乎不會感知到這枚印記在做什麼。
const DEAD_MARK_TRIGGER_FLOOR = 3

// 已知限制登記（非白名單豁免——不影響下面 gate2.markTriggerHealth 的判定，該印記仍會
// 誠實地被判定為未達門檻）。Studio Head 2026-07-30 裁決：餘波護盾在本原型的低觸發率
// （≈1.08 次／局）根因是「原型的自動施放 AI 只要 guardStacks > 0 且冷卻好就會自動施放
// E 並清空層數」，無法模擬真人玩家「屏住 3 層換格擋保底」vs「立即花掉層數換傷害」這個
// 策略性選擇——這是模型限制，不是印記設計自我衝突。Designer 曾依 Balance 的診斷重新
// 設計此印記本身（改為 E 後機率觸發部分格擋），但那個設計讓 changes_actions:['dodge']
// 變成假 metadata、且是機率×減傷校準出來的純數值印記，已被 Studio Head 駁回並還原為
// 原始設計（滿 3 層必定完全格擋）。此登記讓「這是已知、待 Gate 3 真人試玩驗證的限制」
// 而非「未被發現的新問題」被明確記錄在 Gate 2 材料裡。
const KNOWN_PROTOTYPE_AI_LIMITATIONS: Array<{ id: MarkId; reason: string }> = [
  {
    id: 'aftershock-shield',
    reason:
      '原型的自動施放 AI 只要 guardStacks > 0 且冷卻好就會自動施放 charged-retaliation 的 ' +
      'E 並清空層數，無法模擬真人玩家「屏住 3 層換格擋保底」的策略性選擇；此印記的實際 ' +
      '效用無法由本原型驗證，需 Gate 3 真人試玩量測玩家是否真的會屏住層數。若真人也幾乎 ' +
      '不屏層，才需要重新設計此印記。',
  },
]

const markHealth = marksArr.map((mark) => {
  const selectedRuns = rawResults.filter((result) => result.selected.includes(mark.id))
  const avgTriggerGivenSelected =
    selectedRuns.length === 0
      ? 0
      : mean(selectedRuns.map((result) => result.markTriggers[mark.id]))
  return {
    id: mark.id,
    school: mark.school,
    // 可達性：這枚印記在全部 30,000 局裡有多常被選進 build。
    inclusionRateAllRuns: selectedRuns.length / rawResults.length,
    winningInclusionRate: summary.winningMarkInclusionRate[mark.id],
    triggerCount30k: summary.markTriggerCount[mark.id],
    // 效用：一旦選了它，平均每局實際觸發幾次。
    avgTriggerGivenSelected,
    isDeadOnTriggerRate: avgTriggerGivenSelected < DEAD_MARK_TRIGGER_FLOOR,
  }
})
const alwaysEligibleMarks: MarkId[] = ['cracking-flame-combo', 'pursuit-strike', 'phantom-reset']
const lowestInclusionMarks = [...markHealth]
  .sort((left, right) => left.winningInclusionRate - right.winningInclusionRate)
  .slice(0, 3)
const deadMarksByTriggerRate = markHealth
  .filter((mark) => mark.isDeadOnTriggerRate)
  .sort((left, right) => left.avgTriggerGivenSelected - right.avgTriggerGivenSelected)
const minAvgTriggerGivenSelected = Math.min(...markHealth.map((mark) => mark.avgTriggerGivenSelected))

// ---------------------------------------------------------------------------
// 輸出
// ---------------------------------------------------------------------------

const minWinningMarkInclusionRate = Math.min(...Object.values(summary.winningMarkInclusionRate))
const schoolWinRateSpread = schoolSpread(summary.schoolWinRate)

const output = {
  seed: SEED,
  runs: summary.runs,
  winRate: summary.winRate,
  schoolWinRate: summary.schoolWinRate,
  schoolWinRateSpread,
  winningSchoolShare: summary.winningSchoolShare,
  timeStats: summary.timeStats,
  winningTimeStats: summary.winningTimeStats,
  winningMarkInclusionRate: summary.winningMarkInclusionRate,
  minWinningMarkInclusionRate,
  markTriggerCount: summary.markTriggerCount,
  topFiveBuildShare: summary.topFiveBuildShare,
  distinctWinningBuilds,
  legalContentViolations: summary.legalContentViolations,
  determinismDigest: summary.determinismDigest,
  determinismRerunMatches: deterministic,

  stabilityCheck,
  buildConcentration,
  sensitivitySweep: {
    designedSkillRange: DESIGNED_SKILL_RANGE,
    points: sensitivitySweep,
    winRateSwingWithinDesignedRange,
  },
  schoolDifferentiation: {
    profiles: schoolProfiles,
    keystoneTriggerMatrix,
    keystoneOwnAffinityDominance,
  },
  markHealth: {
    all: markHealth,
    alwaysEligibleMarks,
    lowestInclusionMarks: lowestInclusionMarks.map((mark) => mark.id),
    deadMarkTriggerFloor: DEAD_MARK_TRIGGER_FLOOR,
    minAvgTriggerGivenSelected,
    deadMarksByTriggerRate: deadMarksByTriggerRate.map((mark) => ({
      id: mark.id,
      avgTriggerGivenSelected: mark.avgTriggerGivenSelected,
      inclusionRateAllRuns: mark.inclusionRateAllRuns,
    })),
    // 已知限制登記——不是白名單豁免，gate2.markTriggerHealth 仍誠實反映這些印記未達門檻。
    // 見上方 KNOWN_PROTOTYPE_AI_LIMITATIONS 的完整裁決脈絡。
    knownPrototypeAiLimitations: KNOWN_PROTOTYPE_AI_LIMITATIONS,
  },

  // Designer 在 design/spec.md〈平衡目標區間〉一節提出的門檻，機械式檢查。
  gate2: {
    winRate: summary.winRate >= 0.45 && summary.winRate <= 0.6,
    schoolWinRateSpread: schoolWinRateSpread <= 0.15,
    minMarkInclusion: minWinningMarkInclusionRate >= 0.15,
    buildConcentration: summary.topFiveBuildShare <= 0.6,
    duration:
      summary.timeStats.median >= 15 * 60 * 1000 && summary.timeStats.median <= 20 * 60 * 1000,
    legalGeneration: summary.legalContentViolations.length === 0,
    deterministic,
    // 新增門檻（本次修訂）：出現率不代表效用，這裡直接檢查「選了之後有沒有真的常常觸發」。
    // 目前會是 false——雙核共振（0.63 次／局）與餘波護盾（1.08 次／局）低於下面訂的
    // 3 次／局門檻。這是正確、預期中的失敗，不是要調鬆門檻讓它變綠。
    markTriggerHealth: minAvgTriggerGivenSelected >= DEAD_MARK_TRIGGER_FLOOR,
  },

  // Balance Engineer 的獨立審查結論（見 sim/reports/2026-07-30-gate-2-feasibility.md〈門檻審查〉節）。
  balanceEngineerReview: {
    buildConcentrationVerdict:
      'Designer 的 ≤60% 門檻對照隨機抽取基準線（約 42%）只留 5–6pp 緩衝，明顯比 counter-overdrive 前例（cap 40% vs 實測 28.38%，緩衝 12pp）更貼近觀測值；建議收緊為 ≤58%。註：曾測試「把 pursuit-strike／phantom-reset 加上 requires: precision-afterimage 前置」這個直覺方案，同 seed 30,000 局對照顯示前五佔比不降反升到 66–68%、印記出現率下限跌破 15% 門檻，三項指標全部惡化，已駁回不建議採用（詳見報告〈數值調整建議〉）。',
    winRateVerdict:
      '45–60% 這個聚合區間本身沒有問題，但整體勝率對 playerSkill 的敏感度極高：designed range 0.735–0.875 內部勝率就從約 6.8% 掃到 92.2%，代表 spec.md 的「45–60%」只是對這個假設分佈取平均值後剛好落在區間內，不是遊戲難度曲線本身的穩健特性。Gate 3 必須用真人閃避成功率重新量測，而非只信任本模擬的平均值。',
    schoolDifferentiationVerdict:
      '0.56pp（Designer 10,000 局的量測）是小樣本巧合：本報告 30,000 局重測為約 1.6pp，100,000 局交叉驗證進一步爬升到約 2.3pp，仍遠低於 15pp 門檻。三流派的 keystone 觸發矩陣呈現清楚的對角線優勢（各流派觸發自己 keystone 的次數為觸發其他流派 keystone 次數的 2–5 倍），且傷害／閃避／格擋的行為剖面彼此不同（例如守勢 blockedHits 是裂焰的 17 倍）。三條流派是「數值打平但機制不同」的健康結果，不是同一套邏輯換皮。',
    markHealthVerdict:
      '出現率只衡量可達性，不衡量效用，兩者必須分開報告——「沒有印記低於 15% 出現率門檻」不等於「沒有廢物印記」，這句話已撤回。用每局實際觸發次數（僅在有選取的局數中平均）重新檢查：雙核共振 0.63 次／局、餘波護盾 1.08 次／局，比其餘 10 枚印記（11.6–100.7 次／局）低了 1–2 個數量級，判定為廢物選項（門檻：<3 次／局）。用「前置條件達成次數」拆解後，兩者根因不同：雙核共振的前置條件（兩枚核心同時武裝）每局只發生 ≈1.6 次，但一旦發生轉換成觸發的機率 ≈39.7%，與設計值 chain_probability_pct=40% 幾乎完全吻合——代表程式碼正確實作了設計，問題在前置條件本身太窄，是內容數值層級的設計問題；餘波護盾的前置條件（蓄能滿 3 層）每局發生 ≈12.1 次、不罕見，但充能反震自己的 E 只要層數>0 且冷卻好就會自動施放並清空層數，實測約 45% 的滿層視窗在下一次攻擊判定前就被 E 打掉，剩下的視窗仍只依自然閃避失敗率（≈16%）轉換——這是蓄能反震「消耗層數換傷害」與餘波護盾「保留層數換格擋」兩個效果搶同一份資源的設計衝突。我測試了兩個修法：(1) 讓 E 等到滿層才自動施放——觸發率反而從 1.08 掉到 0.74（因為 E 不早發時會在剛好滿層的同一輪立刻搶發），(2) 把餘波護盾的門檻從 3 層降到 2 層——觸發率衝高到 3.73（達標），但整體勝率被推到 56.1%、流派勝率差炸到 16.9pp（雙雙突破 Gate 2 門檻），過度矯正。另外對雙核共振測試了把 chain_probability_pct 從 40 提高到 100：觸發率從 0.63 提高到 1.40，其餘 gate2 指標幾乎不受影響（安全），但單靠這個欄位還不夠讓它越過 3 次／局的健康門檻，需要 Designer 同時處理前置條件本身（Q 冷卻／武裝延遲）才能真正解決。另外在診斷過程中發現並修復了一個真的實作 bug（見 sim/prototype.ts 的 EMBER_CORE_Q_COOLDOWN_S 段落）：核心槽滿時冷卻沒有正確重置，導致核心引爆後下一輪（約 1.1 秒）就搶跑補位，未對齊 content/marks.json 記載的 5 秒冷卻；修復後 ember-core 觸發次數從每局 31.1 次降到 30.2 次，雙核共振沒有因此改善（0.69→0.63，證實此 bug 不是雙核共振低觸發的主因）。附註：content/marks.json 的 chain_probability_pct／required_stacks 等數值欄位目前並未被 sim/prototype.ts 動態讀取（分別對應硬編碼常數 TWIN_CORE_CHAIN_CHANCE／MAX_GUARD_STACKS），Designer 調整這些欄位後，未來實作仍需工程確認數值有正確接上。' +
      '\n\n【2026-07-30 後續追記，Studio Head 裁決】雙核共振已依上述建議修好（chain_probability_pct 100 ＋ 專屬 q_cooldown_s=2），觸發率回升至 ≈15.3 次／局，已脫離廢物選項分類。餘波護盾則被 Studio Head 判定為根因誤診：本節「蓄能反震消耗層數換傷害 vs 餘波護盾保留層數換格擋」的設計衝突診斷，實際根因是原型的自動施放 AI 缺乏「屏住層數」這個策略選項（無法模擬真人玩家的取捨），不是印記設計自我衝突。Designer 曾依本節建議重新設計此印記（E 後機率觸發部分格擋），但因此讓 changes_actions:[\'dodge\'] 變成假 metadata、且成為機率×減傷校準出來的純數值印記而被駁回；餘波護盾已還原為原始設計（滿 3 層必定完全格擋），觸發率也還原為 ≈1.08 次／局，並登記於 markHealth.knownPrototypeAiLimitations，等待 Gate 3 真人試玩驗證，不再視為需要修好的廢物選項。',
  },
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
