/**
 * Inference and evaluation policy defaults.
 *
 * The spec (§27) deliberately leaves these configurable. Everything here is a
 * demo default, centralized so future role- or objective-level policies can
 * override them without hunting through service code.
 */

export const inferencePolicy = {
  /** Version stamped on learner assertions so recalculation is auditable. */
  modelVersion: "demo-0.1",

  /** Observations required to demonstrate an objective. */
  observationsToDemonstrate: 1,

  /** Base confidence for a successful direct-strength observation. */
  baseConfidenceDirect: 0.7,

  /** Base confidence when only supporting-strength evidence exists. */
  baseConfidenceSupporting: 0.4,

  /** Confidence bonuses (additive, capped). */
  bonusMachineVerified: 0.1,
  bonusHumanVerified: 0.05,
  bonusIndependenceAtLeast3: 0.1,
  bonusTransferNearOrBetter: 0.05,

  /** Proxy-origin evidence confidence penalty relative to direct origin. */
  proxyPenalty: 0.1,

  /** Confidence ceiling. */
  maxConfidence: 0.95,

  /** Confidence assigned to `developing`. */
  developingConfidence: 0.3,

  /** Confidence assigned to `contradicted`. */
  contradictedConfidence: 0.1,
} as const;

export const transferOrder = { same: 0, near: 1, far: 2, integrated: 3 } as const;

export type TransferLevel = keyof typeof transferOrder;

export function transferAtLeast(actual: TransferLevel, minimum: TransferLevel): boolean {
  return transferOrder[actual] >= transferOrder[minimum];
}

export const frontierPolicy = {
  /** Score weight for each role-required objective this objective hard-blocks. */
  unlockWeight: 1.0,
  /** Score bonus for lower mastery levels (earlier = more approachable). */
  levelWeight: 0.5,
  /** Bonus when the learner is already `developing` on the objective. */
  developingBonus: 0.75,
} as const;
