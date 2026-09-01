import type { ObjectiveInput } from "../../services/catalog";

// Lives under the existing "cloud-infrastructure" domain/competency taxonomy
// (seed/data/domains.ts, seed/data/competencies.ts) rather than a new
// "cloud-computing" domain — the taxonomy already models cloud fundamentals,
// and a second cloud domain would duplicate exactly what context modelling
// exists to avoid.
export const cloudCompetencyCode = "cloud-infrastructure.application-deployment";

export const cloudObjectives: ObjectiveInput[] = [
  {
    code: "CLOUD-DEPLOY-L3-001",
    title: "Deploy and operate a cloud-hosted application",
    statement:
      "Deploy a containerized application to a managed cloud runtime, configure its networking and identity, and verify it serves traffic and recovers from instance loss.",
    masteryLevel: 3,
    verbCode: "implement",
    defaultAssuranceClass: "B",
    performanceObject: "a cloud-hosted application deployment",
    criteria: [
      {
        code: "runtime-provisioned",
        statement: "A managed runtime is provisioned and serves the application",
        kind: "success",
      },
      {
        code: "identity-and-network-configured",
        statement: "Networking and workload identity are configured to least privilege",
        kind: "success",
      },
      {
        code: "recovers-from-instance-loss",
        statement: "The application recovers from the loss of a single instance",
        kind: "success",
      },
      {
        code: "no-public-credentials",
        statement: "Does not expose long-lived credentials in the deployed configuration",
        kind: "critical_error",
      },
    ],
    claimEvidenceConstraints: {
      practicalPerformanceRequired: true,
      constructedResponseSupported: false,
      multipleChoiceAloneSufficient: false,
      directObservationPossible: true,
    },
    // Provider-neutral capability, provider-scoped evidence. This is the whole
    // point: one objective, evidence that knows where it came from.
    contextPolicies: [{ dimensionCode: "cloud_provider", policy: "required" }],
    primaryCompetencyCode: cloudCompetencyCode,
  },
];
