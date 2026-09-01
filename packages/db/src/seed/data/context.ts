import type { ContextDimensionInput, ContextValueInput } from "../../services/context";

export const contextDimensions: ContextDimensionInput[] = [
  {
    code: "cloud_provider",
    name: "Cloud Provider",
    description:
      "Which cloud provider's services and operational model the capability was demonstrated against.",
  },
  {
    code: "programming_language",
    name: "Programming Language",
    description:
      "Which language a portable capability was demonstrated in. Not used on objectives where the language is already intrinsic to the claim.",
  },
];

// Order matters: a parent value must exist before its child references it.
export const contextValues: ContextValueInput[] = [
  { dimensionCode: "cloud_provider", code: "aws", name: "Amazon Web Services" },
  { dimensionCode: "cloud_provider", code: "azure", name: "Microsoft Azure" },
  { dimensionCode: "cloud_provider", code: "gcp", name: "Google Cloud Platform" },
  {
    dimensionCode: "cloud_provider",
    code: "aws_govcloud",
    name: "AWS GovCloud (US)",
    parentCode: "aws",
    description:
      "Parent is aws because evidence gathered in GovCloud is valid evidence for AWS. The reverse does not hold.",
  },
  { dimensionCode: "programming_language", code: "rust", name: "Rust" },
  { dimensionCode: "programming_language", code: "python", name: "Python" },
  { dimensionCode: "programming_language", code: "go", name: "Go" },
];
