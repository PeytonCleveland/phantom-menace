import type { CapabilitySetInput } from "../../services/capability-sets";
import type { RequirementGroupSpec } from "../../services/role-compiler";

/**
 * Capability sets (§20) scoped to seeded content, and the Software Engineer
 * role with five levels (§9.2). Only Level 3 — Team Ready gets a compiled,
 * published revision in this seed; the other levels exist as identities with
 * professional expectations, awaiting content.
 */

// Order matters: nested sets must be created after their children.
export const capabilitySets: CapabilitySetInput[] = [
  {
    code: "cs.networking-transport-foundations",
    name: "Transport Protocol Foundations",
    description: "Level 1 transport-protocol mental models (TCP, UDP, boundaries, EOF).",
    objectiveCodes: [
      "NET-TRANSPORT-L1-001",
      "NET-TCP-L1-001",
      "NET-TCP-L1-002",
      "NET-TCP-L1-003",
      "NET-TCP-L1-004",
      "NET-TCP-L1-005",
      "NET-UDP-L1-001",
      "NET-UDP-L1-002",
      "NET-TRANSPORT-L1-002",
    ],
  },
  {
    code: "cs.networking-transport-applied",
    name: "Transport Protocols Applied",
    description: "Level 2 practical transport inspection and interpretation.",
    objectiveCodes: ["NET-TCP-L2-001", "NET-TCP-L2-002", "NET-TCP-L2-003", "NET-UDP-L2-001"],
  },
  {
    code: "cs.swe-networking-support",
    name: "Software Engineer Level 3 Supporting Networking",
    description:
      "Networking support expected of a Team Ready software engineer (foundations plus applied inspection). Composed by nesting.",
    nestedSetCodes: ["cs.networking-transport-foundations", "cs.networking-transport-applied"],
  },
  {
    code: "cs.rust-net-io-l3",
    name: "Rust Network I/O Package (L3)",
    description:
      "All Rust Network I/O objectives at levels 1-3 (selected via competency membership with a level filter) plus their ownership and error-handling prerequisites.",
    competencyMembers: [{ competencyCode: "rust.network-io", levels: [1, 2, 3] }],
    objectiveCodes: ["RUST-OWN-L2-001", "RUST-ERR-L2-001"],
  },
  {
    code: "cs.rust-language-l3",
    name: "Rust Language Package L3 (seed subset)",
    description:
      "Seed subset of the Rust L3 language package. Will grow as further Rust competencies gain objectives.",
    nestedSetCodes: ["cs.rust-net-io-l3"],
  },
];

export interface RoleLevelSeed {
  level: 1 | 2 | 3 | 4 | 5;
  canonicalTitle: string;
  expectation: string;
}

export const softwareEngineerRole = {
  code: "software-engineer",
  name: "Software Engineer",
  description:
    "Designs, implements, tests, delivers, and operates software as part of a product team.",
  levels: [
    {
      level: 1,
      canonicalTitle: "Software Engineer Level 1 — Foundational",
      expectation:
        "Participates in software development under close guidance and demonstrates foundational mental models and constrained technical capability.",
    },
    {
      level: 2,
      canonicalTitle: "Software Engineer Level 2 — Applied",
      expectation:
        "Performs routine software engineering tasks using established patterns, references, and occasional technical guidance.",
    },
    {
      level: 3,
      canonicalTitle: "Software Engineer Level 3 — Independent / Team Ready",
      expectation:
        "Independently performs representative software engineering work on an unfamiliar but normally scoped product-team problem.",
    },
    {
      level: 4,
      canonicalTitle: "Software Engineer Level 4 — Adaptive / Senior",
      expectation:
        "Handles complex, ambiguous, cross-domain engineering problems and adapts technical approaches to unfamiliar conditions.",
    },
    {
      level: 5,
      canonicalTitle: "Software Engineer Level 5 — Expert / Principal",
      expectation:
        "Advances engineering capability across systems or teams through new or improved methods, architecture, tooling, standards, and technical leadership.",
    },
  ] satisfies RoleLevelSeed[],
};

/**
 * SE Level 3 requirement composition (seed subset of §20.3).
 * Root ALL OF containing: core Rust network capability (direct evidence
 * required on the framing objective), ANY OF approved language packages,
 * networking support, and an N OF 2 transport-depth group.
 */
export const softwareEngineerL3Composition: RequirementGroupSpec[] = [
  {
    label: "Software Engineer Level 3 — Team Ready (seed subset)",
    operator: "all_of",
    children: [
      {
        label: "Core Rust Network Capability",
        operator: "all_of",
        members: [
          {
            kind: "objective",
            objectiveCode: "RUST-NET-L3-001",
            policy: {
              directEvidenceRequired: true,
              proxyEvidenceAllowed: false,
              minimumIndependence: 3,
              minimumTransferDistance: "near",
            },
          },
          { kind: "objective", objectiveCode: "RUST-NET-L3-003" },
          { kind: "objective", objectiveCode: "RUST-NET-L3-004" },
        ],
      },
      {
        label: "Approved Language Package (any of)",
        operator: "any_of",
        children: [
          {
            label: "Rust Language Package L3",
            operator: "all_of",
            members: [{ kind: "capability_set", setCode: "cs.rust-language-l3" }],
          },
        ],
      },
      {
        label: "Networking Support",
        operator: "all_of",
        members: [
          {
            kind: "capability_set",
            setCode: "cs.swe-networking-support",
            policy: { minimumIndependence: 2, minimumTransferDistance: "same" },
          },
        ],
      },
      {
        label: "Transport Depth (2 of 3)",
        operator: "n_of",
        minimumCount: 2,
        members: [
          { kind: "objective", objectiveCode: "NET-TCP-L3-001" },
          { kind: "objective", objectiveCode: "NET-TRANSPORT-L3-001" },
          { kind: "objective", objectiveCode: "NET-TCP-L4-001" },
        ],
      },
    ],
  },
];
