import { mean, round } from '../math';
import type { CalibrationResult, V3EvaluationOptions } from './types';

type CalibrationDatum = NonNullable<V3EvaluationOptions['calibrationDataset']>[number];

export function evaluateCalibration(dataset: CalibrationDatum[] = []): CalibrationResult {
  if (!dataset.length) return {status: 'UNCALIBRATED', sampleCount: 0, expectedCalibrationError: null, brierScore: null, source: 'NONE', bins: []};
  const bins = Array.from({length: 10}, (_, index) => {
    const lower = index / 10, upper = (index + 1) / 10;
    const items = dataset.filter((item) => item.predictedProbability >= lower && (index === 9 ? item.predictedProbability <= upper : item.predictedProbability < upper));
    return {
      lower,
      upper,
      predictedMean: round(mean(items.map((item) => item.predictedProbability))),
      observedFrequency: round(mean(items.map((item) => item.observed))),
      count: items.length,
    };
  }).filter((bin) => bin.count > 0);
  const expectedCalibrationError = bins.reduce((total, bin) => total + Math.abs(bin.predictedMean - bin.observedFrequency) * bin.count / dataset.length, 0);
  const brierScore = mean(dataset.map((item) => (item.predictedProbability - item.observed) ** 2));
  const observedOnly = dataset.every((item) => item.source === 'OBSERVED_OUTCOMES');
  const source = observedOnly ? 'OBSERVED_OUTCOMES' : 'SYNTHETIC_FIXTURE';
  const status = observedOnly && dataset.length >= 200 ? 'CALIBRATED' : 'PARTIALLY_CALIBRATED';
  return {status, sampleCount: dataset.length, expectedCalibrationError: round(expectedCalibrationError), brierScore: round(brierScore), source, bins};
}
