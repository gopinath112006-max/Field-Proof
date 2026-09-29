/**
 * Evaluation & Performance Metrics Utility for FieldCheck.
 *
 * Computes objective statistical metrics for colorimetric classification:
 * - Accuracy (on conclusive cases)
 * - Precision & Recall for Presumptive Positive
 * - Confusion Matrix (True Positive, False Positive, True Negative, False Negative)
 * - Inconclusive Rate (ambiguous or borderline samples)
 * - Rejection Rate (samples rejected by image quality gate)
 *
 * SCIENTIFIC DISCIPLINE RULE:
 * Metrics are only computed from explicit, verifiable ground-truth labeled datasets.
 * Benchmarks are never fabricated.
 */

/**
 * Evaluate classification predictions against ground truth labels.
 *
 * @param {Array<{id: string, expected: "positive"|"negative"|"inconclusive"|"poor_quality", actual: object}>} evaluations
 * @returns {object} Statistical metrics summary
 */
export function calculateClassificationMetrics(evaluations) {
  if (!Array.isArray(evaluations) || evaluations.length === 0) {
    return {
      totalSamples: 0,
      conclusiveCount: 0,
      inconclusiveCount: 0,
      rejectedCount: 0,
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      inconclusiveRate: 0,
      rejectionRate: 0,
      confusionMatrix: { tp: 0, fp: 0, tn: 0, fn: 0 }
    };
  }

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let inconclusiveCount = 0;
  let rejectedCount = 0;
  let correctConclusive = 0;
  let totalConclusive = 0;

  for (const item of evaluations) {
    const expected = item.expected;
    const actualResult = item.actual;
    const pred = actualResult.classification;
    const qualityPassed = actualResult.qualityGatePassed !== false;

    if (!qualityPassed || expected === "poor_quality") {
      rejectedCount += 1;
    }

    if (pred === "inconclusive") {
      inconclusiveCount += 1;
      // If expected was also inconclusive, it's counted as a correct resolution of ambiguity
      if (expected === "inconclusive" || expected === "poor_quality") {
        correctConclusive += 1;
        totalConclusive += 1;
      }
      continue;
    }

    totalConclusive += 1;

    if (pred === "positive") {
      if (expected === "positive") {
        tp += 1;
        correctConclusive += 1;
      } else {
        fp += 1;
      }
    } else if (pred === "negative") {
      if (expected === "negative") {
        tn += 1;
        correctConclusive += 1;
      } else {
        fn += 1;
      }
    }
  }

  const totalSamples = evaluations.length;
  const accuracy = totalConclusive > 0 ? Number((correctConclusive / totalConclusive).toFixed(4)) : 0;
  const precision = tp + fp > 0 ? Number((tp / (tp + fp)).toFixed(4)) : 0;
  const recall = tp + fn > 0 ? Number((tp / (tp + fn)).toFixed(4)) : 0;
  const f1Score =
    precision + recall > 0
      ? Number(((2 * precision * recall) / (precision + recall)).toFixed(4))
      : 0;

  const inconclusiveRate = Number((inconclusiveCount / totalSamples).toFixed(4));
  const rejectionRate = Number((rejectedCount / totalSamples).toFixed(4));

  return {
    totalSamples,
    conclusiveCount: totalConclusive,
    inconclusiveCount,
    rejectedCount,
    accuracy,
    precision,
    recall,
    f1Score,
    inconclusiveRate,
    rejectionRate,
    confusionMatrix: { tp, fp, tn, fn }
  };
}
