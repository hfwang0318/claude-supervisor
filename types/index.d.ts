export type SourceFact = { id: string; path: string; startLine: number; quote: string; fileHash: string }
export type FactRequest = { paths: string[]; terms: string[]; searchPaths?: string[] }
// Host-owned source hashes include searched files, not just returned matches.
export type FactInspectionFailure = 'invalid-request' | 'deadline' | 'unsafe-path' | 'symlink' | 'source-missing' | 'source-type' | 'file-limit' | 'read-limit' | 'traversal-limit' | 'selected-file-limit' | 'source-changed' | 'secret-content' | 'output-limit' | 'no-facts' | 'validation-failed' | 'inspection-error' | 'inspection-unknown' | 'invalid-view' | 'redaction-rejected'
export type FactView = { facts: SourceFact[]; files: { path: string; fileHash: string }[]; manifestHash: string; incomplete: boolean; failureReason?: FactInspectionFailure; searchScope?: { paths: string[]; terms: string[] }; directories?: { path: string; entriesHash: string; version: string }[] }
export type AssistInput = { binding: Binding; asked: string; recentFacts: SourceFact[]; symptom: string }
export type ReviewDimension = 'requirement-plan' | 'plan-implementation' | 'architecture' | 'direction' | 'exploration' | 'verification' | 'recovery'
export type ReviewSource = { id: string; kind: 'requirement' | 'plan' | 'change' | 'tool' | 'observation' | 'answer' | 'narrative' | 'proposed-change'; text: string }
export type ReviewCheckpoint = { reviewId: string; checkpointId: string; observedAt: number; sequence: number; requirementSignature: string; materialSignature: string; sourceIds: string[]; lastTool?: { tool: string; toolUseId?: string; path?: string } }
export type ReviewContext = { opportunity?: { reasons: string[]; sequence: number; newSourceIds: string[]; priorAnchorIds: string[] }; checkpoint?: ReviewCheckpoint; binding: Binding; phase: 'plan' | 'exploration' | 'implementation' | 'failure' | 'completion'; sources: ReviewSource[]; scope: { omitted: string[]; repositoryComplete: false } }
export type ReviewJudgment = { dimension: ReviewDimension; question: string; requirementQuote: string; sourceIds: string[]; reason: string; impact: string; recommendation: 'continue' | 'adjust' | 'replan' | 'gather-evidence'; uncertainty: string }
export type ReviewAction = { kind: 'none' } | { kind: 'location'; request: FactRequest } | { kind: 'probe'; candidate: unknown } | { kind: 'recovery'; observationIds: string[]; question: string }
export type ReviewReply = { reviewed: ReviewDimension[]; judgment: ReviewJudgment | null; action: ReviewAction; report?: string; actionRejected?: boolean }
export type AssistPacket = {
  binding: Binding; kind: 'location' | 'probe' | 'recovery'; question: string
  requirementQuote: string; factIds: string[]; observationIds: string[]
  explanation: string; nextCheck: string | null; requiresMainJudgment: true
}

export type ModelPair = {
  workerId: string
  sideId: string
}

export type Binding = {
  sessionId: string
  generationId: string
  turnId: string
  taskRevision: number
  workspaceRevision: string
  snapshotId: string
}

export type RequirementRef = {
  id: string
  text: string
  sourceMessageId: string
  quote: string
  status: 'explicit' | 'inferred' | 'confirmed'
}

export type ExecutionEvidence = {
  id: string
  binding: Binding
  command: string
  cwd: string
  checkScope: string[]
  exitCode: number | null
  stdout: string
  stderr: string
  truncated: boolean
  outcome: 'passed' | 'failed' | 'environment-error' | 'unknown'
  startedAt: number
  endedAt: number
}

export type ProbeCandidate = {
  id: string
  binding: Binding
  requirementIds: string[]
  question: string
  command: string
  files: { path: string; content: string }[]
  oracle: 'existing-test' | 'spec-example' | 'invariant' | 'disagreement'
  oracleExplanation: string
  oracleSourceIds: string[]
}

export type Budget = {
  remainingSideCalls: number
  remainingOutputTokens: number
  remainingActiveMs: number
  deadlineMs: number
}

export type Snapshot = {
  id: string
  binding: Binding
  root: string
  sourceManifestHash: string
  isolation: 'boxed-copy' | 'read-only'
}

/** Authenticated by a host project-check adapter, never parsed from S output. */
export type VerifiedOracle = {
  requirementId: string
  command: string
  checkScope: string[]
  workspaceRevision: string
  snapshotId: string
  sourceFile: string
  sourceHash: string
}

export type Resolution = 'open' | 'fixed' | 'unknown'
export type IssueState = { resolution: Resolution; disclosed: boolean; contested: boolean }
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'stale'
export type DeliveryStatus = 'prepared' | 'delivered' | 'dropped' | 'unknown'
export type Intervention = {
  binding: Binding
  reason: string
  action: 'none' | 'probe' | 'recover' | 'context' | 'return-to-main'
  evidenceIds: string[]
  requiresMainJudgment: boolean
}

/** An item as the band shows it. */
export type Finding = {
  /** What is wrong, in one plain sentence. */
  what: string
  /** What shows it: the command that was run and what it printed, or the model's own words. */
  evidence: string
  /** What goes wrong if the assistant keeps going as it is. */
  cost: string
}

/** Where an item stands: closed by a command that passes (fixed), or by the model telling the person (told, refuted). */
export type Status = 'open' | 'fixed' | 'refuted' | 'told'

/** One item put to the model, numbered, tracked until it is settled. */
export type Issue = {
  resolution?: IssueState['resolution']
  disclosed?: boolean
  contested?: boolean
  binding?: Binding
  evidenceIds?: string[]
  checkScope?: string[]
  id: number
  /** When it was raised, epoch ms. */
  at: number
  /** Which check raised it: the verifier (a command's output contradicted the model) or a rule in code. */
  from: 'verify' | 'rule'
  /**
   * For a rule on the session's own record: which. On a claim of passing checks:
   * `failed-check` (the last run failed), `stale-check` (code edited since it
   * passed), `no-check` (none ran); `unreported-failure`, a turn that ends on a
   * failing check it does not mention; `skipped-check`, a turn asked to run the
   * checks that ran none and does not say so; `untouched`, a file said to be changed that
   * no tool call named. On the work itself: `stuck`, the same command failing the
   * same way three times; `edit-miss`, two edits against text the file lacks;
   * `weakened-test`, a test made weaker; `ignored-constraint`, a file the person
   * said not to touch, edited.
   */
  rule?:
    | 'skipped-check'
    | 'failed-check'
    | 'stale-check'
    | 'no-check'
    | 'unreported-failure'
    | 'untouched'
    | 'stuck'
    | 'edit-miss'
    | 'weakened-test'
    | 'ignored-constraint'
  /**
   * For a defect the reviewer found in the change: the text the probe's output holds
   * while the defect is there, and whether a command was seen to print it.
   */
  defect?: { expect: string; demonstrated: boolean }
  /** How many tool calls the session had made when the item was raised: runs after it are the ones that settle it. */
  pos?: number
  /** Where the quote was said, for a claim: the same claim said later is a new one, said there again is not. */
  said?: number
  /** What is actually so, in one plain sentence; never how to fix it. */
  what: string
  /** The model's own words the item is about. */
  quote: string
  /** The command the verifier ran, or for a rule what would settle it (`Read <path>`). */
  probe: string
  /** The verifier's: what the command printed, which contradicts the quote. */
  saw?: string
  /** The verifier's: a shell command that exits 0 exactly when the claim holds; it settles the item. */
  recheck?: string
  /** What goes wrong if the assistant keeps going as it is. */
  cost: string
  status: Status
  /** When it was settled, epoch ms. */
  settledAt?: number
  /** What settled it: the recheck's output, or the line the model wrote. */
  why?: string
}

/** This session's items; in $.state, so a hot reload keeps them. */
export type Track = {
  schemaVersion?: 2
  nextId: number
  issues: Issue[]
  /** The model's claims already handed to the verifier, so none is checked twice. */
  seen: string[]
  /** How many of the session's messages the checks during the work have read: older ones are not read again. */
  scanned?: number
  /** How many checks during the work called a model since the person's last prompt (each may make several calls). */
  runs: number
  /** The last change the verifier read to the end, by its signature: the same lines are not read twice. */
  reviewed?: string
}

/** What was last put to the model, drawn in the band above the prompt. */
export type Cards = {
  /** When the check that found them settled, epoch ms. */
  at: number
  items: Finding[]
}

/** One look at the context window, taken when a main-loop turn ends (hooks/weather.tsx). */
export type Reading = {
  tokens: number
  window: number
  percent: number
}

declare module 'claude-code' {
  interface PluginState {
    'code-supervisor': { cards: Cards | null; isHidden: boolean; track: Track; readings: Reading[] }
  }
}
