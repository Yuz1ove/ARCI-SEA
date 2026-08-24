export { commerceProvider, inferenceProvider, logisticsPolicyProvider, scenarioProvider, trafficProvider, weatherProvider } from './scenarioProvider';
export type { ARCIInferenceProvider, CommerceDataProvider, ProviderStatus, ScenarioDataProvider, TrafficDataProvider, WeatherDataProvider } from './types';

// Live adapters intentionally remain outside the active registry until credentials
// are configured. The UI consumes these interfaces and requires no rewrite when a
// Shopee Open Platform, TDX, or CWA implementation replaces a fallback provider.
