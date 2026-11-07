/** PROPOSED DTOs, pending teammate approval. See docs/API_CONTRACT_PROPOSAL.md. */
export type Role = 'OPERATOR' | 'OKK';
export interface Scope {
  role: Role;
  operatorId?: string;
}
export interface Operator {
  id: string;
  name: string;
  fictional: boolean;
}
export type EvaluationStatus = 'NOT_EVALUATED' | 'PENDING' | 'DONE' | 'FAILED';
export type AppealStatus = 'OPEN' | 'REJECTED' | 'ACCEPTED';
export type AnswerType = 'BOOLEAN' | 'SCALE' | 'FLAG';
export interface Criterion {
  id: string;
  code: string;
  title: string;
  section: string;
  instruction: string;
  answerType: AnswerType;
  weight: number;
  allowNa: boolean;
  naCondition: string;
  steps: { value: number; label: string }[];
}
export interface Checklist {
  id: string;
  version: number;
  name: string;
  active: boolean;
  createdAtLabel: string;
  criteria: Criterion[];
}
export interface Answer {
  value: number | null;
  isNa: boolean;
}
export interface ResultValue extends Answer {
  points: number | null;
  maxPoints: number | null;
}
export interface Evidence {
  messageSeq: number;
  offsetSec: number | null;
}
export interface CriterionResult {
  id: string;
  criterion: Criterion;
  original: ResultValue;
  final: ResultValue;
  confidence: number;
  explanation: string;
  evidence: Evidence[];
  decision: { status: Exclude<AppealStatus, 'OPEN'>; reason: string; value: Answer | null } | null;
}
export interface Evaluation {
  id: string;
  checklistId: string;
  checklistVersion: number;
  originalScore: number | null;
  finalScore: number | null;
  scoreNote: string | null;
  grossError: boolean;
  simulated: boolean;
  correctionsUsed: number;
  sections: { title: string; originalScore: number | null; finalScore: number | null }[];
  results: CriterionResult[];
}
export interface Message {
  seq: number;
  role: 'client' | 'operator' | 'bot' | 'system';
  text: string;
  timestampRaw: string;
  offsetSec: number | null;
  timeLabel: string;
}
export interface ConversationSummary {
  id: string;
  groupId: string;
  operatorId: string;
  operatorName: string;
  fictionalAssignment: boolean;
  channel: 'CHAT' | 'VOICE';
  language: 'RU' | 'KZ' | 'EN';
  dateRaw: string;
  dateLabel: string;
  status: EvaluationStatus;
  finalScore: number | null;
  grossError: boolean;
  openAppeals: number;
  reviewed: boolean;
  error: string | null;
}
export interface Conversation extends ConversationSummary {
  operatorStartSeq: number | null;
  messages: Message[];
  evaluation: Evaluation | null;
}
export interface Filters {
  search?: string;
  status?: string;
  channel?: string;
  language?: string;
  from?: string;
  to?: string;
  minScore?: string;
  maxScore?: string;
  page?: number;
  size?: number;
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}
export interface Batch {
  id: string;
  status: 'PENDING' | 'DONE' | 'FAILED';
  done: number;
  total: number;
  failed: number;
  errors: { conversationId: string; message: string }[];
}
export interface ImportResult {
  imported: number;
  skipped: number;
  groupId: string;
}
export interface Appeal {
  id: string;
  conversationId: string;
  criterionResultId: string;
  criterionTitle: string;
  operatorId: string;
  operatorName: string;
  comment: string;
  desired: Answer | null;
  status: AppealStatus;
  createdAtLabel: string;
  reason: string | null;
  original: ResultValue;
  corrected: Answer | null;
}
export interface DecisionInput {
  status: 'ACCEPTED' | 'REJECTED';
  reason: string;
  newValue: Answer | null;
  addToExamples: boolean;
}
export interface AudioSource {
  streamUrl: string | null;
  expiresAt: string | null;
  audioPageUrl: string | null;
}
export interface Analytics {
  averageScore: number | null;
  evaluated: number;
  total: number;
  grossErrors: number;
  openAppeals: number;
  acceptedAppealRate: number | null;
  distribution: { label: string; count: number }[];
  weakCriteria: { title: string; label: string }[];
  simulated: boolean;
}
export interface Rating {
  operatorId: string;
  name: string;
  rank: number | null;
  score: number | null;
  conversations: number;
  grossErrors: number;
  level: string;
  bonusLabel: string;
  pointsToNext: number | null;
  eligible: boolean;
  badges: string[];
  trend: { label: string; score: number }[];
  weakCriteria: string[];
}
export interface Correction {
  id: string;
  criterionTitle: string;
  language: string;
  originalLabel: string;
  correctedLabel: string;
  reason: string;
  snippet: string;
  active: boolean;
}
export interface CqaApi {
  operators(): Promise<Operator[]>;
  conversations(scope: Scope, filters?: Filters): Promise<Page<ConversationSummary>>;
  conversation(id: string, scope: Scope): Promise<Conversation>;
  importGroup(groupId: string, scope: Scope): Promise<ImportResult>;
  evaluate(id: string, scope: Scope): Promise<void>;
  startBatch(ids: string[], scope: Scope): Promise<Batch>;
  batch(id: string, scope: Scope): Promise<Batch>;
  checklists(): Promise<Checklist[]>;
  saveChecklist(input: { name: string; criteria: Criterion[] }, scope: Scope): Promise<Checklist>;
  activateChecklist(id: string, scope: Scope): Promise<void>;
  appeals(scope: Scope, status?: string): Promise<Appeal[]>;
  createAppeal(
    resultId: string,
    input: { comment: string; desired: Answer | null },
    scope: Scope,
  ): Promise<Appeal>;
  decide(id: string, input: DecisionInput, scope: Scope): Promise<Appeal>;
  audio(id: string, scope: Scope): Promise<AudioSource>;
  analytics(scope: Scope): Promise<Analytics>;
  leaderboard(scope: Scope): Promise<Rating[]>;
  corrections(scope: Scope): Promise<Correction[]>;
  updateCorrection(id: string, active: boolean, scope: Scope): Promise<void>;
}
