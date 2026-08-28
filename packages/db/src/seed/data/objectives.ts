import type { ObjectiveInput } from "../../services/catalog";

/**
 * First seed branch: Networking / Transport Protocols and Rust / Network I/O
 * (spec §18.1, §18.2), plus the two cross-competency prerequisites referenced
 * by §18.4 (ownership and error handling).
 */

const TRANSPORT = "networking.transport-protocols";
const RUST_NET = "rust.network-io";

export const objectives: ObjectiveInput[] = [
  // -------------------------------------------------------------------------
  // Networking / Transport Protocols — Level 1 (§18.1)
  // -------------------------------------------------------------------------
  {
    code: "NET-TRANSPORT-L1-001",
    title: "Explain the purpose of the transport layer",
    statement:
      "Explain the purpose of the transport layer, including what guarantees it adds over raw IP delivery and why applications depend on it.",
    masteryLevel: 1,
    verbCode: "explain",
    assuranceClass: "A",
    performanceObject: "the transport layer's role in the network stack",
    successCriteria: [
      "Accurately describes what the transport layer provides beyond IP",
      "Explanation holds up under probing with follow-up questions",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TCP-L1-001",
    title: "Explain TCP connection establishment and termination",
    statement:
      "Explain TCP connection establishment and termination, including the three-way handshake, orderly shutdown, and what each step accomplishes.",
    masteryLevel: 1,
    verbCode: "explain",
    assuranceClass: "A",
    performanceObject: "TCP connection lifecycle",
    successCriteria: [
      "Correctly sequences handshake and termination steps",
      "Explains the purpose of each step, not just the order",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TCP-L1-002",
    title: "Explain TCP byte-stream semantics",
    statement:
      "Explain TCP byte-stream semantics: what ordering and delivery guarantees TCP provides, and what a read from a TCP socket can and cannot assume.",
    masteryLevel: 1,
    verbCode: "explain",
    assuranceClass: "A",
    performanceObject: "TCP byte-stream semantics",
    successCriteria: [
      "States TCP's ordering and delivery guarantees correctly",
      "Correctly describes what a single read may return",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TCP-L1-003",
    title: "Explain why TCP does not preserve application message boundaries",
    statement:
      "Explain why TCP does not preserve application message boundaries and what this implies for any protocol built on top of TCP.",
    masteryLevel: 1,
    verbCode: "explain",
    assuranceClass: "A",
    performanceObject: "absence of message boundaries in TCP",
    successCriteria: [
      "Explains the causal mechanism (segmentation, buffering, coalescing)",
      "States the implication: applications must frame their own messages",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TCP-L1-004",
    title: "Predict the consequences of partial reads and writes",
    statement:
      "Given a sequence of TCP reads and buffer states, predict whether a complete application message is available and explain how partial reads and writes affect the result.",
    masteryLevel: 1,
    verbCode: "predict",
    assuranceClass: "A",
    performanceObject: "partial read/write behavior over TCP",
    successCriteria: [
      "Correct predictions across unseen read/buffer scenarios",
      "Rationale tied to byte-stream semantics rather than memorized cases",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TCP-L1-005",
    title: "Explain EOF, shutdown, and half-closed connections",
    statement:
      "Explain EOF, shutdown, and half-closed TCP connections, including what a zero-length read means and how each side's close affects the other.",
    masteryLevel: 1,
    verbCode: "explain",
    assuranceClass: "A",
    performanceObject: "TCP EOF and shutdown behavior",
    successCriteria: [
      "Correctly interprets a zero-length read",
      "Explains half-closed connection behavior in both directions",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-UDP-L1-001",
    title: "Explain UDP datagram semantics",
    statement:
      "Explain UDP datagram semantics: message boundaries, lack of delivery and ordering guarantees, and what a UDP receive returns.",
    masteryLevel: 1,
    verbCode: "explain",
    assuranceClass: "A",
    performanceObject: "UDP datagram semantics",
    successCriteria: [
      "Correctly contrasts datagram boundaries with TCP's byte stream",
      "States delivery and ordering non-guarantees accurately",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-UDP-L1-002",
    title: "Predict the consequences of loss, duplication, and reordering",
    statement:
      "Given a UDP communication scenario, predict the consequences of datagram loss, duplication, and reordering for the application.",
    masteryLevel: 1,
    verbCode: "predict",
    assuranceClass: "A",
    performanceObject: "UDP failure modes",
    successCriteria: [
      "Correct predictions for loss, duplication, and reordering cases",
      "Identifies which applications tolerate which failure modes",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TRANSPORT-L1-002",
    title: "Distinguish appropriate TCP and UDP use cases",
    statement:
      "Distinguish appropriate TCP and UDP use cases for representative application requirements and state the decisive difference driving each choice.",
    masteryLevel: 1,
    verbCode: "distinguish",
    assuranceClass: "A",
    performanceObject: "transport protocol selection",
    successCriteria: [
      "Correct classification across varied application scenarios",
      "Explicit basis for each distinction",
    ],
    primaryCompetencyCode: TRANSPORT,
  },

  // -------------------------------------------------------------------------
  // Networking / Transport Protocols — Level 2
  // -------------------------------------------------------------------------
  {
    code: "NET-TCP-L2-001",
    title: "Inspect active TCP connection state using appropriate tools",
    statement:
      "Using standard tools (such as ss, netstat, or lsof), inspect active TCP connection state on a host and correctly interpret connection states, addresses, and ports.",
    masteryLevel: 2,
    verbCode: "interpret",
    assuranceClass: "B",
    performanceObject: "live TCP connection state",
    successCriteria: [
      "Selects an appropriate inspection tool",
      "Correctly interprets connection states and endpoints",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TCP-L2-002",
    title: "Verify whether a TCP endpoint is reachable and accepting connections",
    statement:
      "Verify whether a TCP endpoint is reachable and accepting connections, distinguishing connection refusal, timeout, and successful establishment.",
    masteryLevel: 2,
    verbCode: "verify",
    assuranceClass: "B",
    performanceObject: "TCP endpoint reachability",
    successCriteria: [
      "Uses appropriate checks (e.g. nc, curl, ss) to test the endpoint",
      "Correctly distinguishes refusal, timeout, and success",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TCP-L2-003",
    title: "Interpret common TCP connection failures",
    statement:
      "Interpret common TCP connection failures (connection refused, reset, timeout) and state the most likely causes of each.",
    masteryLevel: 2,
    verbCode: "interpret",
    assuranceClass: "B",
    performanceObject: "TCP failure signals",
    successCriteria: [
      "Accurate interpretation across representative failure variations",
      "States likely causes and next diagnostic step for each",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-UDP-L2-001",
    title: "Send, receive, and inspect UDP datagrams in a bounded environment",
    statement:
      "Send, receive, and inspect UDP datagrams in a bounded environment using standard tooling, confirming datagram boundaries and observing loss behavior.",
    masteryLevel: 2,
    verbCode: "execute",
    assuranceClass: "B",
    performanceObject: "UDP datagram exchange",
    successCriteria: [
      "Successfully exchanges datagrams between two endpoints",
      "Observes and correctly reports datagram boundary behavior",
    ],
    primaryCompetencyCode: TRANSPORT,
  },

  // -------------------------------------------------------------------------
  // Networking / Transport Protocols — Levels 3–5
  // -------------------------------------------------------------------------
  {
    code: "NET-TCP-L3-001",
    title: "Diagnose a representative TCP connectivity failure in an unfamiliar environment",
    statement:
      "Diagnose a representative TCP connectivity failure in an unfamiliar environment: form hypotheses, gather discriminating evidence, identify the causal mechanism, and verify the conclusion.",
    masteryLevel: 3,
    verbCode: "diagnose",
    assuranceClass: "B",
    performanceObject: "TCP connectivity failure",
    successCriteria: [
      "Hypotheses are plausible and tested with discriminating evidence",
      "Causal conclusion is verified, not guessed",
    ],
    criticalErrors: ["declares a cause without verification"],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TRANSPORT-L3-001",
    title: "Select and justify a transport approach for a bounded application requirement",
    statement:
      "Evaluate transport options for a bounded application requirement and justify the selection against explicit reliability, latency, and complexity criteria.",
    masteryLevel: 3,
    verbCode: "evaluate",
    assuranceClass: "B",
    performanceObject: "transport approach selection",
    successCriteria: [
      "Criteria are explicit and appropriate to the requirement",
      "Recommendation is substantiated with accurate findings",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TCP-L4-001",
    title: "Diagnose intermittent or multi-layer transport failures under ambiguous evidence",
    statement:
      "Diagnose intermittent or multi-layer transport failures under ambiguous or incomplete evidence, ruling out competing explanations across layers.",
    masteryLevel: 4,
    verbCode: "diagnose",
    assuranceClass: "C",
    performanceObject: "complex transport failure",
    successCriteria: [
      "Systematically discriminates between multi-layer explanations",
      "Handles false leads without fixating on an early hypothesis",
      "Conclusion verified under the intermittent condition",
    ],
    criticalErrors: ["ships a fix without demonstrating the causal mechanism"],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TRANSPORT-L4-001",
    title: "Evaluate transport tradeoffs under reliability, latency, and operational constraints",
    statement:
      "Evaluate competing transport designs under interacting reliability, latency, and operational constraints and justify tradeoffs for a materially novel context.",
    masteryLevel: 4,
    verbCode: "evaluate",
    assuranceClass: "C",
    performanceObject: "transport tradeoff analysis",
    successCriteria: [
      "Tradeoff analysis addresses interacting constraints, not one dimension",
      "Judgment substantiated with evidence and explicit criteria",
    ],
    primaryCompetencyCode: TRANSPORT,
  },
  {
    code: "NET-TRANSPORT-L5-001",
    title:
      "Establish and validate transport engineering practices that improve reliability across systems",
    statement:
      "Establish and validate transport engineering practices, standards, or abstractions that measurably improve reliability across multiple systems or teams.",
    masteryLevel: 5,
    verbCode: "establish",
    assuranceClass: "C",
    performanceObject: "organizational transport engineering practice",
    successCriteria: [
      "Practice or standard adopted beyond a single system or team",
      "Longitudinal evidence of measurable reliability improvement",
    ],
    primaryCompetencyCode: TRANSPORT,
  },

  // -------------------------------------------------------------------------
  // Rust / Network I/O — Level 1 (§18.2)
  // -------------------------------------------------------------------------
  {
    code: "RUST-NET-L1-001",
    title: "Explain how Rust TcpStream represents a TCP byte stream",
    statement:
      "Explain how Rust's TcpStream represents a TCP byte stream, including what read and write calls correspond to at the transport level.",
    masteryLevel: 1,
    verbCode: "explain",
    assuranceClass: "A",
    performanceObject: "TcpStream's byte-stream model",
    successCriteria: [
      "Maps TcpStream read/write behavior to TCP semantics correctly",
      "Explanation survives probing with edge cases (short reads, EOF)",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L1-002",
    title: "Trace bytes through a simple Rust read-buffer operation",
    statement:
      "Trace bytes through a simple Rust read-buffer operation, accounting for the buffer contents, the returned byte count, and any leftover data at each step.",
    masteryLevel: 1,
    verbCode: "trace",
    assuranceClass: "A",
    performanceObject: "read-buffer state transitions",
    successCriteria: [
      "Accurately reports intermediate buffer states and counts",
      "Accounts for leftover and unconsumed bytes, not just the final state",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L1-003",
    title: "Explain how Rust represents I/O success, EOF, and error conditions",
    statement:
      "Explain how Rust represents I/O success, EOF, and error conditions through Result, Ok(0), and io::Error, and what each obligates the caller to handle.",
    masteryLevel: 1,
    verbCode: "explain",
    assuranceClass: "A",
    performanceObject: "Rust I/O result representation",
    successCriteria: [
      "Correctly distinguishes Ok(n), Ok(0), and Err cases",
      "States caller obligations for each condition",
    ],
    primaryCompetencyCode: RUST_NET,
  },

  // -------------------------------------------------------------------------
  // Rust / Network I/O — Level 2
  // -------------------------------------------------------------------------
  {
    code: "RUST-NET-L2-001",
    title: "Create and connect a Rust TcpStream",
    statement:
      "Implement code that creates and connects a Rust TcpStream to a specified endpoint, handling connection errors without panicking.",
    masteryLevel: 2,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "TcpStream connection",
    successCriteria: [
      "Connection succeeds against a live endpoint",
      "Connection failure surfaces as a handled error, not a panic",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L2-002",
    title: "Read bytes into a mutable buffer",
    statement:
      "Implement code that reads bytes from a TcpStream into a mutable buffer and correctly uses the returned byte count to bound further processing.",
    masteryLevel: 2,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "buffered socket reads",
    successCriteria: [
      "Only the returned count of bytes is treated as valid data",
      "Buffer reuse does not expose stale bytes",
    ],
    criticalErrors: ["processes the full buffer regardless of bytes read"],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L2-003",
    title: "Correctly handle partial reads",
    statement:
      "Implement reading logic over a Rust TcpStream that correctly handles partial reads, accumulating data until a complete logical unit is available.",
    masteryLevel: 2,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "partial-read handling",
    successCriteria: [
      "Incomplete data is preserved across successive reads",
      "Behavior is correct for any read-boundary split",
    ],
    criticalErrors: [
      "assumes one read returns one complete message",
      "discards bytes from an incomplete unit",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L2-004",
    title: "Correctly handle EOF and common I/O errors",
    statement:
      "Implement socket-handling code that correctly handles EOF (Ok(0)) and common io::Error conditions, terminating or recovering according to protocol state.",
    masteryLevel: 2,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "EOF and I/O error handling",
    successCriteria: [
      "EOF is detected and handled according to protocol state",
      "Interrupted and WouldBlock conditions are handled appropriately",
    ],
    criticalErrors: ["treats EOF as an infinite-loop read of zero bytes"],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L2-005",
    title: "Write a complete logical message despite partial writes",
    statement:
      "Implement writing logic that delivers a complete logical message over a TcpStream despite partial writes, using write_all or an equivalent verified loop.",
    masteryLevel: 2,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "partial-write handling",
    successCriteria: [
      "All bytes of the logical message are delivered exactly once",
      "Write errors are surfaced, not swallowed",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L2-006",
    title: "Configure blocking behavior, timeouts, and shutdown",
    statement:
      "Configure a Rust TCP socket's blocking behavior, read/write timeouts, and shutdown semantics to satisfy stated requirements, and verify the resulting behavior.",
    masteryLevel: 2,
    verbCode: "configure",
    assuranceClass: "B",
    performanceObject: "socket configuration",
    successCriteria: [
      "Configuration satisfies the stated requirements",
      "Resulting behavior is verified, including the timeout path",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L2-007",
    title: "Send and receive datagrams with UdpSocket",
    statement:
      "Implement sending and receiving datagrams with Rust's UdpSocket, respecting datagram boundaries and handling truncation behavior correctly.",
    masteryLevel: 2,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "UDP datagram exchange in Rust",
    successCriteria: [
      "Datagrams are exchanged with boundaries preserved",
      "Receive-buffer sizing and truncation behavior handled correctly",
    ],
    primaryCompetencyCode: RUST_NET,
  },

  // -------------------------------------------------------------------------
  // Rust / Network I/O — Level 3
  // -------------------------------------------------------------------------
  {
    code: "RUST-NET-L3-001",
    title: "Independently implement robust framed-message reading over a Rust TcpStream",
    statement:
      "Independently implement a framed-message reader over a Rust TcpStream that preserves incomplete data across reads, handles multiple frames per read, handles EOF and I/O errors correctly, and does not lose or duplicate bytes.",
    masteryLevel: 3,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "framed-message reader",
    conditions: {
      context: "unfamiliar but reasonably scoped codebase",
      assistance: "normal technical documentation permitted, no step-level help",
    },
    successCriteria: [
      "Incomplete frame data is preserved across arbitrary read boundaries",
      "Multiple complete frames within one read are all processed",
      "Frame headers and bodies split across reads are handled",
      "EOF and I/O errors are handled according to protocol state",
      "No bytes are lost, duplicated, or reordered",
      "Behavior is verified with tests covering varied read boundaries",
    ],
    criticalErrors: [
      "assumes one read equals one message",
      "discards incomplete frame bytes",
      "silently loses or duplicates bytes",
      "declares success without verification",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L3-002",
    title: "Independently implement framed-message writing over a Rust TcpStream",
    statement:
      "Independently implement framed-message writing over a Rust TcpStream that emits well-formed frames, completes partial writes, and surfaces write failures correctly.",
    masteryLevel: 3,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "framed-message writer",
    successCriteria: [
      "Frames are well-formed and parseable by a conforming reader",
      "Partial writes are completed; no interleaved or truncated frames",
      "Write failures are surfaced with usable error context",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L3-003",
    title: "Diagnose a representative TCP framing defect in an unfamiliar Rust service",
    statement:
      "Diagnose a representative TCP framing defect in an unfamiliar Rust service: reproduce the failure, isolate the causal mechanism, and verify the correction.",
    masteryLevel: 3,
    verbCode: "diagnose",
    assuranceClass: "B",
    performanceObject: "TCP framing defect",
    successCriteria: [
      "Failure is reproduced deterministically or characterized statistically",
      "Causal mechanism is demonstrated with discriminating evidence",
      "Correction is verified against the original failure mode",
    ],
    criticalErrors: ["guesses a fix without demonstrating the cause"],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L3-004",
    title: "Design meaningful tests for Rust network-I/O edge cases",
    statement:
      "Design tests for Rust network-I/O code that exercise partial reads, split frames, EOF, and error paths, with traceability from each test to the failure mode it guards against.",
    masteryLevel: 3,
    verbCode: "design",
    assuranceClass: "B",
    performanceObject: "network-I/O test design",
    successCriteria: [
      "Tests cover read-boundary, EOF, and error-path edge cases",
      "Each test is traceable to a specific failure mode",
      "Tests are deterministic",
    ],
    primaryCompetencyCode: RUST_NET,
  },

  // -------------------------------------------------------------------------
  // Rust / Network I/O — Levels 4–5
  // -------------------------------------------------------------------------
  {
    code: "RUST-NET-L4-001",
    title: "Diagnose complex asynchronous Rust network-I/O failures",
    statement:
      "Diagnose complex asynchronous Rust network-I/O failures involving cancellation, framing, timeout, or backpressure interactions under ambiguous evidence.",
    masteryLevel: 4,
    verbCode: "diagnose",
    assuranceClass: "C",
    performanceObject: "async network-I/O failure",
    successCriteria: [
      "Discriminates among interacting async failure mechanisms",
      "Evidence rules out plausible competing explanations",
      "Conclusion and correction verified under realistic load",
    ],
    criticalErrors: ["attributes the failure to an unverified mechanism"],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L4-002",
    title: "Evaluate and adapt network-I/O architecture under competing constraints",
    statement:
      "Evaluate and adapt a network-I/O architecture under competing performance and reliability constraints, justifying tradeoffs with measurements.",
    masteryLevel: 4,
    verbCode: "evaluate",
    assuranceClass: "C",
    performanceObject: "network-I/O architecture",
    successCriteria: [
      "Tradeoffs are justified with measurements, not intuition alone",
      "Adaptation preserves correctness properties (no data loss or duplication)",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L4-003",
    title: "Integrate robust framed I/O into a distributed service under partial failure",
    statement:
      "Integrate robust framed I/O into a distributed Rust service that behaves correctly under partial failure, including reconnection, retry, and backpressure handling.",
    masteryLevel: 4,
    verbCode: "integrate",
    assuranceClass: "C",
    performanceObject: "framed I/O in a distributed service",
    successCriteria: [
      "End-to-end behavior verified across component boundaries",
      "Partial-failure paths (disconnect, retry, backpressure) behave correctly",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L5-001",
    title: "Design and validate reusable Rust network-I/O abstractions adopted across systems",
    statement:
      "Design and validate reusable Rust network-I/O abstractions that are adopted across multiple production systems, with evidence of correctness and adoption.",
    masteryLevel: 5,
    verbCode: "design",
    assuranceClass: "C",
    performanceObject: "reusable network-I/O abstraction",
    successCriteria: [
      "Abstraction adopted by multiple production systems",
      "Correctness validated across adopters over time",
    ],
    primaryCompetencyCode: RUST_NET,
  },
  {
    code: "RUST-NET-L5-002",
    title:
      "Establish engineering practices that measurably reduce network-protocol defects across teams",
    statement:
      "Establish engineering practices, standards, or tooling that measurably reduce network-protocol defects across multiple teams, with longitudinal evidence.",
    masteryLevel: 5,
    verbCode: "establish",
    assuranceClass: "C",
    performanceObject: "organizational network-protocol practice",
    successCriteria: [
      "Practice adopted across multiple teams",
      "Measurable defect reduction over time attributable to the practice",
    ],
    primaryCompetencyCode: RUST_NET,
  },

  // -------------------------------------------------------------------------
  // Cross-competency prerequisites referenced by §18.4
  // -------------------------------------------------------------------------
  {
    code: "RUST-OWN-L2-001",
    title: "Use mutable slices safely in buffer-handling code",
    statement:
      "Implement buffer-handling functions that use mutable slices safely: correct sub-slicing by returned counts, no aliasing violations, and no reliance on stale data.",
    masteryLevel: 2,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "mutable slice handling",
    successCriteria: [
      "Sub-slices are bounded by valid counts",
      "Code compiles without fighting the borrow checker via unnecessary clones",
    ],
    primaryCompetencyCode: "rust.ownership-and-borrowing",
  },
  {
    code: "RUST-ERR-L2-001",
    title: "Handle Result and io::Error values in I/O code",
    statement:
      "Implement I/O code that handles Result and io::Error values idiomatically: propagation with ?, matching on error kinds where behavior differs, and no unwrap on fallible I/O paths.",
    masteryLevel: 2,
    verbCode: "implement",
    assuranceClass: "B",
    performanceObject: "Result and io::Error handling",
    successCriteria: [
      "Errors are propagated or handled deliberately, never unwrapped on I/O paths",
      "Error kinds with distinct handling requirements are distinguished",
    ],
    primaryCompetencyCode: "rust.error-handling",
  },
];
