function clamp01(value) {
  if (Number.isNaN(value) || value == null) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

export function calculateRecencyScore(createdAt) {
  try {
    if (!createdAt) return 0
    const created = new Date(createdAt)
    if (Number.isNaN(created.getTime())) return 0
    const now = Date.now()
    const days = Math.max(0, (now - created.getTime()) / (1000 * 60 * 60 * 24))
    // Newer → closer to 1. 0 days => 1, 30+ days => ~0
    const score = Math.exp(-days / 30)
    return clamp01(score)
  } catch {
    return 0
  }
}

export function calculateCompositeScore(searchScore, importanceScore, recencyScore, boosts = {}) {
  const s = clamp01(Number(searchScore ?? 0))
  const i = clamp01(Number(importanceScore ?? 0))
  const r = clamp01(Number(recencyScore ?? 0))

  // Optional boosts
  const { isShortTerm = false, isUserContext = false, boost = 0 } = boosts || {}
  let bonus = 0
  if (isShortTerm) bonus += 0.05
  if (isUserContext) bonus += 0.05
  bonus += Number(boost || 0)

  const base = (s * 0.5) + (i * 0.3) + (r * 0.2)
  return clamp01(base + bonus)
}

export function rankResults(results = []) {
  // results: [{ searchScore, importanceScore, createdAt, isShortTerm?, isUserContext? , ... }]
  const ranked = results.map(item => {
    const recencyScore = calculateRecencyScore(item.createdAt || item.created_at)
    const compositeScore = calculateCompositeScore(
      item.searchScore ?? item.rank ?? 0,
      item.importanceScore ?? item.importance_score ?? 0,
      recencyScore,
      { isShortTerm: Boolean(item.isShortTerm), isUserContext: Boolean(item.isUserContext) }
    )
    return { ...item, recencyScore, compositeScore }
  })
  ranked.sort((a, b) => b.compositeScore - a.compositeScore)
  return ranked
}


