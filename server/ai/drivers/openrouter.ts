/**
 * OpenRouter driver — `@openrouter/agent` SDK.
 *
 * Auth:
 *   API key only. The driver constructs a per-call `new OpenRouter({ apiKey })`
 *   so the host process env is never mutated and concurrent chats with
 *   different keys don't race. The SDK targets OpenRouter's OpenAI-compatible
 *   Responses API at `https://openrouter.ai/api/v1` by default.
 *
 * Tool registration:
 *   AiTool inputSchemas are TypeBox; the SDK's `tool()` requires a Zod object
 *   schema. We reuse `typeboxObjectToZodRawShape` (the shared TypeBox→Zod
 *   converter) and wrap it in `z.object(...)`. Each tool's `execute` routes to
 *   our server-side handler or the browser bridge — the SDK drives the
 *   multi-turn loop and feeds results back to the model automatically.
 *
 * Streaming:
 *   `callModel(...).getFullResponsesStream()` yields a single ordered event
 *   stream. The driver normalises four flavours into canonical AiStreamEvent:
 *     - `response.output_text.delta`           → `{ type: 'text' }`
 *     - `response.output_item.done` (fn call)  → `{ type: 'toolCall' }`
 *     - `tool.result`                          → `{ type: 'toolResult' }`
 *     - `response.completed`                   → `{ type: 'usage' }` (native cost)
 *
 * Cost:
 *   OpenRouter reports per-call USD cost on `usage.cost`. The driver emits it
 *   as `usage.costUsd`, which the persister honours directly — so OpenRouter's
 *   400+ models never need an entry in the static `pricing.ts` table.
 *
 * Models:
 *   `listModels()` fetches OpenRouter's live `/api/v1/models` catalog and maps
 *   each entry's `supported_parameters` / `architecture.input_modalities` into
 *   our capability flags.
 *
 * Gated by `ai-driver-isolation.test.ts` — this is the only legal importer of
 * `@openrouter/agent` (and one of the few legal `zod` importers) in the repo.
 */

import { OpenRouter, tool, isToolResultEvent } from '@openrouter/agent'
import { z } from 'zod'
import { Type, parseValue } from '@core/utils/typeboxHelpers'
import type { TSchema } from '@sinclair/typebox'
import type {
  AiAuthMode,
  AiMessage,
  AiProviderId,
  AiStreamEvent,
  AiTool,
  AiToolOutput,
  ToolContext,
} from '../runtime/types'
import type {
  AiProvider,
  AiProviderCapabilities,
  AiProviderModel,
  AiResolvedCredential,
  AiStreamRequest,
} from './types'
import { typeboxObjectToZodRawShape } from './typeboxToZod'

const SUPPORTED_AUTH_MODES: AiAuthMode[] = ['apiKey']

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

// Capabilities are per-model and only knowable after `listModels()` has hit
// the catalog. The sync `capabilities()` accessor returns a permissive default
// (most OpenRouter models tool-call); the picker uses the richer per-model
// flags from `listModels()` when present.
const DEFAULT_CAPABILITIES: AiProviderCapabilities = {
  toolCalling: true,
  visionInput: false,
  promptCache: false,
  streaming: true,
}

export const openrouterDriver: AiProvider = {
  id: 'openrouter' as AiProviderId,
  label: 'OpenRouter',
  supportedAuthModes: SUPPORTED_AUTH_MODES,

  capabilities(_modelId: string) {
    return DEFAULT_CAPABILITIES
  },

  async listModels(creds: AiResolvedCredential) {
    return fetchOpenRouterModels(creds)
  },

  async *stream(req: AiStreamRequest): AsyncIterable<AiStreamEvent> {
    yield* runOpenRouterStream(req)
  },
}

// ---------------------------------------------------------------------------
// Live model catalogue
// ---------------------------------------------------------------------------

const OpenRouterModelSchema = Type.Object({
  id: Type.String(),
  name: Type.Optional(Type.String()),
  architecture: Type.Optional(
    Type.Object({
      input_modalities: Type.Optional(Type.Array(Type.String())),
    }),
  ),
  supported_parameters: Type.Optional(Type.Array(Type.String())),
})

const OpenRouterModelsResponseSchema = Type.Object({
  data: Type.Array(OpenRouterModelSchema),
})

async function fetchOpenRouterModels(creds: AiResolvedCredential): Promise<AiProviderModel[]> {
  const headers: Record<string, string> = {}
  // The catalogue endpoint is public, but sending the bearer lets per-key
  // availability (e.g. BYOK-only models) reflect in the list.
  if (creds.apiKey) headers.Authorization = `Bearer ${creds.apiKey}`

  const res = await fetch(`${OPENROUTER_BASE_URL}/models`, { headers })
  if (!res.ok) {
    throw new Error(`[ai/openrouter] models request failed: ${res.status} ${res.statusText}`)
  }

  // Validate the external API body at the boundary (no `as` cast).
  const parsed = parseValue(OpenRouterModelsResponseSchema, await res.json())

  return parsed.data.map((model) => {
    const params = model.supported_parameters ?? null
    const modalities = model.architecture?.input_modalities ?? null
    return {
      id: model.id,
      label: model.name ?? model.id,
      capabilities: {
        // When the catalogue declares parameters, honour the flag; when it
        // omits them, assume tool-calling (the common case for OpenRouter
        // chat models) rather than hiding the model from a tool-using scope.
        toolCalling: params ? params.includes('tools') : true,
        visionInput: modalities ? modalities.includes('image') : false,
        promptCache: false,
        streaming: true,
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Stream loop
// ---------------------------------------------------------------------------

async function* runOpenRouterStream(req: AiStreamRequest): AsyncIterable<AiStreamEvent> {
  // Defensive: a non-apiKey credential reaching the driver implies a
  // mismatched DB row or a bypassed UI. Fail cleanly instead of letting the
  // SDK respond with a generic 401.
  if (req.credentials.authMode !== 'apiKey' || !req.credentials.apiKey) {
    yield {
      type: 'error',
      message:
        'OpenRouter requires an API key. Add an API-key credential in /admin/ai/providers and pick it for the site default.',
    }
    return
  }

  const client = new OpenRouter({ apiKey: req.credentials.apiKey })
  const tools = req.tools.map((t) =>
    toolToSdkTool(t, req.bridge, req.signal, req.toolContextBase),
  )

  // Maps a tool callId → its name so `tool.result` events (which omit the
  // name) can label the AiStreamEvent the runner forwards to the browser.
  const toolNamesByCallId = new Map<string, string>()

  try {
    const result = client.callModel(
      {
        model: req.modelId,
        instructions: req.systemPrompt.join('\n\n'),
        input: serialiseLatestUserMessage(req.messages),
        tools,
        // No artificial cap on tool rounds — the model decides when to stop
        // (matching the OpenAI driver's `maxTurns: null` stance). Cost is
        // bounded by the user's token budget + the UI abort button, not an
        // arbitrary iteration count. Omitting `stopWhen` runs until the model
        // emits a turn with no tool calls.
      },
      { fetchOptions: { signal: req.signal } },
    )

    for await (const event of result.getFullResponsesStream()) {
      const translated = translateEvent(event, toolNamesByCallId)
      if (!translated) continue
      yield translated
      if (translated.type === 'error') return
    }
  } catch (err) {
    if (isAbortError(err)) return
    const detail = err instanceof Error ? err.message : 'OpenRouter stream failed.'
    console.error('[ai/openrouter] stream error:', detail)
    const classified = classifyAuthOrBillingError(err)
    yield {
      type: 'error',
      message: classified ?? `OpenRouter error: ${detail}`,
    }
  }
}

// ---------------------------------------------------------------------------
// Stream event translation
// ---------------------------------------------------------------------------

/**
 * Narrow structural view of the SDK's `ResponseStreamEvent` union. The SDK
 * types these precisely, but the union is broad; we read only the fields each
 * canonical AiStreamEvent needs.
 */
type FullResponseEvent = {
  type: string
  delta?: string
  item?: { type?: string; callId?: string; name?: string; arguments?: string }
  toolCallId?: string
  result?: unknown
  message?: string
  response?: { usage?: OpenRouterUsage }
}

interface OpenRouterUsage {
  inputTokens?: number
  outputTokens?: number
  cost?: number | null
  inputTokensDetails?: { cachedTokens?: number }
}

function translateEvent(
  raw: unknown,
  toolNamesByCallId: Map<string, string>,
): AiStreamEvent | null {
  const event = raw as FullResponseEvent

  switch (event.type) {
    case 'response.output_text.delta': {
      const delta = event.delta
      if (typeof delta === 'string' && delta.length > 0) {
        return { type: 'text', text: delta }
      }
      return null
    }

    case 'response.output_item.done': {
      const item = event.item
      if (!item || item.type !== 'function_call') return null
      const toolCallId = item.callId ?? `tool-${cryptoId()}`
      const toolName = item.name ?? 'tool'
      toolNamesByCallId.set(toolCallId, toolName)
      return {
        type: 'toolCall',
        toolCallId,
        toolName,
        input: parseToolArguments(item.arguments),
        status: 'pending',
      }
    }

    case 'response.completed': {
      const usage = event.response?.usage
      return {
        type: 'usage',
        promptTokens: usage?.inputTokens ?? 0,
        completionTokens: usage?.outputTokens ?? 0,
        // OpenRouter reports native USD cost — emit it so the persister skips
        // the static price table (which never lists OpenRouter models).
        costUsd: typeof usage?.cost === 'number' ? usage.cost : undefined,
        cacheReadTokens: usage?.inputTokensDetails?.cachedTokens,
      }
    }

    case 'error': {
      return {
        type: 'error',
        message: event.message
          ? `OpenRouter error: ${event.message}`
          : 'OpenRouter stream failed.',
      }
    }

    case 'response.failed': {
      return {
        type: 'error',
        message: 'OpenRouter response failed. Check your credentials and model in /admin/ai/providers.',
      }
    }

    default: {
      // `tool.result` (and other agent-SDK events) don't carry a wire `type`
      // we switch on above — use the SDK's type guard.
      if (isToolResultEvent(raw as Parameters<typeof isToolResultEvent>[0])) {
        const toolCallId = event.toolCallId ?? 'unknown'
        const toolName = toolNamesByCallId.get(toolCallId) ?? 'tool'
        const output = event.result
        if (output && typeof output === 'object' && 'ok' in output) {
          const aio = output as AiToolOutput
          return {
            type: 'toolResult',
            toolCallId,
            toolName,
            ok: aio.ok,
            error: aio.error,
          }
        }
        return { type: 'toolResult', toolCallId, toolName, ok: true }
      }
      return null
    }
  }
}

function parseToolArguments(raw: string | undefined): unknown {
  if (typeof raw !== 'string' || raw.length === 0) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

// A short, collision-resistant id for the rare case where the SDK omits a
// function callId. Avoids `Math.random()` (banned in some contexts) by using
// the Web Crypto API available in Bun.
function cryptoId(): string {
  return crypto.randomUUID().slice(0, 8)
}

// ---------------------------------------------------------------------------
// AiTool → SDK tool()
// ---------------------------------------------------------------------------

function toolToSdkTool(
  aiTool: AiTool,
  bridge: AiStreamRequest['bridge'],
  signal: AbortSignal,
  toolContextBase: AiStreamRequest['toolContextBase'],
): ReturnType<typeof tool> {
  const inputSchema = z.object(typeboxObjectToZodRawShape(aiTool.inputSchema as TSchema))
  return tool({
    name: aiTool.name,
    description: aiTool.description,
    inputSchema,
    async execute(input: unknown) {
      return callAiTool(aiTool, input, bridge, signal, toolContextBase)
    },
  })
}

async function callAiTool(
  aiTool: AiTool,
  rawInput: unknown,
  bridge: AiStreamRequest['bridge'],
  signal: AbortSignal,
  toolContextBase: AiStreamRequest['toolContextBase'],
): Promise<AiToolOutput> {
  // Defence in depth: re-validate against the canonical TypeBox schema before
  // dispatching (the SDK already validated against Zod).
  let validated: unknown
  try {
    validated = parseValue(aiTool.inputSchema, rawInput)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid tool input.'
    return { ok: false, error: message }
  }

  if (aiTool.execution === 'server') {
    if (!aiTool.handler) {
      return { ok: false, error: `Tool ${aiTool.name} declares execution='server' but has no handler.` }
    }
    try {
      const ctx: ToolContext = { ...toolContextBase, signal }
      const result = await aiTool.handler(validated, ctx)
      return normaliseToolOutput(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : `Tool ${aiTool.name} failed.`
      return { ok: false, error: message }
    }
  }

  // Browser-execution: forward to the bridge and wait for the POST-back.
  try {
    return await bridge.callBrowser(aiTool.name, validated)
  } catch (err) {
    const message = err instanceof Error ? err.message : `Tool ${aiTool.name} failed.`
    return { ok: false, error: message }
  }
}

/**
 * Server-side tool handlers return their own raw payload. Wrap it in the
 * canonical AiToolOutput envelope so the model (and the `tool.result`
 * translator) see a consistent `{ ok, data }` shape.
 */
function normaliseToolOutput(result: unknown): AiToolOutput {
  if (result && typeof result === 'object' && 'ok' in result) {
    return result as AiToolOutput
  }
  return { ok: true, data: result }
}

// ---------------------------------------------------------------------------
// Messages → input string
// ---------------------------------------------------------------------------

/**
 * The SDK takes `input` as a single string (latest user turn) or a structured
 * `Item[]` history. We send the latest user message as a string — matching the
 * OpenAI sibling driver. Cross-turn history replay (mapping our AiMessage log
 * into the SDK's `Item[]` shape, including tool-call pairing) is a follow-up;
 * neither non-Anthropic driver replays it today.
 */
function serialiseLatestUserMessage(messages: AiMessage[]): string {
  const last = messages.at(-1)
  if (last && last.role === 'user') {
    return contentBlocksToText(last.content)
  }
  return messages
    .filter((m): m is Extract<AiMessage, { role: 'user' }> => m.role === 'user')
    .map((m) => contentBlocksToText(m.content))
    .join('\n')
}

function contentBlocksToText(
  content: Extract<AiMessage, { role: 'user' }>['content'],
): string {
  return content
    .map((block) => {
      if (block.kind === 'text') return block.text
      if (block.kind === 'image') return '[image attached]'
      return ''
    })
    .filter((s) => s.length > 0)
    .join(' ')
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'))
}

function classifyAuthOrBillingError(err: unknown): string | null {
  if (!(err instanceof Error)) return null
  const msg = err.message.toLowerCase()
  if (msg.includes('api key') || msg.includes('apikey') || msg.includes('401') || msg.includes('unauthorized')) {
    return 'OpenRouter authentication failed. Check your API key in /admin/ai/providers.'
  }
  if (msg.includes('quota') || msg.includes('credit') || msg.includes('billing') || msg.includes('402') || msg.includes('429')) {
    return 'OpenRouter quota or credit limit reached. Check your account balance.'
  }
  return null
}
