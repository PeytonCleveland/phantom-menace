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
    criteria: [
      {
        code: "describes-transport-value",
        statement: "Accurately describes what the transport layer provides beyond IP",
        kind: "success",
      },
      {
        code: "holds-up-to-probing",
        statement: "Explanation holds up under probing with follow-up questions",
        kind: "success",
      },
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
    criteria: [
      {
        code: "correct-handshake-sequence",
        statement: "Correctly sequences handshake and termination steps",
        kind: "success",
      },
      {
        code: "explains-step-purpose",
        statement: "Explains the purpose of each step, not just the order",
        kind: "success",
      },
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
    criteria: [
      {
        code: "states-ordering-guarantees",
        statement: "States TCP's ordering and delivery guarantees correctly",
        kind: "success",
      },
      {
        code: "describes-single-read-return",
        statement: "Correctly describes what a single read may return",
        kind: "success",
      },
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
    criteria: [
      {
        code: "explains-causal-mechanism",
        statement: "Explains the causal mechanism (segmentation, buffering, coalescing)",
        kind: "success",
      },
      {
        code: "states-framing-implication",
        statement: "States the implication: applications must frame their own messages",
        kind: "success",
      },
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
    criteria: [
      {
        code: "correct-unseen-predictions",
        statement: "Correct predictions across unseen read/buffer scenarios",
        kind: "success",
      },
      {
        code: "rationale-tied-to-semantics",
        statement: "Rationale tied to byte-stream semantics rather than memorized cases",
        kind: "success",
      },
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
    criteria: [
      {
        code: "interprets-zero-length-read",
        statement: "Correctly interprets a zero-length read",
        kind: "success",
      },
      {
        code: "explains-half-closed-behavior",
        statement: "Explains half-closed connection behavior in both directions",
        kind: "success",
      },
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
    criteria: [
      {
        code: "contrasts-datagram-boundaries",
        statement: "Correctly contrasts datagram boundaries with TCP's byte stream",
        kind: "success",
      },
      {
        code: "states-non-guarantees",
        statement: "States delivery and ordering non-guarantees accurately",
        kind: "success",
      },
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
    criteria: [
      {
        code: "correct-failure-predictions",
        statement: "Correct predictions for loss, duplication, and reordering cases",
        kind: "success",
      },
      {
        code: "identifies-tolerant-applications",
        statement: "Identifies which applications tolerate which failure modes",
        kind: "success",
      },
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
    criteria: [
      {
        code: "correct-protocol-classification",
        statement: "Correct classification across varied application scenarios",
        kind: "success",
      },
      {
        code: "explicit-distinction-basis",
        statement: "Explicit basis for each distinction",
        kind: "success",
      },
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
    criteria: [
      {
        code: "selects-appropriate-tool",
        statement: "Selects an appropriate inspection tool",
        kind: "success",
      },
      {
        code: "interprets-states-and-endpoints",
        statement: "Correctly interprets connection states and endpoints",
        kind: "success",
      },
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
    criteria: [
      {
        code: "uses-appropriate-checks",
        statement: "Uses appropriate checks (e.g. nc, curl, ss) to test the endpoint",
        kind: "success",
      },
      {
        code: "distinguishes-refusal-timeout-success",
        statement: "Correctly distinguishes refusal, timeout, and success",
        kind: "success",
      },
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
    criteria: [
      {
        code: "accurate-failure-interpretation",
        statement: "Accurate interpretation across representative failure variations",
        kind: "success",
      },
      {
        code: "states-causes-and-next-step",
        statement: "States likely causes and next diagnostic step for each",
        kind: "success",
      },
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
    criteria: [
      {
        code: "exchanges-datagrams-successfully",
        statement: "Successfully exchanges datagrams between two endpoints",
        kind: "success",
      },
      {
        code: "reports-boundary-behavior",
        statement: "Observes and correctly reports datagram boundary behavior",
        kind: "success",
      },
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
    criteria: [
      {
        code: "plausible-tested-hypotheses",
        statement: "Hypotheses are plausible and tested with discriminating evidence",
        kind: "success",
      },
      {
        code: "verified-causal-conclusion",
        statement: "Causal conclusion is verified, not guessed",
        kind: "success",
      },
      {
        code: "no-unverified-cause",
        statement: "Does not declare a cause without verification",
        kind: "critical_error",
      },
    ],
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
    criteria: [
      {
        code: "explicit-appropriate-criteria",
        statement: "Criteria are explicit and appropriate to the requirement",
        kind: "success",
      },
      {
        code: "substantiated-recommendation",
        statement: "Recommendation is substantiated with accurate findings",
        kind: "success",
      },
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
    criteria: [
      {
        code: "discriminates-multilayer-explanations",
        statement: "Systematically discriminates between multi-layer explanations",
        kind: "success",
      },
      {
        code: "handles-false-leads",
        statement: "Handles false leads without fixating on an early hypothesis",
        kind: "success",
      },
      {
        code: "verified-under-intermittent-condition",
        statement: "Conclusion verified under the intermittent condition",
        kind: "success",
      },
      {
        code: "no-undemonstrated-fix",
        statement: "Does not ship a fix without demonstrating the causal mechanism",
        kind: "critical_error",
      },
    ],
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
    criteria: [
      {
        code: "addresses-interacting-constraints",
        statement: "Tradeoff analysis addresses interacting constraints, not one dimension",
        kind: "success",
      },
      {
        code: "substantiated-judgment",
        statement: "Judgment substantiated with evidence and explicit criteria",
        kind: "success",
      },
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
    criteria: [
      {
        code: "adopted-beyond-single-team",
        statement: "Practice or standard adopted beyond a single system or team",
        kind: "success",
      },
      {
        code: "longitudinal-reliability-evidence",
        statement: "Longitudinal evidence of measurable reliability improvement",
        kind: "success",
      },
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
    criteria: [
      {
        code: "maps-behavior-to-semantics",
        statement: "Maps TcpStream read/write behavior to TCP semantics correctly",
        kind: "success",
      },
      {
        code: "survives-edge-case-probing",
        statement: "Explanation survives probing with edge cases (short reads, EOF)",
        kind: "success",
      },
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
    criteria: [
      {
        code: "reports-buffer-states-and-counts",
        statement: "Accurately reports intermediate buffer states and counts",
        kind: "success",
      },
      {
        code: "accounts-for-leftover-bytes",
        statement: "Accounts for leftover and unconsumed bytes, not just the final state",
        kind: "success",
      },
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
    criteria: [
      {
        code: "distinguishes-ok-err-cases",
        statement: "Correctly distinguishes Ok(n), Ok(0), and Err cases",
        kind: "success",
      },
      {
        code: "states-caller-obligations",
        statement: "States caller obligations for each condition",
        kind: "success",
      },
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
    criteria: [
      {
        code: "connection-succeeds",
        statement: "Connection succeeds against a live endpoint",
        kind: "success",
      },
      {
        code: "failure-handled-not-panicked",
        statement: "Connection failure surfaces as a handled error, not a panic",
        kind: "success",
      },
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
    criteria: [
      {
        code: "bounds-by-returned-count",
        statement: "Only the returned count of bytes is treated as valid data",
        kind: "success",
      },
      {
        code: "no-stale-byte-exposure",
        statement: "Buffer reuse does not expose stale bytes",
        kind: "success",
      },
      {
        code: "no-full-buffer-processing",
        statement: "Does not process the full buffer regardless of bytes read",
        kind: "critical_error",
      },
    ],
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
    criteria: [
      {
        code: "no-one-read-one-message",
        statement: "Does not assume one read returns one complete message",
        kind: "critical_error",
      },
      {
        code: "no-discarded-bytes",
        statement: "Does not discard bytes from an incomplete unit",
        kind: "critical_error",
      },
      {
        code: "preserves-incomplete-data",
        statement: "Incomplete data is preserved across successive reads",
        kind: "success",
      },
      {
        code: "correct-for-any-split",
        statement: "Behavior is correct for any read-boundary split",
        kind: "success",
      },
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
    criteria: [
      {
        code: "eof-handled-per-protocol",
        statement: "EOF is detected and handled according to protocol state",
        kind: "success",
      },
      {
        code: "handles-interrupted-wouldblock",
        statement: "Interrupted and WouldBlock conditions are handled appropriately",
        kind: "success",
      },
      {
        code: "no-eof-infinite-loop",
        statement: "Does not treat EOF as an infinite-loop read of zero bytes",
        kind: "critical_error",
      },
    ],
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
    criteria: [
      {
        code: "delivers-message-exactly-once",
        statement: "All bytes of the logical message are delivered exactly once",
        kind: "success",
      },
      {
        code: "surfaces-write-errors",
        statement: "Write errors are surfaced, not swallowed",
        kind: "success",
      },
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
    criteria: [
      {
        code: "satisfies-stated-requirements",
        statement: "Configuration satisfies the stated requirements",
        kind: "success",
      },
      {
        code: "verifies-timeout-path",
        statement: "Resulting behavior is verified, including the timeout path",
        kind: "success",
      },
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
    criteria: [
      {
        code: "preserves-datagram-boundaries",
        statement: "Datagrams are exchanged with boundaries preserved",
        kind: "success",
      },
      {
        code: "handles-truncation-correctly",
        statement: "Receive-buffer sizing and truncation behavior handled correctly",
        kind: "success",
      },
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
    criteria: [
      {
        code: "preserve-incomplete-data",
        statement: "Incomplete frame data is preserved across arbitrary read boundaries",
        kind: "success",
      },
      {
        code: "multiple-frames-per-read",
        statement: "Multiple complete frames within one read are all processed",
        kind: "success",
      },
      {
        code: "split-header-and-body",
        statement: "Frame headers and bodies split across reads are handled",
        kind: "success",
      },
      {
        code: "eof-and-io-errors",
        statement: "EOF and I/O errors are handled according to protocol state",
        kind: "success",
      },
      {
        code: "no-data-loss",
        statement: "No bytes are lost, duplicated, or reordered",
        kind: "critical_error",
      },
      {
        code: "boundary-verification",
        statement: "Behavior is verified with tests covering varied read boundaries",
        kind: "verification",
      },
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
    criteria: [
      {
        code: "well-formed-parseable-frames",
        statement: "Frames are well-formed and parseable by a conforming reader",
        kind: "success",
      },
      {
        code: "no-interleaved-truncated-frames",
        statement: "Partial writes are completed; no interleaved or truncated frames",
        kind: "success",
      },
      {
        code: "surfaces-failures-with-context",
        statement: "Write failures are surfaced with usable error context",
        kind: "success",
      },
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
    criteria: [
      {
        code: "reproduces-or-characterizes-failure",
        statement: "Failure is reproduced deterministically or characterized statistically",
        kind: "success",
      },
      {
        code: "demonstrates-causal-mechanism",
        statement: "Causal mechanism is demonstrated with discriminating evidence",
        kind: "success",
      },
      {
        code: "verifies-correction-against-failure",
        statement: "Correction is verified against the original failure mode",
        kind: "success",
      },
      {
        code: "no-guessed-fix",
        statement: "Does not guess a fix without demonstrating the cause",
        kind: "critical_error",
      },
    ],
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
    criteria: [
      {
        code: "covers-key-edge-cases",
        statement: "Tests cover read-boundary, EOF, and error-path edge cases",
        kind: "success",
      },
      {
        code: "traceable-to-failure-mode",
        statement: "Each test is traceable to a specific failure mode",
        kind: "success",
      },
      {
        code: "deterministic-tests",
        statement: "Tests are deterministic",
        kind: "success",
      },
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
    criteria: [
      {
        code: "discriminates-async-mechanisms",
        statement: "Discriminates among interacting async failure mechanisms",
        kind: "success",
      },
      {
        code: "rules-out-competing-explanations",
        statement: "Evidence rules out plausible competing explanations",
        kind: "success",
      },
      {
        code: "verified-under-realistic-load",
        statement: "Conclusion and correction verified under realistic load",
        kind: "success",
      },
      {
        code: "no-unverified-attribution",
        statement: "Does not attribute the failure to an unverified mechanism",
        kind: "critical_error",
      },
    ],
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
    criteria: [
      {
        code: "justified-with-measurements",
        statement: "Tradeoffs are justified with measurements, not intuition alone",
        kind: "success",
      },
      {
        code: "preserves-correctness-properties",
        statement: "Adaptation preserves correctness properties (no data loss or duplication)",
        kind: "success",
      },
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
    criteria: [
      {
        code: "verified-across-boundaries",
        statement: "End-to-end behavior verified across component boundaries",
        kind: "success",
      },
      {
        code: "correct-partial-failure-paths",
        statement: "Partial-failure paths (disconnect, retry, backpressure) behave correctly",
        kind: "success",
      },
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
    criteria: [
      {
        code: "adopted-by-multiple-systems",
        statement: "Abstraction adopted by multiple production systems",
        kind: "success",
      },
      {
        code: "validated-across-adopters",
        statement: "Correctness validated across adopters over time",
        kind: "success",
      },
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
    criteria: [
      {
        code: "adopted-across-teams",
        statement: "Practice adopted across multiple teams",
        kind: "success",
      },
      {
        code: "measurable-defect-reduction",
        statement: "Measurable defect reduction over time attributable to the practice",
        kind: "success",
      },
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
    criteria: [
      {
        code: "bounded-by-valid-counts",
        statement: "Sub-slices are bounded by valid counts",
        kind: "success",
      },
      {
        code: "compiles-without-unnecessary-clones",
        statement: "Code compiles without fighting the borrow checker via unnecessary clones",
        kind: "success",
      },
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
    criteria: [
      {
        code: "deliberate-error-handling",
        statement: "Errors are propagated or handled deliberately, never unwrapped on I/O paths",
        kind: "success",
      },
      {
        code: "distinguishes-error-kinds",
        statement: "Error kinds with distinct handling requirements are distinguished",
        kind: "success",
      },
    ],
    primaryCompetencyCode: "rust.error-handling",
  },
];
