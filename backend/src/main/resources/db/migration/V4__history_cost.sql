-- Cost analytics: cached prompt tokens and prompt size per evaluation, prices per model.
ALTER TABLE evaluation ADD COLUMN tokens_cached INT;
ALTER TABLE evaluation ADD COLUMN prompt_chars  INT;   -- length of the prompt sent (all attempts), to compare with tokens

-- Prices in USD per 1 million tokens. Filled by OKK in "Модели AI" from the provider's price page.
-- cost = (tokens_in - tokens_cached) * input + tokens_cached * cached + tokens_out * output, / 1e6
CREATE TABLE model_price (
  model            TEXT PRIMARY KEY,
  input_per_mtok   NUMERIC(10,4) NOT NULL,
  cached_per_mtok  NUMERIC(10,4),          -- null = same as input
  output_per_mtok  NUMERIC(10,4) NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO model_price(model, input_per_mtok, cached_per_mtok, output_per_mtok) VALUES ('heuristic-v1', 0, 0, 0);

-- Google retired gemini-2.5-flash for new keys (404 "no longer available to new users").
UPDATE llm_route SET model = 'gemini-3.8-flash', updated_at = now() WHERE model = 'gemini-2.5-flash';

CREATE INDEX ix_evaluation_conversation ON evaluation(conversation_id, created_at DESC);
