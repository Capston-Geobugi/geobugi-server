export function getScoreToneClass(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return ''
  }

  if (score >= 70) {
    return 'score-tone-good'
  }

  if (score >= 50) {
    return 'score-tone-warning'
  }

  return 'score-tone-danger'
}
