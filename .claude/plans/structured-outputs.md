# Plan: JSON-Schema Structured Outputs across all 4 AI providers

## Goal
Add optional schema-constrained JSON output to the AI layer, and use it in the
query engine so the query envelope (`operation/filterCode/aggregation/...`) is
guaranteed-parseable with valid enums — eliminating `parseAIQuery`'s regex
extraction failures and invalid `aggregation`/`groupBy` values. `filterCode`
stays a JS string, so `autoCorrectQuery`/`validateQueryCode` are UNCHANGED.

Ticker lookup (`fetchTickersFromLLM`) is DEAD CODE (no call site) — skip it.

## Threading the option (new 3rd/4th param)
- `AIProvider.call(prompt, context = null, options = {})` — `options.jsonSchema = { name, schema }`.
- `AIProvider.callProvider(provider, prompt, context, options = {})` — forwards to each provider.
  - gemini/chatgpt/perplexity: `.call(prompt, context, options)`
  - groq: `.call(prompt, context, [], options)`  (4th param; conversationHistory stays 3rd)
- Fallback loop passes `options` unchanged to every attempt (schema must apply to whichever provider runs).
- `callWithWebSearch` — leave alone (no schema; it's for grounded prose).

## Shared helper
`AIProvider.buildOpenAIResponseFormat(jsonSchema, { strict })`:
returns `{ type: 'json_schema', json_schema: { name, strict, schema } }` (omit `strict` key when false).

## Per-provider wiring
- **chatgpt.js**: if `options.jsonSchema`, add `response_format` = buildOpenAIResponseFormat(schema, {strict:true}). gpt-4o-mini supports strict.
- **groq.js**: `_request()` gains a `responseFormat` arg; `call()` accepts `options` (4th param), passes `options.jsonSchema` down the effort ladder. gpt-oss-120b supports strict. Effort ladder + salvage PRESERVED.
- **perplexity.js**: if `options.jsonSchema`, add `response_format` = buildOpenAIResponseFormat(schema, {strict:false}) (Perplexity has no strict; optional-by-omission). Keep search_domain_filter.
- **gemini.js**: if `options.jsonSchema`, set `generationConfig.responseMimeType='application/json'` + `responseSchema=schema`, and SKIP the google_search tool (mutually exclusive on 2.5). Multi-part join stays.

## Query engine
- `queryEngine.js`: export a `QUERY_ENVELOPE_SCHEMA(mode)` builder (expenses vs investments enums differ) — OpenAPI-subset-compatible object:
  - operation: string enum ['filter']
  - filterCode: string (required)
  - aggregation: string enum ['sum','count','average','group','none']
  - aggregationField: string|null (expenses: amount/id; inv: amount/quantity) — keep as plain string, nullable
  - groupBy: string|null (expenses: category/month/year/event; inv: type/goal/currency)
  - explanation: string
  - Strict-safe shape: all props in `required`, nullable via type union where a provider needs it; but since Gemini/Perplexity don't require all-required and OpenAI/Groq do, the schema must satisfy the STRICTEST (OpenAI/Groq): every prop in required, optional→nullable. Use type:['string','null'] for aggregationField/groupBy; additionalProperties:false.
  - NOTE: Gemini's OpenAPI subset uses `nullable:true` not type-union, and doesn't need additionalProperties. So the schema passed to Gemini must be transformed. Simplest: pass the SAME logical schema and let buildResponseFormat / gemini path adapt. Given complexity, define TWO shapes: an OpenAI/strict shape and a Gemini shape, both from one source-of-truth builder.
- `chat.js` phase-1 call site: pass `{ jsonSchema: { name, schema } }` as 3rd arg to `AIProvider.call(phase1Prompt, null, { jsonSchema })`.
- `parseAIQuery` keeps working (JSON.parse of a now-guaranteed-clean envelope); regex extraction stays as a defensive fallback for providers that ignore the schema.

## Tests (full coverage)
- NEW `test/unit/queryEngine.test.js`: parseAIQuery (valid/malformed/fenced), autoCorrectQuery (all 8 transforms), validateQueryCode (each blocked pattern + allowed), executeQuery (sum/count/average/group/none + groupBy month/year buckets + filter throw→drop), QUERY_ENVELOPE_SCHEMA shape/enums.
- `test/unit/aiProviders.test.js`: per-provider — schema lands on wire (response_format for openai/groq/pplx; responseSchema+mime for gemini; gemini SKIPS google_search when schema set; groq strict + effort ladder still works WITH schema; pplx non-strict).
- `test/unit/provider.test.js`: update every `toHaveBeenCalledWith` to include the new options arg; add tests that options threads through call→callProvider and through the fallback loop unchanged.

## Verify
- `npm test` all green
- `npx cap sync android`
