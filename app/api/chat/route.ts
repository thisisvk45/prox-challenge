import { query } from "@anthropic-ai/claude-agent-sdk";
import { createKbMcpServer } from "../../../lib/tools";
import { SYSTEM_PROMPT } from "../../../lib/system-prompt";

export const maxDuration = 120; // seconds

export async function POST(request: Request) {
  const { message } = await request.json();

  if (!message || typeof message !== "string") {
    return Response.json({ error: "Missing 'message' field" }, { status: 400 });
  }

  const mcpServer = createKbMcpServer();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const conversation = query({
          prompt: message,
          options: {
            model: "claude-sonnet-4-20250514",
            systemPrompt: SYSTEM_PROMPT,
            tools: [],
            mcpServers: { "omnipro-kb": mcpServer },
            allowedTools: [
              "mcp__omnipro-kb__lookup_spec",
              "mcp__omnipro-kb__lookup_duty_cycle",
              "mcp__omnipro-kb__lookup_polarity",
              "mcp__omnipro-kb__lookup_troubleshooting",
              "mcp__omnipro-kb__get_manual_image",
              "mcp__omnipro-kb__lookup_selection_chart",
              "mcp__omnipro-kb__lookup_weld_diagnosis",
              "mcp__omnipro-kb__search_procedures",
              "mcp__omnipro-kb__render_artifact",
            ],
            maxTurns: 12,
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            env: {
              ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
              PATH: process.env.PATH,
            },
          },
        });

        for await (const msg of conversation) {
          if (msg.type === "assistant") {
            // Full assistant message with content blocks
            const textBlocks = msg.message.content.filter(
              (b: any) => b.type === "text"
            );
            for (const block of textBlocks) {
              send("text", { text: (block as any).text });
            }
          } else if (msg.type === "result") {
            send("result", {
              result: msg.subtype === "success" ? (msg as any).result : null,
              cost_usd: msg.subtype === "success" ? (msg as any).total_cost_usd : null,
              turns: msg.subtype === "success" ? (msg as any).num_turns : null,
              error: msg.subtype !== "success" ? (msg as any).error : null,
            });
          }
        }

        send("done", {});
      } catch (err: any) {
        send("error", { error: err.message || "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
