const NOSE = 0
const LEFT_EAR = 7
const RIGHT_EAR = 8
const LEFT_SHOULDER = 11
const RIGHT_SHOULDER = 12

const MIN_SHOULDER_WIDTH = 0.01

export function getUpperBodyMetrics(landmarks) {
  if (!landmarks || landmarks.length <= RIGHT_SHOULDER) {
    return null
  }

  const nose = landmarks[NOSE]
  const leftEar = landmarks[LEFT_EAR]
  const rightEar = landmarks[RIGHT_EAR]
  const leftShoulder = landmarks[LEFT_SHOULDER]
  const rightShoulder = landmarks[RIGHT_SHOULDER]

  const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x)
  if (shoulderWidth < MIN_SHOULDER_WIDTH) {
    return null
  }

  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2

  return {
    neckForwardOffset: (shoulderMidY - nose.y) / shoulderWidth,
    earWidthRatio: Math.abs(rightEar.x - leftEar.x) / shoulderWidth,
    shoulderSlope: (leftShoulder.y - rightShoulder.y) / shoulderWidth,
    torsoTilt: (nose.x - shoulderMidX) / shoulderWidth,
    shoulderCenterY: shoulderMidY
  }
}

export function averageMetrics(samples) {
  if (!samples.length) {
    return null
  }

  const totals = samples.reduce(
    (accumulator, sample) => {
      accumulator.neckForwardOffset += sample.neckForwardOffset
      accumulator.earWidthRatio += sample.earWidthRatio
      accumulator.shoulderSlope += sample.shoulderSlope
      accumulator.torsoTilt += sample.torsoTilt
      accumulator.shoulderCenterY += sample.shoulderCenterY
      return accumulator
    },
    {
      neckForwardOffset: 0,
      earWidthRatio: 0,
      shoulderSlope: 0,
      torsoTilt: 0,
      shoulderCenterY: 0
    }
  )

  return {
    neckForwardOffset: totals.neckForwardOffset / samples.length,
    earWidthRatio: totals.earWidthRatio / samples.length,
    shoulderSlope: totals.shoulderSlope / samples.length,
    torsoTilt: totals.torsoTilt / samples.length,
    shoulderCenterY: totals.shoulderCenterY / samples.length
  }
}

export function classifyPosture(metrics, calibration) {
  if (!metrics || !calibration) {
    return {
      state: 'warning',
      issueType: 'mixed',
      score: 0,
      deltas: {
        neckForwardOffset: 0,
        shoulderSlope: 0,
        torsoTilt: 0,
        earWidthRatio: 0
      }
    }
  }

  const deltas = {
    neckForwardOffset: metrics.neckForwardOffset - calibration.neckForwardOffset,
    shoulderSlope: metrics.shoulderSlope - calibration.shoulderSlope,
    torsoTilt: metrics.torsoTilt - calibration.torsoTilt,
    earWidthRatio: metrics.earWidthRatio - calibration.earWidthRatio
  }

  const weightedScore =
    Math.abs(deltas.neckForwardOffset) * 0.45 +
    Math.abs(deltas.shoulderSlope) * 0.2 +
    Math.abs(deltas.torsoTilt) * 0.25 +
    Math.abs(deltas.earWidthRatio) * 0.1

  let state = 'good'
  if (weightedScore >= 0.42) {
    state = 'bad'
  } else if (weightedScore >= 0.2) {
    state = 'warning'
  }

  const rankedIssues = [
    ['forward_head', Math.abs(deltas.neckForwardOffset)],
    ['shoulder_asymmetry', Math.abs(deltas.shoulderSlope)],
    ['torso_tilt', Math.abs(deltas.torsoTilt)]
  ].sort((left, right) => right[1] - left[1])

  const issueType = rankedIssues[0][1] > 0.08 ? rankedIssues[0][0] : 'mixed'

  return {
    state,
    issueType,
    score: Number(weightedScore.toFixed(4)),
    deltas
  }
}

export function toDisplayState(state) {
  if (state === 'good') return 'GOOD'
  if (state === 'warning') return 'WARNING'
  if (state === 'bad') return 'BAD'
  return 'UNKNOWN'
}
