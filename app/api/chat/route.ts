import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFINITIONS, handleToolCall } from "../../../lib/api-tools";
import { SYSTEM_PROMPT } from "../../../lib/system-prompt";

export const maxDuration = 120;

export async function POST(request: Request) {
  const body = await request.json();
  const { message, image, guided_mode, user_memory_context } = body as { message?: string; image?: string; guided_mode?: boolean; user_memory_context?: string };

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
        const toolsUsed: string[] = [];

        while (turns < maxTurns) {
          turns++;

          const response = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 8192,
            system: SYSTEM_PROMPT.replace("{user_memory_context}", user_memory_context || "No previous context — this is a new user.") + (guided_mode ? "\n\n[CONTEXT: The user has Guided Mode enabled. Prefer guided walkthroughs over plain text for any setup or procedure questions.]" : ""),
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

          let turnReasoningText = "";
          for (const block of response.content) {
            if (block.type === "text") {
              send("text", { text: block.text });
              turnReasoningText += block.text + " ";
            } else if (block.type === "tool_use") {
              const toolName = block.name;
              send("tool_call", { name: toolName, input: block.input, reasoning: turnReasoningText.trim() || undefined });
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
              toolUses.map(async (tu, idx) => {
                const stepNumber = totalToolCalls - toolUses.length + idx + 1;
                const toolStartMs = Date.now();
                let result: any;
                try {
                  result = await handleToolCall(tu.name, tu.input);
                } catch (toolErr: any) {
                  const durationMs = Date.now() - toolStartMs;
                  send("reasoning_step", {
                    step_number: stepNumber,
                    tool_name: tu.name,
                    input_params: tu.input,
                    result_summary: `Error: ${toolErr.message || "Tool execution failed"}`,
                    duration_ms: durationMs,
                  });
                  const errMsg = JSON.stringify({ error: true, message: toolErr.message || "Tool execution failed", recovery_suggestion: "Try rephrasing your question or ask about a different aspect." });
                  return { type: "tool_result" as const, tool_use_id: tu.id, content: errMsg } as Anthropic.Messages.ToolResultBlockParam;
                }
                const durationMs = Date.now() - toolStartMs;
                toolsUsed.push(tu.name);

                // Determine text content for event emission
                // result is either a string or an array of content blocks
                const isMultiModal = Array.isArray(result);
                const textContent = isMultiModal
                  ? (result.find((b: any) => b.type === "text") as any)?.text || ""
                  : result;

                // Emit reasoning step with result summary
                try {
                  const summary = typeof textContent === "string" && textContent.length > 200
                    ? textContent.slice(0, 200) + "..."
                    : textContent;
                  send("reasoning_step", {
                    step_number: stepNumber,
                    tool_name: tu.name,
                    input_params: tu.input,
                    result_summary: typeof summary === "string" ? summary : "Result returned",
                    duration_ms: durationMs,
                  });
                } catch { /* non-fatal */ }

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

                // Auto-emit guided walkthrough artifact
                if (tu.name === "start_guided_walkthrough") {
                  try {
                    const parsed = JSON.parse(textContent);
                    if (parsed.steps && parsed.steps.length > 0) {
                      send("artifact", {
                        artifact_type: "guided_walkthrough",
                        title: parsed.title || "Guided Walkthrough",
                        data: {
                          walkthrough_id: parsed.walkthrough_id,
                          title: parsed.title,
                          total_steps: parsed.total_steps,
                          estimated_minutes: parsed.estimated_minutes,
                          steps: parsed.steps,
                        },
                      });
                    }
                  } catch { /* non-fatal */ }
                }

                // Emit memory_update for extract_user_state calls
                if (tu.name === "extract_user_state") {
                  send("memory_update", tu.input);
                }

                // Auto-emit video recommendation artifact
                if (tu.name === "find_relevant_videos") {
                  try {
                    const parsed = JSON.parse(textContent);
                    if (parsed.videos && parsed.videos.length > 0) {
                      send("artifact", {
                        artifact_type: "video_recommendation",
                        title: "Video Recommendations",
                        data: {
                          videos: parsed.videos,
                          context_topic: parsed.query || tu.input.query_topic || "",
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

        // Compute confidence level based on tools used
        const structuredTools = ["lookup_spec", "lookup_duty_cycle", "lookup_polarity", "lookup_troubleshooting", "lookup_selection_chart", "lookup_weld_diagnosis", "search_procedures"];
        const semanticTools = ["diagnose_weld_photo", "annotate_machine_photo", "find_relevant_videos", "get_manual_image"];
        const hasStructured = toolsUsed.some(t => structuredTools.includes(t));
        const hasSemantic = toolsUsed.some(t => semanticTools.includes(t));
        const confidence = hasStructured ? "high" : hasSemantic ? "medium" : "low";
        send("confidence", { level: confidence });

        // --- Multi-Agent Deliberation: Safety + Quality Review ---
        // Extract the Technical Agent's full text response for review
        const lastAssistantMsg = messages.filter(m => m.role === "assistant").pop();
        let technicalResponseText = "";
        if (lastAssistantMsg && Array.isArray(lastAssistantMsg.content)) {
          technicalResponseText = (lastAssistantMsg.content as any[])
            .filter((b: any) => b.type === "text")
            .map((b: any) => b.text)
            .join("\n");
        }

        const userQuestion = message || "User uploaded an image for analysis.";

        // Run Safety Agent and Quality Reviewer in parallel
        send("agent_phase", { phase: "safety_review", status: "running" });
        send("agent_phase", { phase: "quality_review", status: "running" });

        const reviewStartMs = Date.now();

        const [safetyResult, qualityResult] = await Promise.all([
          // AGENT 1: Safety Agent
          (async () => {
            const safetyStart = Date.now();
            try {
              const resp = await client.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1024,
                system: "You are a safety-first welding expert reviewing an AI assistant's interaction with a garage hobbyist using a Vulcan OmniPro 220. Your ONLY job is to flag safety issues. Check for: reversed polarity that could damage the machine (MIG uses DCEP, Flux-Cored uses DCEN, TIG uses DCEN, Stick uses DCEP), duty cycle violations that could cause overheating, incorrect cable assignments, missing safety warnings for aluminum or TIG processes, any advice that contradicts the owner's manual. Respond with ONLY valid JSON: { \"safe\": boolean, \"warnings\": string[], \"critical_issues\": string[] }. If safe is true and no warnings, return { \"safe\": true, \"warnings\": [], \"critical_issues\": [] }. Be conservative. Flag anything uncertain.",
                messages: [{
                  role: "user",
                  content: `User question: "${userQuestion}"\n\nAI assistant's response:\n${technicalResponseText}\n\nMemory context: ${user_memory_context || "New user"}\n\nAnalyze this response for safety issues. Return JSON only.`
                }],
              });
              const text = resp.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text").map(b => b.text).join("");
              totalInputTokens += resp.usage?.input_tokens || 0;
              totalOutputTokens += resp.usage?.output_tokens || 0;
              const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
              return { ...parsed, duration_ms: Date.now() - safetyStart };
            } catch {
              return { safe: true, warnings: [], critical_issues: [], duration_ms: Date.now() - safetyStart, error: true };
            }
          })(),
          // AGENT 3: Quality Reviewer
          (async () => {
            const qualityStart = Date.now();
            try {
              const resp = await client.messages.create({
                model: "claude-sonnet-4-20250514",
                max_tokens: 1024,
                system: "You are a senior technical writer reviewing an AI assistant's response about the Vulcan OmniPro 220 welder. The response was generated by a technical specialist using structured knowledge lookups. Your job: (1) Check if the response actually answers the user's question directly. (2) Check if any claims lack source backing from the manual. (3) Check if the response is clear enough for a beginner who doesn't know what DCEP means. (4) Suggest one specific improvement if any. Respond with ONLY valid JSON: { \"approved\": boolean, \"accuracy_score\": number, \"clarity_score\": number, \"suggestion\": string | null }. Scores are 1-10.",
                messages: [{
                  role: "user",
                  content: `User question: "${userQuestion}"\n\nAI assistant's response:\n${technicalResponseText}\n\nReview this response for accuracy, completeness, and clarity. Return JSON only.`
                }],
              });
              const text = resp.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === "text").map(b => b.text).join("");
              totalInputTokens += resp.usage?.input_tokens || 0;
              totalOutputTokens += resp.usage?.output_tokens || 0;
              const parsed = JSON.parse(text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
              return { ...parsed, duration_ms: Date.now() - qualityStart };
            } catch {
              return { approved: true, accuracy_score: 7, clarity_score: 7, suggestion: null, duration_ms: Date.now() - qualityStart, error: true };
            }
          })(),
        ]);

        // Emit phase completion events
        send("agent_phase", {
          phase: "safety_review",
          status: "complete",
          result: {
            safe: safetyResult.safe,
            warnings: safetyResult.warnings || [],
            critical_issues: safetyResult.critical_issues || [],
            duration_ms: safetyResult.duration_ms,
          },
        });
        send("agent_phase", {
          phase: "quality_review",
          status: "complete",
          result: {
            approved: qualityResult.approved,
            accuracy_score: qualityResult.accuracy_score,
            clarity_score: qualityResult.clarity_score,
            suggestion: qualityResult.suggestion,
            duration_ms: qualityResult.duration_ms,
          },
        });

        // Emit safety warnings as artifacts if needed
        if (safetyResult.critical_issues && safetyResult.critical_issues.length > 0) {
          send("artifact", {
            artifact_type: "safety_warning",
            title: "Safety Warning",
            data: {
              level: "critical",
              issues: safetyResult.critical_issues,
            },
          });
        }
        if (safetyResult.warnings && safetyResult.warnings.length > 0) {
          send("artifact", {
            artifact_type: "safety_warning",
            title: "Safety Note",
            data: {
              level: "caution",
              issues: safetyResult.warnings,
            },
          });
        }

        // Emit quality note if not approved or low accuracy
        if (qualityResult.approved === false || (qualityResult.accuracy_score && qualityResult.accuracy_score < 7)) {
          send("text", { text: "\n\n> **Note:** This response may be incomplete. Consider verifying against the manual." });
        }

        // Sonnet pricing: $3/M input, $15/M output
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
