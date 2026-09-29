import type { Plugin as V1Plugin } from "@opencode-ai/plugin";
import type { Plugin } from "@opencode/plugin";
import {
  runSessionSearch,
  runSessionTranscript,
  SEARCH_CONFIG,
  TRANSCRIPT_CONFIG,
} from "./history";

export { runSessionSearch } from "./history";

// Load the V1 SDK only on V1. V2 does not need the legacy plugin package.
export const SessionHistoryPlugin: V1Plugin = async (input) => {
  const { SessionHistoryPlugin } = await import("./v1");
  return SessionHistoryPlugin(input);
};

export default {
  id: "opencode-session-search",
  server: SessionHistoryPlugin,
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "session-search",
        description:
          "Read-only search over local opencode chat history. Returns matching sessions and snippets. Use the session-transcript tool to fetch the full conversation context.",
        input: {
          type: "object",
          properties: {
            query: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              pattern: "\\S",
              description: "Text to search for in chat history.",
            },
            limitSessions: {
              type: "integer",
              minimum: 1,
              maximum: SEARCH_CONFIG.maxSessions,
              default: SEARCH_CONFIG.defaultSessions,
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
        async execute(input) {
          return {
            content: JSON.stringify(
              runSessionSearch(input as Parameters<typeof runSessionSearch>[0]),
            ),
          };
        },
      });
      editor.add({
        name: "session-transcript",
        description:
          "Read-only transcript reconstruction for a specific opencode session. Use after session-search to fetch full conversational context.",
        input: {
          type: "object",
          properties: {
            sessionId: {
              type: "string",
              minLength: 5,
              description: "Session ID returned by session-search.",
            },
            limit: {
              type: "integer",
              minimum: 1,
              maximum: TRANSCRIPT_CONFIG.maxLimit,
              default: TRANSCRIPT_CONFIG.defaultLimit,
            },
            order: { type: "string", enum: ["asc", "desc"], default: "asc" },
          },
          required: ["sessionId"],
          additionalProperties: false,
        },
        async execute(input) {
          return {
            content: JSON.stringify(
              runSessionTranscript(
                input as Parameters<typeof runSessionTranscript>[0],
              ),
            ),
          };
        },
      });
    });
  },
} satisfies Plugin.Plugin & { server: V1Plugin };
