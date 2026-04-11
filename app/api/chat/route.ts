import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS, handleToolCall } from "../../../lib/api-tools";
import { SYSTEM_PROMPT } from "../../../lib/system-prompt";

export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json();
  const { message, image } = body as { message?: string; image?: string };

  if (!message && !image) {
    return Response.json({ error: "Missing 'message' or 'image' field" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        // Build user content — text + optional image
        const userContent: Anthropic.Messages.ContentBlockParam[] = [];

        if (image && typeof image === "string") {
          // Parse data URL: data:image/jpeg;base64,/9j/4AAQ...
          const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            userContent.push({
              type: "image",
              source: {
                type: "base64",
                media_type: match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: match[2],
              },
            });
          }
        }

        const textParts: string[] = [];
        if (image) {
          textParts.push(
            "The user has attached a photo. It could be a weld photo OR a photo of the welding machine itself. Look at it carefully:\n" +
            "- If it shows a WELD BEAD (metal joint, bead pattern, spatter): use diagnose_weld_photo.\n" +
            "- If it shows the WELDING MACHINE (front panel, controls, knobs, interior, wire feed): use annotate_machine_photo.\n" +
            "- If the user's message gives context, follow that. Otherwise, determine from the image."
          );
        }
        if (message) {
          textParts.push(message);
        } else if (image) {
          textParts.push("What am I looking at? Analyze this photo.");
        }

        userContent.push({ type: "text", text: textParts.join("\n\n") });

        const messages: Anthropic.Messages.MessageParam[] = [
          { role: "user", content: userContent },
        ];

        let turns = 0;
        const maxTurns = 12;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalToolCalls = 0;
        const startMs = Date.now();

        while (turns < maxTurns) {
          turns++;

          const response = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            system: SYSTEM_PROMPT,
            tools: TOOL_DEFINITIONS,
            messages,
          });

          // Accumulate usage
          totalInputTokens += response.usage?.input_tokens || 0;
          totalOutputTokens += response.usage?.output_tokens || 0;

          // Emit text blocks and collect tool uses
          const toolUses: Array<{
            id: string;
            name: string;
            input: Record<string, unknown>;
          }> = [];

          for (const block of response.content) {
            if (block.type === "text") {
              send("text", { text: block.text });
            } else if (block.type === "tool_use") {
              const toolName = block.name;
              send("tool_call", { name: toolName, input: block.input });
              totalToolCalls++;
              toolUses.push({
                id: block.id,
                name: block.name,
                input: block.input as Record<string, unknown>,
              });
            }
          }

          // If no tool calls, we're done
          if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
            break;
          }

          // Execute all tool calls and build tool results
          const toolResults: Anthropic.Messages.ToolResultBlockParam[] =
            await Promise.all(
              toolUses.map(async (tu) => {
                const result = await handleToolCall(tu.name, tu.input);

                // Determine text content for event emission
                // result is either a string or an array of content blocks
                const isMultiModal = Array.isArray(result);
                const textContent = isMultiModal
                  ? (result.find((b: any) => b.type === "text") as any)?.text || ""
                  : result;

                // Emit dedicated artifact event when render_artifact executes
                if (tu.name === "render_artifact") {
                  try {
                    const parsed = JSON.parse(textContent);
                    if (parsed.artifact) {
                      send("artifact", {
                        artifact_type: parsed.artifact.type,
                        title: parsed.artifact.title,
                        data: parsed.artifact.data,
                      });
                    }
                  } catch {
                    // fallback: emit from tool input directly
                    send("artifact", {
                      artifact_type: tu.input.artifact_type,
                      title: tu.input.title,
                      data: tu.input.data,
                    });
                  }
                }

                // Auto-emit weld diagnosis artifact when diagnose_weld_photo
                // returns matches — eliminates dependence on model calling
                // render_artifact in a separate turn
                if (tu.name === "diagnose_weld_photo") {
                  try {
                    const parsed = JSON.parse(textContent);
                    if (parsed.matches && parsed.matches.length > 0) {
                      send("artifact", {
                        artifact_type: "weld_diagnosis_result",
                        title: "Weld Diagnosis",
                        data: {
                          top_match: parsed.matches[0],
                          secondary_match: parsed.matches[1] || null,
                          manual_image_url: parsed.manual_reference_image,
                          weld_type: parsed.weld_type,
                          user_image_url: "",
                        },
                      });
                    }
                  } catch { /* non-fatal */ }
                }

                // Auto-emit machine photo annotation artifact
                if (tu.name === "annotate_machine_photo") {
                  try {
                    const parsed = JSON.parse(textContent);
                    if (parsed.annotations && parsed.annotations.length > 0) {
                      send("artifact", {
                        artifact_type: "machine_photo_annotation",
                        title: "Machine Annotation",
                        data: {
                          view_type: parsed.view_type,
                          annotations: parsed.annotations,
                          user_image_url: "",
                        },
                      });
                    }
                  } catch { /* non-fatal */ }
                }

                // For multi-modal results (content block arrays), pass as
                // structured content so Anthropic receives image blocks as vision input
                return {
                  type: "tool_result" as const,
                  tool_use_id: tu.id,
                  content: isMultiModal ? result : textContent,
                } as Anthropic.Messages.ToolResultBlockParam;
              })
            );

          // Append assistant message and tool results for next turn
          messages.push({ role: "assistant", content: response.content });
          messages.push({ role: "user", content: toolResults });
        }

        // Sonnet 4.5 pricing: $3/M input, $15/M output
        const costUsd = (totalInputTokens * 3 + totalOutputTokens * 15) / 1_000_000;
        send("stats", {
          cost_usd: Math.round(costUsd * 10000) / 10000,
          elapsed_ms: Date.now() - startMs,
          tool_call_count: totalToolCalls,
        });
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
