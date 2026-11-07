-- ============ Import and conversations ============
CREATE TABLE import_run (
  id            BIGSERIAL PRIMARY KEY,
  group_id      TEXT        NOT NULL,
  business_date DATE        NOT NULL,         -- date given to chats (chats have no date)
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at   TIMESTAMPTZ,
  total         INT,
  imported      INT,
  skipped       INT,
  status        TEXT NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','DONE','FAILED')),
  error_text    TEXT
);

CREATE TABLE operator (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE,
  source     TEXT    NOT NULL CHECK (source IN ('TRANSCRIPT','DEMO','UNKNOWN')),
  fictional  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversation (
  id                    TEXT PRIMARY KEY,          -- p1-ru-001
  group_id              TEXT NOT NULL,             -- DEV / TEST ...
  import_run_id         BIGINT REFERENCES import_run(id),
  channel               TEXT NOT NULL CHECK (channel IN ('CHAT','VOICE')),
  channel_raw           TEXT NOT NULL,             -- "agent chat" / "voice call"
  language              TEXT NOT NULL,             -- RU / KZ / EN
  audio_page_url        TEXT,                      -- HTML player page, NOT the mp3
  conversation_date     DATE NOT NULL,             -- analytics "by day"
  date_source           TEXT NOT NULL CHECK (date_source IN ('TRANSCRIPT','IMPORT')),
  started_at            TIMESTAMPTZ,               -- only calls have a real start time
  duration_sec          NUMERIC(10,1),             -- first to last message
  operator_duration_sec NUMERIC(10,1),             -- first operator message to end
  message_count         INT  NOT NULL,
  operator_start_seq    INT,                       -- first operator message, null if none
  operator_id           BIGINT REFERENCES operator(id),
  operator_name_raw     TEXT,                      -- name as found in the transcript
  imported_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_conversation_date ON conversation(conversation_date);
CREATE INDEX ix_conversation_operator ON conversation(operator_id);

CREATE TABLE message (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  seq             INT  NOT NULL,                   -- 1..N, used as evidence id
  timestamp_raw   TEXT NOT NULL,                   -- "01:15" or ISO date-time
  offset_sec      NUMERIC(10,3),                   -- seconds from the first message
  speaker         TEXT NOT NULL CHECK (speaker IN ('client','operator','bot','system')),
  text            TEXT NOT NULL,
  UNIQUE (conversation_id, seq)
);

-- ============ Checklist configuration ============
CREATE TABLE checklist_version (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT    NOT NULL,
  version_no INT     NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_one_active_checklist ON checklist_version(is_active) WHERE is_active;

CREATE TABLE criterion (
  id                   BIGSERIAL PRIMARY KEY,
  checklist_version_id BIGINT  NOT NULL REFERENCES checklist_version(id),
  code                 TEXT    NOT NULL,
  section              TEXT    NOT NULL,
  sort_order           INT     NOT NULL,
  title                TEXT    NOT NULL,
  instruction          TEXT    NOT NULL,           -- goes into the LLM prompt as is
  answer_type          TEXT    NOT NULL CHECK (answer_type IN ('BOOLEAN','SCALE','FLAG')),
  weight               NUMERIC(6,2) NOT NULL CHECK (weight >= 0),
  allow_na             BOOLEAN NOT NULL DEFAULT false,
  na_condition         TEXT    NOT NULL DEFAULT '',
  steps                JSONB   NOT NULL DEFAULT '[]',  -- [{"value":20,"label":"..."}]
  fingerprint          TEXT    NOT NULL,           -- md5(code|instruction), links AI corrections
  UNIQUE (checklist_version_id, code)
);

-- ============ LLM choice ============
CREATE TABLE llm_route (                 -- which model evaluates which language
  language   TEXT PRIMARY KEY,           -- RU / KZ / EN / DEFAULT
  provider   TEXT NOT NULL CHECK (provider IN ('ANTHROPIC','OPENAI','GEMINI','MOCK')),
  model      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE app_setting (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============ Evaluation ============
CREATE TABLE eval_batch (
  id          BIGSERIAL PRIMARY KEY,
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','FAILED')),
  total       INT  NOT NULL,
  provider    TEXT,                      -- null = use the language route
  model       TEXT,
  filter_json TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE evaluation (
  id                   BIGSERIAL PRIMARY KEY,
  conversation_id      TEXT   NOT NULL REFERENCES conversation(id),
  checklist_version_id BIGINT NOT NULL REFERENCES checklist_version(id),
  batch_id             BIGINT REFERENCES eval_batch(id),
  is_latest            BOOLEAN NOT NULL DEFAULT true,
  status               TEXT   NOT NULL CHECK (status IN ('PENDING','DONE','FAILED')),
  provider             TEXT   NOT NULL,
  model                TEXT   NOT NULL,
  simulated            BOOLEAN NOT NULL DEFAULT false,  -- MOCK provider
  ai_total             NUMERIC(5,2),                    -- never changed after the AI run
  final_total          NUMERIC(5,2),                    -- after appeals
  ai_gross_error       BOOLEAN,
  final_gross_error    BOOLEAN,
  corrections_used     INT NOT NULL DEFAULT 0,
  prompt_version       TEXT,
  attempts             INT NOT NULL DEFAULT 0,
  tokens_in            INT,
  tokens_out           INT,
  latency_ms           INT,
  raw_response         TEXT,
  error_text           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at          TIMESTAMPTZ
);
CREATE UNIQUE INDEX ux_one_latest_eval ON evaluation(conversation_id) WHERE is_latest;
CREATE INDEX ix_evaluation_batch ON evaluation(batch_id);

CREATE TABLE criterion_result (
  id            BIGSERIAL PRIMARY KEY,
  evaluation_id BIGINT  NOT NULL REFERENCES evaluation(id) ON DELETE CASCADE,
  criterion_id  BIGINT  NOT NULL REFERENCES criterion(id),
  ai_value      NUMERIC(6,2),
  ai_is_na      BOOLEAN NOT NULL DEFAULT false,
  ai_points     NUMERIC(6,2),
  final_value   NUMERIC(6,2),
  final_is_na   BOOLEAN NOT NULL DEFAULT false,
  final_points  NUMERIC(6,2),
  max_points    NUMERIC(6,2),
  explanation   TEXT    NOT NULL,
  confidence    NUMERIC(3,2),
  UNIQUE (evaluation_id, criterion_id)
);

CREATE TABLE evidence (
  id                  BIGSERIAL PRIMARY KEY,
  criterion_result_id BIGINT NOT NULL REFERENCES criterion_result(id) ON DELETE CASCADE,
  message_seq         INT    NOT NULL,
  quote               TEXT
);

-- ============ Appeals and AI learning ============
CREATE TABLE appeal (
  id                  BIGSERIAL PRIMARY KEY,
  criterion_result_id BIGINT NOT NULL REFERENCES criterion_result(id),
  operator_id         BIGINT REFERENCES operator(id),
  comment             TEXT   NOT NULL,
  desired_value       NUMERIC(6,2),
  desired_is_na       BOOLEAN,
  status              TEXT   NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REJECTED','ACCEPTED')),
  reviewer_name       TEXT,
  decision_reason     TEXT,
  new_value           NUMERIC(6,2),
  new_is_na           BOOLEAN,
  add_to_examples     BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at          TIMESTAMPTZ
);
CREATE UNIQUE INDEX ux_one_open_appeal ON appeal(criterion_result_id) WHERE status = 'OPEN';

CREATE TABLE ai_correction (              -- "memory" of AI mistakes, injected into prompts
  id                    BIGSERIAL PRIMARY KEY,
  appeal_id             BIGINT REFERENCES appeal(id),
  criterion_code        TEXT    NOT NULL,
  criterion_fingerprint TEXT    NOT NULL,
  criterion_title       TEXT    NOT NULL,
  language              TEXT    NOT NULL,
  snippet               TEXT    NOT NULL,
  ai_value              TEXT    NOT NULL,
  correct_value         TEXT    NOT NULL,
  reason                TEXT    NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ai_correction_fp ON ai_correction(criterion_fingerprint) WHERE is_active;
