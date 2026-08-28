/**
 * Example task and evidence contract (spec §19):
 * TASK-RUST-FRAMING-CHALLENGE-01 — Reconstruct Framed Messages from
 * Arbitrary TCP Reads. Evidence ceiling 3, direct evidence for
 * RUST-NET-L3-001, supporting evidence for the partial-read, EOF, and
 * message-boundary objectives.
 */

export interface ObservableSeed {
  code: string;
  statement: string;
  observableType: "behavior" | "product" | "outcome" | "process" | "explanation" | "judgment";
  criterionCodes?: string[];
}

export interface EvidenceSpecSeed {
  objectiveCode: string;
  claimRole: "primary" | "supporting" | "incidental";
  evidenceStrength: "direct" | "supporting" | "incidental";
  minimumIndependence: 0 | 1 | 2 | 3 | 4;
  minimumTransferDistance: "same" | "near" | "far";
  minimumPerformanceScope: "focused" | "composite" | "integrated";
  proxyPropagationAllowed?: boolean;
  observables?: ObservableSeed[];
}

export interface TaskSeed {
  code: string;
  title: string;
  taskKind: "exercise" | "lab" | "challenge" | "mission" | "workplace_portfolio";
  scenario: string;
  instructions: string;
  designEvidenceCeiling: 1 | 2 | 3 | 4 | 5;
  estimatedMinutes: number;
  variants: Array<{
    code: string;
    transferDistanceDefault: "same" | "near" | "far";
    performanceScopeDefault: "focused" | "composite" | "integrated";
    variantConfig: Record<string, unknown>;
  }>;
  evidenceSpecs: EvidenceSpecSeed[];
  administrations: Array<{
    variantCode: string;
    mode: "practice" | "formative" | "summative" | "qualification";
    assistancePolicy: Record<string, unknown>;
    processCaptureEnabled: boolean;
    effectiveEvidenceCeiling: 1 | 2 | 3 | 4 | 5;
  }>;
}

export const rustFramingChallenge: TaskSeed = {
  code: "TASK-RUST-FRAMING-CHALLENGE-01",
  title: "Reconstruct Framed Messages from Arbitrary TCP Reads",
  taskKind: "challenge",
  scenario:
    "An unfamiliar Rust service receives length-prefixed messages over TCP. The current reader assumes that one read contains one complete message. Implement a correct reader that handles arbitrary read boundaries, multiple messages per read, EOF, and I/O errors without losing or duplicating bytes.",
  instructions:
    "Correct the framed-message reader. Preserve incomplete data across reads. Add or use tests covering varied read boundaries. Do not change the wire protocol.",
  designEvidenceCeiling: 3,
  estimatedMinutes: 120,
  variants: [
    {
      code: "baseline",
      transferDistanceDefault: "near",
      performanceScopeDefault: "focused",
      variantConfig: { repository: "framing-service-a", faultProfile: "one-read-one-message" },
    },
    {
      code: "variant-split-header",
      transferDistanceDefault: "near",
      performanceScopeDefault: "composite",
      variantConfig: { repository: "framing-service-b", faultProfile: "header-split-discard" },
    },
  ],
  evidenceSpecs: [
    {
      objectiveCode: "RUST-NET-L3-001",
      claimRole: "primary",
      evidenceStrength: "direct",
      minimumIndependence: 3,
      minimumTransferDistance: "near",
      minimumPerformanceScope: "focused",
      proxyPropagationAllowed: true,
      observables: [
        {
          code: "framing-model",
          statement: "Recognizes that TCP is a byte stream without message boundaries.",
          observableType: "explanation",
          criterionCodes: [],
        },
        {
          code: "buffer-preservation",
          statement: "Preserves incomplete bytes across reads.",
          observableType: "product",
          criterionCodes: ["preserve-incomplete-data"],
        },
        {
          code: "multiple-frames",
          statement: "Processes multiple complete frames from one read.",
          observableType: "product",
          criterionCodes: ["multiple-frames-per-read"],
        },
        {
          code: "partial-header",
          statement: "Handles a frame header split across reads.",
          observableType: "product",
          criterionCodes: ["split-header-and-body"],
        },
        {
          code: "partial-body",
          statement: "Handles a frame body split across reads.",
          observableType: "product",
          criterionCodes: ["split-header-and-body"],
        },
        {
          code: "eof",
          statement: "Handles EOF according to protocol state.",
          observableType: "product",
          criterionCodes: ["eof-and-io-errors"],
        },
        {
          code: "io-error",
          statement: "Surfaces or handles I/O errors appropriately.",
          observableType: "product",
          criterionCodes: ["eof-and-io-errors"],
        },
        {
          code: "verification",
          statement: "Adds or uses tests covering varied read boundaries.",
          observableType: "process",
          criterionCodes: ["boundary-verification"],
        },
        {
          code: "data-integrity",
          statement: "Does not lose, duplicate, or reorder bytes.",
          observableType: "outcome",
          criterionCodes: ["no-data-loss"],
        },
      ],
    },
    {
      objectiveCode: "RUST-NET-L2-003",
      claimRole: "supporting",
      evidenceStrength: "supporting",
      minimumIndependence: 3,
      minimumTransferDistance: "near",
      minimumPerformanceScope: "focused",
    },
    {
      objectiveCode: "RUST-NET-L2-004",
      claimRole: "supporting",
      evidenceStrength: "supporting",
      minimumIndependence: 3,
      minimumTransferDistance: "near",
      minimumPerformanceScope: "focused",
    },
    {
      objectiveCode: "NET-TCP-L1-003",
      claimRole: "supporting",
      evidenceStrength: "supporting",
      minimumIndependence: 3,
      minimumTransferDistance: "near",
      minimumPerformanceScope: "focused",
    },
  ],
  administrations: [
    {
      variantCode: "baseline",
      mode: "practice",
      assistancePolicy: {
        hints: true,
        aiTutor: true,
        immediateFeedback: true,
      },
      processCaptureEnabled: false,
      effectiveEvidenceCeiling: 2,
    },
    {
      variantCode: "variant-split-header",
      mode: "qualification",
      assistancePolicy: {
        documentation: true,
        hints: false,
        generalAi: false,
        unfamiliarRepository: true,
        hiddenBoundaryTests: true,
        minimumIndependence: 3,
        minimumTransferDistance: "near",
        minimumPerformanceScope: "focused",
      },
      processCaptureEnabled: true,
      effectiveEvidenceCeiling: 3,
    },
  ],
};
