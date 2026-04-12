"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, Wrench } from "lucide-react";

type ToolCall = { name: string; input: Record<string, unknown>; reasoning?: string };

type ReasoningStep = {
  step_number: number;
  tool_name: string;
  input_params: Record<string, unknown>;
  result_summary: string;
  reasoning?: string;
  duration_ms: number;
};

function narrate(tc: ToolCall): string {
  const inp = tc.input;
  switch (tc.name) {
    case "lookup_polarity": {
      const p = inp.process ? ` for ${inp.process}` : "";
      return `Checking polarity rules${p}...`;
    }
    case "lookup_spec": {
      const parts = [inp.process, inp.voltage].filter(Boolean).join(" ");
      return parts ? `Looking up ${parts} specs...` : "Looking up specs...";
    }
    case "get_manual_image":
      return inp.keyword
        ? `Finding ${inp.keyword} diagram...`
        : "Finding the relevant diagram...";
    case "render_artifact": {
      const labels: Record<string, string> = {
        front_panel_polarity: "Drawing the interactive front panel...",
        duty_cycle_calculator: "Building the duty cycle calculator...",
        troubleshooting_flow: "Mapping the troubleshooting flowchart...",
        settings_configurator: "Configuring the settings panel...",
        selection_matrix: "Building the process comparison grid...",
      };
      return labels[inp.artifact_type as string] || "Rendering interactive artifact...";
    }
    case "lookup_troubleshooting":
      return inp.keyword
        ? `Cross-referencing troubleshooting for "${inp.keyword}"...`
        : "Cross-referencing the troubleshooting matrix...";
    case "lookup_duty_cycle": {
      const parts = [inp.process, inp.voltage].filter(Boolean).join(" ");
      return parts
        ? `Calculating ${parts} duty cycle limits...`
        : "Calculating duty cycle limits...";
    }
    case "lookup_selection_chart":
      return "Checking the process selection chart...";
    case "lookup_weld_diagnosis":
      return inp.process_type
        ? `Pulling ${inp.process_type} weld defect references...`
        : "Pulling weld defect references...";
    case "search_procedures": {
      const p = inp.process ? ` for ${inp.process}` : "";
      return `Searching setup procedures${p}...`;
    }
    case "diagnose_weld_photo":
      return "Diagnosing weld photo against reference charts...";
    case "annotate_machine_photo":
      return "Annotating machine components...";
    case "find_relevant_videos":
      return "Finding relevant tutorial videos...";
    case "start_guided_walkthrough":
      return "Building guided walkthrough...";
    case "extract_user_state":
      return "Saving your setup preferences...";
    default:
      return `Running ${tc.name}...`;
  }
}

function compactParams(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (entries.length === 0) return "{}";
  return (
    "{ " +
    entries
      .map(([k, v]) => `${k}: ${typeof v === "string" ? `"${v}"` : JSON.stringify(v)}`)
      .join(", ") +
    " }"
  );
}

export function ReasoningRibbon({
  toolCalls,
  reasoningSteps,
  isStreaming,
  elapsedMs,
}: {
  toolCalls: ToolCall[];
  reasoningSteps: ReasoningStep[];
  isStreaming: boolean;
  elapsedMs: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deepExpand, setDeepExpand] = useState(false);

  if (toolCalls.length === 0) return null;

  const elapsed = (elapsedMs / 1000).toFixed(1);
  const showExpanded = isStreaming || expanded;

  return (
    <div className="mb-2">
      {showExpanded ? (
        <div className="space-y-0.5">
          {/* Simple narrated view (streaming or first expand) */}
          {!deepExpand && (
            <>
              {toolCalls.map((tc, i) => (
                <div
                  key={i}
                  className="text-xs font-mono text-muted-foreground/60 animate-ribbon-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <span className="text-muted-foreground/30 mr-1.5">{i + 1}.</span>
                  {narrate(tc)}
                </div>
              ))}
              {isStreaming && (
                <div className="flex items-center gap-1 mt-0.5">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="w-1 h-1 rounded-full bg-muted-foreground/30 animate-pulse"
                      style={{ animationDelay: `${i * 200}ms` }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Deep chain-of-thought view */}
          {deepExpand && reasoningSteps.length > 0 && (
            <div className="space-y-2 mt-1">
              {reasoningSteps.map((step, i) => (
                <div
                  key={i}
                  className="border border-border/50 rounded-lg p-2.5 bg-muted/20 animate-ribbon-in"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                      {step.step_number}
                    </span>
                    <span className="font-mono text-[11px] text-foreground/80 font-medium flex items-center gap-1">
                      <Wrench size={10} className="text-muted-foreground/50" />
                      {step.tool_name}
                    </span>
                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/50 font-mono">
                      <Clock size={9} />
                      {step.duration_ms}ms
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground/70 bg-background/50 rounded px-2 py-1 mb-1.5 overflow-x-auto">
                    {compactParams(step.input_params)}
                  </div>
                  {step.reasoning && (
                    <p className="text-[11px] text-foreground/70 mb-1 leading-relaxed">
                      {step.reasoning}
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground/50 font-mono leading-relaxed truncate">
                    {step.result_summary}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Deep expand toggle when not streaming and we have reasoning steps */}
          {!isStreaming && reasoningSteps.length > 0 && (
            <button
              onClick={() => setDeepExpand((v) => !v)}
              className="text-[10px] font-mono text-primary/60 hover:text-primary/90 transition-colors mt-1"
            >
              {deepExpand ? "Simple view" : "Show full chain of thought"}
            </button>
          )}

          {!isStreaming && expanded && (
            <button
              onClick={() => { setExpanded(false); setDeepExpand(false); }}
              className="text-xs font-mono text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors mt-1 ml-2"
            >
              Collapse <ChevronUp size={10} className="inline ml-0.5 -mt-px" />
            </button>
          )}
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs font-mono text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
        >
          Reasoned through {toolCalls.length} step{toolCalls.length !== 1 ? "s" : ""} in {elapsed}s
          <ChevronDown size={10} className="inline ml-1 -mt-px" />
        </button>
      )}
    </div>
  );
}
