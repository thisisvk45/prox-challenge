"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

type ToolCall = { name: string; input: Record<string, unknown> };

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
    default:
      return `Running ${tc.name}...`;
  }
}

export function ReasoningRibbon({
  toolCalls,
  isStreaming,
  elapsedMs,
}: {
  toolCalls: ToolCall[];
  isStreaming: boolean;
  elapsedMs: number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (toolCalls.length === 0) return null;

  const elapsed = (elapsedMs / 1000).toFixed(1);
  const showExpanded = isStreaming || expanded;

  return (
    <div className="mb-2">
      {showExpanded ? (
        <div className="space-y-0.5">
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
      {!isStreaming && showExpanded && expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="text-xs font-mono text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors mt-1"
        >
          Collapse <ChevronUp size={10} className="inline ml-0.5 -mt-px" />
        </button>
      )}
    </div>
  );
}
