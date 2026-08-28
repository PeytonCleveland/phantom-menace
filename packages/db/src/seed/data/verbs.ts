/**
 * Controlled verb vocabulary (spec §6.2).
 * `establish` is added beyond the base dictionary for Level 5 objectives,
 * per the §5 Level 5 verb list.
 */

export interface VerbSeed {
  code: string;
  displayName: string;
  definition: string;
  requiredElements: string[];
  doesNotEstablish: string[];
  defaultEvidenceChannels: string[];
  allowedMasteryLevels: number[];
}

export const verbs: VerbSeed[] = [
  {
    code: "identify",
    displayName: "Identify",
    definition:
      "Locate, select, or name the relevant entity, condition, or feature using defining attributes.",
    requiredElements: ["correct identification across varied examples"],
    doesNotEstablish: ["causal explanation", "independent procedure", "diagnosis"],
    defaultEvidenceChannels: ["product", "explanation"],
    allowedMasteryLevels: [1, 2],
  },
  {
    code: "distinguish",
    displayName: "Distinguish",
    definition: "Discriminate between plausible alternatives and state the decisive difference.",
    requiredElements: ["correct classification", "explicit basis for distinction"],
    doesNotEstablish: ["independent procedure", "diagnosis"],
    defaultEvidenceChannels: ["explanation"],
    allowedMasteryLevels: [1, 2],
  },
  {
    code: "explain",
    displayName: "Explain",
    definition:
      "Construct a coherent causal, structural, or functional account of how or why something works.",
    requiredElements: [
      "learner-constructed explanation",
      "accuracy under probing, variation, or counterexample",
    ],
    doesNotEstablish: ["independent performance of the mechanism explained"],
    defaultEvidenceChannels: ["explanation"],
    allowedMasteryLevels: [1, 2, 3],
  },
  {
    code: "predict",
    displayName: "Predict",
    definition:
      "Infer an outcome from a stated initial condition, mechanism, or model before observing the result.",
    requiredElements: [
      "correct prediction in unseen cases",
      "rationale tied to the underlying model",
    ],
    doesNotEstablish: ["ability to produce or correct the outcome"],
    defaultEvidenceChannels: ["explanation", "product"],
    allowedMasteryLevels: [1, 2],
  },
  {
    code: "trace",
    displayName: "Trace",
    definition:
      "Follow control, data, state, or causality through a sequence and account for relevant transitions.",
    requiredElements: ["accurate intermediate states or transitions, not merely the final answer"],
    doesNotEstablish: ["construction of equivalent behavior"],
    defaultEvidenceChannels: ["process", "explanation"],
    allowedMasteryLevels: [1, 2],
  },
  {
    code: "interpret",
    displayName: "Interpret",
    definition: "Assign correct meaning to output, state, telemetry, code, or evidence.",
    requiredElements: [
      "accurate interpretation across representative variations",
      "implications stated correctly",
    ],
    doesNotEstablish: ["remediation of the interpreted condition"],
    defaultEvidenceChannels: ["explanation", "judgment"],
    allowedMasteryLevels: [1, 2, 3],
  },
  {
    code: "execute",
    displayName: "Execute",
    definition: "Carry out a defined procedure correctly under specified conditions.",
    requiredElements: ["observed process", "acceptable resulting state"],
    doesNotEstablish: ["procedure selection", "adaptation to novel conditions"],
    defaultEvidenceChannels: ["behavior", "outcome"],
    allowedMasteryLevels: [1, 2],
  },
  {
    code: "configure",
    displayName: "Configure",
    definition:
      "Establish system state that satisfies stated requirements and verify the resulting behavior.",
    requiredElements: ["configuration artifact", "operational verification"],
    doesNotEstablish: ["design of the configuration schema"],
    defaultEvidenceChannels: ["product", "outcome"],
    allowedMasteryLevels: [2, 3],
  },
  {
    code: "implement",
    displayName: "Implement",
    definition: "Create or modify executable behavior satisfying functional and quality criteria.",
    requiredElements: [
      "working artifact",
      "executable checks",
      "required edge cases",
      "quality criteria",
    ],
    doesNotEstablish: ["architecture-level design judgment"],
    defaultEvidenceChannels: ["product", "outcome", "process"],
    allowedMasteryLevels: [2, 3, 4],
  },
  {
    code: "diagnose",
    displayName: "Diagnose",
    definition:
      "Systematically isolate and identify a causal mechanism using evidence, rule out plausible alternatives, and confirm the conclusion or correction. Guessing a successful fix is not sufficient.",
    requiredElements: [
      "hypotheses",
      "discriminating evidence",
      "causal conclusion",
      "verification",
    ],
    doesNotEstablish: ["prevention or architectural remediation"],
    defaultEvidenceChannels: ["behavior", "process", "explanation", "outcome"],
    allowedMasteryLevels: [2, 3, 4, 5],
  },
  {
    code: "verify",
    displayName: "Verify",
    definition:
      "Establish through appropriate checks or measurements that an artifact or outcome satisfies defined criteria.",
    requiredElements: ["independent checks", "correct interpretation", "traceability to criteria"],
    doesNotEstablish: ["construction of the verified artifact"],
    defaultEvidenceChannels: ["process", "outcome", "judgment"],
    allowedMasteryLevels: [1, 2, 3, 4],
  },
  {
    code: "design",
    displayName: "Design",
    definition:
      "Formulate a solution satisfying constraints and represent it sufficiently for implementation or evaluation.",
    requiredElements: [
      "design artifact",
      "traceability to requirements and constraints",
      "tradeoff rationale",
    ],
    doesNotEstablish: ["implementation quality"],
    defaultEvidenceChannels: ["product", "judgment", "explanation"],
    allowedMasteryLevels: [2, 3, 4, 5],
  },
  {
    code: "evaluate",
    displayName: "Evaluate",
    definition:
      "Judge an artifact, decision, or approach against explicit criteria and substantiate the judgment.",
    requiredElements: [
      "explicit criteria",
      "accurate findings",
      "supporting evidence",
      "justified recommendation",
    ],
    doesNotEstablish: ["construction of alternatives evaluated"],
    defaultEvidenceChannels: ["judgment", "explanation", "product"],
    allowedMasteryLevels: [2, 3, 4, 5],
  },
  {
    code: "integrate",
    displayName: "Integrate",
    definition:
      "Combine components or capabilities into a coherent working whole and resolve interaction problems.",
    requiredElements: [
      "end-to-end behavior",
      "interaction verification",
      "failure handling where required",
    ],
    doesNotEstablish: ["design of the integrated components"],
    defaultEvidenceChannels: ["product", "outcome", "process"],
    allowedMasteryLevels: [2, 3, 4, 5],
  },
  {
    code: "communicate",
    displayName: "Communicate",
    definition:
      "Convey technical information accurately and appropriately for a defined audience and purpose.",
    requiredElements: [
      "communication artifact or observed exchange",
      "audience-appropriate accuracy and clarity",
    ],
    doesNotEstablish: ["technical correctness of the underlying work"],
    defaultEvidenceChannels: ["product", "behavior"],
    allowedMasteryLevels: [1, 2, 3, 4, 5],
  },
  {
    code: "collaborate",
    displayName: "Collaborate",
    definition: "Coordinate technical work and decisions with others to achieve a shared outcome.",
    requiredElements: [
      "observable coordination",
      "responsive technical contributions",
      "team outcome",
    ],
    doesNotEstablish: ["individual technical mastery of the shared work"],
    defaultEvidenceChannels: ["behavior", "outcome"],
    allowedMasteryLevels: [1, 2, 3, 4, 5],
  },
  {
    code: "establish",
    displayName: "Establish",
    definition:
      "Create, institutionalize, and validate methods, abstractions, standards, or practices adopted beyond a single system or team, with longitudinal evidence of impact.",
    requiredElements: [
      "adopted artifact, standard, or practice",
      "multi-system or multi-team scope",
      "longitudinal or measurable organizational impact",
    ],
    doesNotEstablish: ["individual task proficiency"],
    defaultEvidenceChannels: ["product", "outcome", "judgment"],
    allowedMasteryLevels: [5],
  },
];
