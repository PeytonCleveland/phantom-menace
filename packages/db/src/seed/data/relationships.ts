import type {
  CompetencyRelationshipInput,
  EvidenceImplicationInput,
  ObjectiveRelationshipInput,
} from "../../services/catalog";

/**
 * Seed relationships for the Networking / Rust Network I/O branch
 * (spec §18.3 competency edges, §18.4 objective edges, §18.5 implications).
 */

export const competencyRelationships: CompetencyRelationshipInput[] = [
  {
    sourceCode: "networking.transport-protocols",
    targetCode: "rust.network-io",
    relationshipType: "foundation_for",
    rationale:
      "TCP/UDP semantics (byte streams, partial reads, EOF, datagram boundaries) are the mental model every Rust network-I/O objective builds on.",
  },
  {
    sourceCode: "rust.ownership-and-borrowing",
    targetCode: "rust.network-io",
    relationshipType: "foundation_for",
    rationale:
      "Buffer handling in network I/O depends on safe mutable-slice use and ownership-correct buffer management.",
  },
  {
    sourceCode: "rust.error-handling",
    targetCode: "rust.network-io",
    relationshipType: "foundation_for",
    rationale:
      "Network I/O is dominated by fallible operations; idiomatic Result and io::Error handling is required throughout.",
  },
  {
    sourceCode: "rust.async-rust-and-tokio",
    targetCode: "rust.network-io",
    relationshipType: "foundation_for",
    rationale:
      "Advanced network-I/O objectives (cancellation, timeout, backpressure) require async Rust and Tokio runtime understanding.",
  },
];

export const objectiveRelationships: ObjectiveRelationshipInput[] = [
  {
    sourceCode: "NET-TCP-L1-002",
    targetCode: "RUST-NET-L2-002",
    relationshipType: "learning_precedes",
    strength: "strong",
    rationale:
      "Understanding byte-stream semantics first makes buffered-read behavior comprehensible rather than surprising.",
  },
  {
    sourceCode: "NET-TCP-L1-004",
    targetCode: "RUST-NET-L2-003",
    relationshipType: "performance_requires",
    strength: "hard",
    rationale:
      "Correct partial-read handling is impossible without predicting how partial reads occur and what they imply.",
  },
  {
    sourceCode: "NET-TCP-L1-003",
    targetCode: "RUST-NET-L3-001",
    relationshipType: "performance_requires",
    strength: "hard",
    rationale:
      "Framed-message reading exists precisely because TCP has no message boundaries; the mechanism must be understood to implement framing correctly.",
  },
  {
    sourceCode: "NET-TCP-L1-005",
    targetCode: "RUST-NET-L2-004",
    relationshipType: "performance_requires",
    strength: "hard",
    rationale:
      "Handling EOF according to protocol state requires understanding EOF, shutdown, and half-closed connections.",
  },
  {
    sourceCode: "RUST-OWN-L2-001",
    targetCode: "RUST-NET-L2-002",
    relationshipType: "performance_requires",
    strength: "hard",
    rationale: "Reading into a mutable buffer materially depends on safe mutable-slice handling.",
  },
  {
    sourceCode: "RUST-ERR-L2-001",
    targetCode: "RUST-NET-L2-004",
    relationshipType: "performance_requires",
    strength: "hard",
    rationale:
      "EOF and I/O error handling materially depends on idiomatic Result and io::Error handling.",
  },
  {
    sourceCode: "RUST-NET-L2-003",
    targetCode: "RUST-NET-L3-001",
    relationshipType: "performance_requires",
    strength: "hard",
    rationale: "Robust framing is built directly on correct partial-read accumulation.",
  },
  {
    sourceCode: "RUST-NET-L3-001",
    targetCode: "RUST-NET-L3-003",
    relationshipType: "learning_precedes",
    strength: "strong",
    rationale:
      "Having implemented correct framing makes framing defects recognizable when diagnosing an unfamiliar service.",
  },
  {
    sourceCode: "RUST-NET-L3-003",
    targetCode: "RUST-NET-L4-001",
    relationshipType: "learning_precedes",
    strength: "strong",
    rationale:
      "Representative framing diagnosis is the on-ramp to complex async failures where framing interacts with cancellation and backpressure.",
  },
];

export const evidenceImplications: EvidenceImplicationInput[] = [
  {
    sourceCode: "RUST-NET-L3-001",
    targetCode: "RUST-NET-L2-003",
    implicationType: "fully_subsumes",
    derivedEvidenceStrength: "direct",
    maximumTargetState: "demonstrated",
    requiredObservableCodes: [
      "buffer-preservation",
      "multiple-frames",
      "partial-header",
      "partial-body",
      "data-integrity",
    ],
    requiredCriterionCodes: [
      "preserve-incomplete-data",
      "multiple-frames-per-read",
      "split-header-and-body",
    ],
    automatic: true,
    rationale:
      "A correct framed reader necessarily exercises partial-read handling: preserving incomplete data, handling arbitrary read boundaries and multiple frames per read, without losing or duplicating bytes.",
  },
  {
    sourceCode: "RUST-NET-L3-003",
    targetCode: "NET-TCP-L1-003",
    implicationType: "evidence_supports",
    derivedEvidenceStrength: "supporting",
    maximumTargetState: "developing",
    automatic: true,
    rationale:
      "Diagnosing a framing defect exercises the message-boundary mental model, but does not observe a constructed explanation; supporting evidence only unless the explanation was explicitly elicited.",
  },
  {
    sourceCode: "RUST-NET-L4-001",
    targetCode: "RUST-NET-L3-003",
    implicationType: "fully_subsumes",
    derivedEvidenceStrength: "direct",
    maximumTargetState: "demonstrated",
    requiredObservableCodes: ["framing-diagnosis"],
    requiredCriterionCodes: ["discriminates-async-mechanisms", "rules-out-competing-explanations"],
    automatic: true,
    rationale:
      "Complex async network-I/O diagnosis subsumes representative framing diagnosis only when the task actually included framing diagnosis as a critical observable.",
  },
];
