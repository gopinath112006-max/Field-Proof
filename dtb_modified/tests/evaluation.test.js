import { describe, expect, it } from "vitest";
import { calculateClassificationMetrics } from "../src/lib/evaluation.js";
import { classifyImagePixels } from "../src/lib/classifier.js";
import { VALIDATION_FIXTURES, createSyntheticPixelBuffer } from "./fixtures/dataset.js";

describe("Evaluation & Metrics Module", () => {
  describe("calculateClassificationMetrics", () => {
    it("handles empty or null evaluations gracefully without division by zero", () => {
      const emptyRes = calculateClassificationMetrics([]);
      expect(emptyRes.totalSamples).toBe(0);
      expect(emptyRes.accuracy).toBe(0);
      expect(emptyRes.precision).toBe(0);
      expect(emptyRes.recall).toBe(0);
      expect(emptyRes.f1Score).toBe(0);
      expect(emptyRes.inconclusiveRate).toBe(0);
      expect(emptyRes.rejectionRate).toBe(0);

      const nullRes = calculateClassificationMetrics(null);
      expect(nullRes.totalSamples).toBe(0);
    });

    it("accurately computes precision, recall, and F1 from confusion matrix", () => {
      // 8 TP, 2 FP, 9 TN, 1 FN, 2 inconclusive, 1 poor quality (total 23)
      const mockEvals = [
        ...Array(8).fill({ expected: "positive", actual: { classification: "positive", qualityGatePassed: true } }),
        ...Array(2).fill({ expected: "negative", actual: { classification: "positive", qualityGatePassed: true } }),
        ...Array(9).fill({ expected: "negative", actual: { classification: "negative", qualityGatePassed: true } }),
        ...Array(1).fill({ expected: "positive", actual: { classification: "negative", qualityGatePassed: true } }),
        ...Array(2).fill({ expected: "inconclusive", actual: { classification: "inconclusive", qualityGatePassed: true } }),
        { expected: "poor_quality", actual: { classification: "inconclusive", qualityGatePassed: false } }
      ];

      const metrics = calculateClassificationMetrics(mockEvals);

      expect(metrics.totalSamples).toBe(23);
      expect(metrics.confusionMatrix.tp).toBe(8);
      expect(metrics.confusionMatrix.fp).toBe(2);
      expect(metrics.confusionMatrix.tn).toBe(9);
      expect(metrics.confusionMatrix.fn).toBe(1);

      // Precision = 8 / (8 + 2) = 0.8
      expect(metrics.precision).toBe(0.8);
      // Recall = 8 / (8 + 1) = 0.8889
      expect(metrics.recall).toBe(0.8889);
      // F1 = 2 * (0.8 * 0.8889) / (0.8 + 0.8889) = 0.8421
      expect(metrics.f1Score).toBe(0.8421);

      expect(metrics.inconclusiveCount).toBe(3);
      expect(metrics.rejectedCount).toBe(1);
    });
  });

  describe("Validation Dataset Evaluation", () => {
    it("evaluates VALIDATION_FIXTURES against ground truth with high accuracy", () => {
      const evaluations = [];

      for (const fixture of VALIDATION_FIXTURES) {
        const buffer = createSyntheticPixelBuffer(fixture.width, fixture.height, {
          reactionRgb: fixture.reactionRgb,
          swatchRgb: fixture.swatch ? fixture.swatch.rgb : null,
          underexposed: fixture.underexposed === true
        });

        const guard = fixture.swatch
          ? { accepted: true, colorName: fixture.swatch.name }
          : null;

        const actual = classifyImagePixels(buffer, fixture.width, fixture.height, guard);

        evaluations.push({
          id: fixture.id,
          expected: fixture.expected,
          actual
        });
      }

      const summary = calculateClassificationMetrics(evaluations);

      expect(summary.totalSamples).toBe(VALIDATION_FIXTURES.length);
      // Ensure no NaN in any statistical metrics
      expect(Number.isNaN(summary.accuracy)).toBe(false);
      expect(Number.isNaN(summary.precision)).toBe(false);
      expect(Number.isNaN(summary.recall)).toBe(false);
      expect(Number.isNaN(summary.f1Score)).toBe(false);

      // Verify that conclusive cases achieve high accuracy
      expect(summary.accuracy).toBeGreaterThanOrEqual(0.85);

      // Verify that poor quality and inconclusive cases were appropriately categorized
      expect(summary.inconclusiveCount).toBeGreaterThan(0);
      expect(summary.rejectedCount).toBeGreaterThanOrEqual(2);
    });
  });
});
