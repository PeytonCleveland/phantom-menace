/**
 * First-pass Software Engineer domain taxonomy (spec §16, §17.1).
 * 28 general domains plus the Rust Programming language domain.
 */

export interface DomainSeed {
  code: string;
  name: string;
  description: string;
}

export const domains: DomainSeed[] = [
  {
    code: "computing-foundations",
    name: "Computing Foundations",
    description: "Establish mental models of how software executes on real computing systems.",
  },
  {
    code: "programming-foundations",
    name: "Programming Foundations",
    description:
      "Construct and reason about programs independent of a specific language ecosystem.",
  },
  {
    code: "data-structures-algorithms",
    name: "Data Structures and Algorithms",
    description:
      "Select, apply, and analyze fundamental data structures and algorithms for practical engineering work.",
  },
  {
    code: "software-construction",
    name: "Software Construction and Code Quality",
    description:
      "Produce readable, maintainable, and verifiable code using disciplined construction practices.",
  },
  {
    code: "software-design",
    name: "Software Design and Modularity",
    description:
      "Structure software with sound abstraction, encapsulation, and dependency boundaries.",
  },
  {
    code: "git-source-control",
    name: "Git and Collaborative Source Control",
    description:
      "Manage change history, branching, integration, and collaborative review with Git.",
  },
  {
    code: "testing",
    name: "Testing and Quality Engineering",
    description:
      "Design and implement testing strategies that establish confidence in software behavior.",
  },
  {
    code: "debugging",
    name: "Debugging and Troubleshooting",
    description:
      "Systematically reproduce, isolate, and correct defects using evidence-driven methods.",
  },
  {
    code: "linux-cli",
    name: "Linux and Command-Line Engineering",
    description: "Operate, inspect, and troubleshoot Linux systems from the command line.",
  },
  {
    code: "networking",
    name: "Networking",
    description:
      "Understand and troubleshoot how systems communicate across networks, from IP to application protocols.",
  },
  {
    code: "web-api",
    name: "Web and API Engineering",
    description:
      "Design, build, and secure HTTP-based interfaces and web application integrations.",
  },
  {
    code: "data-persistence",
    name: "Data and Persistence",
    description:
      "Model, store, query, and safeguard application data across relational and non-relational systems.",
  },
  {
    code: "application-security",
    name: "Application Security",
    description:
      "Build software that resists attack through secure design, implementation, and remediation practices.",
  },
  {
    code: "supply-chain-security",
    name: "Secure Software Supply Chain",
    description:
      "Protect the integrity and provenance of dependencies, builds, artifacts, and releases.",
  },
  {
    code: "containers",
    name: "Containers",
    description: "Build, run, secure, and troubleshoot containerized applications.",
  },
  {
    code: "cicd",
    name: "CI/CD and Release Engineering",
    description:
      "Automate building, testing, promoting, and releasing software safely and repeatably.",
  },
  {
    code: "cloud-infrastructure",
    name: "Cloud and Infrastructure Fundamentals",
    description: "Use cloud compute, storage, networking, and identity primitives responsibly.",
  },
  {
    code: "infrastructure-as-code",
    name: "Infrastructure as Code",
    description: "Declare, test, and safely apply infrastructure changes as versioned code.",
  },
  {
    code: "kubernetes",
    name: "Kubernetes and Platform Runtime",
    description: "Deploy, configure, and troubleshoot workloads on Kubernetes-based platforms.",
  },
  {
    code: "observability",
    name: "Observability",
    description:
      "Instrument, query, and interpret telemetry to understand production system behavior.",
  },
  {
    code: "reliability-operations",
    name: "Reliability and Operations",
    description:
      "Engineer and operate systems for availability, graceful degradation, and recovery.",
  },
  {
    code: "distributed-systems",
    name: "Distributed Systems",
    description:
      "Reason about latency, partial failure, consistency, and coordination across distributed components.",
  },
  {
    code: "software-architecture",
    name: "Software Architecture",
    description:
      "Decompose systems, evaluate tradeoffs, and evolve architecture with explicit decision records.",
  },
  {
    code: "product-requirements",
    name: "Product and Requirements Engineering",
    description:
      "Frame problems, discover requirements, and deliver iteratively against measured outcomes.",
  },
  {
    code: "collaboration-communication",
    name: "Engineering Collaboration and Technical Communication",
    description:
      "Work effectively with others through review, documentation, briefings, and shared debugging.",
  },
  {
    code: "professional-judgment",
    name: "Professional Engineering Judgment and Ownership",
    description:
      "Exercise ownership, manage ambiguity, and make sound decisions under real constraints.",
  },
  {
    code: "ai-assisted-swe",
    name: "AI-Assisted Software Engineering",
    description:
      "Use AI tools effectively and accountably: context construction, verification, and risk handling.",
  },
  {
    code: "software-factory",
    name: "Software Factory and Mission Environment",
    description:
      "Organization-specific overlay: approved tooling, platforms, compliance workflow, and mission context.",
  },
  {
    code: "rust",
    name: "Rust Programming",
    description:
      "Implementation capability and ecosystem competence in the Rust programming language.",
  },
];
