import { describe, test, expect } from 'bun:test'
import { runChat } from '../../../server/ai/runtime/runner'
import type { AiProvider, AiStreamRequest } from '../../../server/ai/drivers/types'
import type { ConversationsPersister } from '../../../server/ai/runtime/persister'

/**
 * ISS-031: multi-turn chats lost all prior context because the driver dropped
 * conversation history. The fix wires the Claude Agent SDK's session resume:
 * the driver emits a `session` event carrying the SDK session id, and the
 * runner must persist it so the NEXT turn resumes the same session (replaying
 * history). Previously the `session` event fell through to a no-op default.
 */
describe('runChat — session persistence', () => {
  test('persists the SDK session id from a session event', async () => {
    const recorded: string[] = []
    const persister: ConversationsPersister = {
      appendAssistantText: async () => {},
      appendToolCall: async () => {},
      appendToolResult: async () => {},
      recordUsage: async () => {},
      recordSession: async (sessionId: string) => {
        recorded.push(sessionId)
      },
    }
    const driver = {
      stream: async function* () {
        yield { type: 'session', sessionId: 'sess-abc' } as const
      },
    } as unknown as AiProvider

    await runChat({
      driver,
      request: {} as AiStreamRequest,
      persister,
      emit: () => {},
    })

    expect(recorded).toEqual(['sess-abc'])
  })
})
