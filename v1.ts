import { type Plugin, tool } from "@opencode-ai/plugin";
import {
  runSessionSearch,
  runSessionTranscript,
  SEARCH_CONFIG,
  TRANSCRIPT_CONFIG,
} from "./history";

export const SessionHistoryPlugin: Plugin = async () => ({
  tool: {
    "session-search": tool({
      description:
        "Read-only search over local opencode chat history. Returns matching sessions and snippets. Use the session-transcript tool to fetch the full conversation context.",
      args: {
        query: tool.schema
          .string()
          .trim()
          .min(1)
          .max(200)
          .describe("Text to search for in chat history."),
        limitSessions: tool.schema
          .number()
          .int()
          .min(1)
          .max(SEARCH_CONFIG.maxSessions)
          .default(SEARCH_CONFIG.defaultSessions)
          .describe("Maximum number of matching sessions to return."),
      },
      async execute(args) {
        return JSON.stringify(runSessionSearch(args));
      },
    }),
    "session-transcript": tool({
      description:
        "Read-only transcript reconstruction for a specific opencode session. Use after session-search to fetch full conversational context.",
      args: {
        sessionId: tool.schema
          .string()
          .min(5)
          .describe(
            "Session ID to reconstruct transcript from (for example, ses_xxx).",
          ),
        limit: tool.schema
          .number()
          .int()
          .min(1)
          .max(TRANSCRIPT_CONFIG.maxLimit)
          .default(TRANSCRIPT_CONFIG.defaultLimit)
          .describe("Maximum transcript entries returned."),
        order: tool.schema
          .enum(["asc", "desc"])
          .default("asc")
          .describe("Chronological or reverse-chronological ordering."),
      },
      async execute(args) {
        return JSON.stringify(runSessionTranscript(args));
      },
    }),
  },
});
