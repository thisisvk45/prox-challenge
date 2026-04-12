"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, Wrench, Shield, ShieldCheck, FileCheck, AlertTriangle } from "lucide-react";

type ToolCall = { name: string; input: Record<string, unknown>; reasoning?: string };

type ReasoningStep = {
  step_number: number;
  tool_name: string;
  input_params: Record<string, unknown>;
  result_summary: string;
  reasoning?: string;
  duration_ms: number;
};

type AgentPhase = {
  phase: "safety_review" | "quality_review";
  status: "running" | "complete";
  result?: {
    safe?: boolean;
    warnings?: string[];
    critical_issues?: string[];
    approved?: boolean;
    accuracy_score?: number;
    clarity_score?: number;
    suggestion?: string | null;
    duration_ms?: number;
  };
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

function SafetyPhaseCard({ phase, customerMode }: { phase: AgentPhase; customerMode?: boolean }) {
  const r = phase.result;
  const isRunning = phase.status === "running";
  const safe = r?.safe !== false;
  const hasCritical = (r?.critical_issues?.length || 0) > 0;
  const hasWarnings = (r?.warnings?.length || 0) > 0;

  return (
    <div className={`border rounded-lg p-2.5 animate-ribbon-in ${
      isRunning ? "border-border/50 bg-muted/10" :
      hasCritical ? "border-red-500/30 bg-red-500/5" :
      hasWarnings ? "border-amber-500/30 bg-amber-500/5" :
      "border-emerald-500/30 bg-emerald-500/5"
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {isRunning ? (
          <Shield size={12} className="text-muted-foreground/50 animate-pulse" />
        ) : safe && !hasWarnings ? (
          <ShieldCheck size={12} className="text-emerald-500" />
        ) : (
          <AlertTriangle size={12} className={hasCritical ? "text-red-500" : "text-amber-500"} />
        )}
        <span className="text-[11px] font-semibold text-foreground/80">Safety Agent</span>
        {!isRunning && r?.duration_ms && (
          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/50 font-mono">
            <Clock size={9} />{r.duration_ms}ms
          </span>
        )}
      </div>
      {isRunning ? (
        <p className="text-[10px] text-muted-foreground/50 font-mono">Reviewing for safety issues...</p>
      ) : customerMode ? (
        <p className={`text-[11px] font-medium ${
          hasCritical ? "text-red-500" : hasWarnings ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
        }`}>
          {hasCritical ? "Issues detected" : hasWarnings ? "Caution noted" : "Passed"}
        </p>
      ) : (
        <div className="space-y-1">
          <p className={`text-[11px] font-medium ${
            hasCritical ? "text-red-500" : hasWarnings ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
          }`}>
            {hasCritical ? "Critical issues found" : hasWarnings ? "Warnings flagged" : "No safety issues detected"}
          </p>
          {hasCritical && r?.critical_issues?.map((issue, i) => (
            <p key={i} className="text-[10px] text-red-500/80 font-mono pl-2 border-l-2 border-red-500/30">{issue}</p>
          ))}
          {hasWarnings && r?.warnings?.map((w, i) => (
            <p key={i} className="text-[10px] text-amber-600/80 dark:text-amber-400/80 font-mono pl-2 border-l-2 border-amber-500/30">{w}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function QualityPhaseCard({ phase, customerMode }: { phase: AgentPhase; customerMode?: boolean }) {
  const r = phase.result;
  const isRunning = phase.status === "running";
  const approved = r?.approved !== false;

  return (
    <div className={`border rounded-lg p-2.5 animate-ribbon-in ${
      isRunning ? "border-border/50 bg-muted/10" :
      approved ? "border-blue-500/30 bg-blue-500/5" :
      "border-amber-500/30 bg-amber-500/5"
    }`}>
      <div className="flex items-center gap-2 mb-1">
        {isRunning ? (
          <FileCheck size={12} className="text-muted-foreground/50 animate-pulse" />
        ) : (
          <FileCheck size={12} className={approved ? "text-blue-500" : "text-amber-500"} />
        )}
        <span className="text-[11px] font-semibold text-foreground/80">Quality Reviewer</span>
        {!isRunning && r?.duration_ms && (
          <span className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground/50 font-mono">
            <Clock size={9} />{r.duration_ms}ms
          </span>
        )}
      </div>
      {isRunning ? (
        <p className="text-[10px] text-muted-foreground/50 font-mono">Scoring accuracy and clarity...</p>
      ) : customerMode ? (
        <p className={`text-[11px] font-medium ${approved ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}>
          {approved ? "Approved" : "Needs review"}
        </p>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-muted-foreground/60">
              Accuracy: <span className="text-foreground/70 font-semibold">{r?.accuracy_score ?? "?"}/10</span>
            </span>
            <span className="text-[10px] font-mono text-muted-foreground/60">
              Clarity: <span className="text-foreground/70 font-semibold">{r?.clarity_score ?? "?"}/10</span>
            </span>
          </div>
          <p className={`text-[11px] font-medium ${approved ? "text-blue-600 dark:text-blue-400" : "text-amber-600 dark:text-amber-400"}`}>
            {approved ? "Approved" : "Needs improvement"}
          </p>
          {r?.suggestion && (
            <p className="text-[10px] text-muted-foreground/60 font-mono pl-2 border-l-2 border-blue-500/20 italic">
              {r.suggestion}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ReasoningRibbon({
  toolCalls,
  reasoningSteps,
  agentPhases,
  isStreaming,
  elapsedMs,
  customerMode,
}: {
  toolCalls: ToolCall[];
  reasoningSteps: ReasoningStep[];
  agentPhases: AgentPhase[];
  isStreaming: boolean;
  elapsedMs: number;
  customerMode?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [deepExpand, setDeepExpand] = useState(false);

  if (toolCalls.length === 0) return null;

  const elapsed = (elapsedMs / 1000).toFixed(1);
  const showExpanded = isStreaming || expanded;
  const hasAgentPhases = agentPhases.length > 0;
  const agentCount = hasAgentPhases ? 3 : 1;

  const safetyPhase = agentPhases.find(p => p.phase === "safety_review");
  const qualityPhase = agentPhases.find(p => p.phase === "quality_review");

  // In customer mode, only show the ribbon (not full dev details)
  if (customerMode) {
    return (
      <div className="mb-2">
        {showExpanded ? (
          <div className="space-y-1">
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
            {hasAgentPhases && !isStreaming && (
              <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-border/30">
                {safetyPhase && (
                  <span className={`text-[10px] font-mono flex items-center gap-1 ${
                    safetyPhase.result?.safe !== false ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                  }`}>
                    <ShieldCheck size={10} /> Safety: {safetyPhase.result?.safe !== false ? "passed" : "flagged"}
                  </span>
                )}
                {qualityPhase && (
                  <span className={`text-[10px] font-mono flex items-center gap-1 ${
                    qualityPhase.result?.approved !== false ? "text-blue-600 dark:text-blue-400" : "text-amber-500"
                  }`}>
                    <FileCheck size={10} /> Quality: {qualityPhase.result?.approved !== false ? "approved" : "review"}
                  </span>
                )}
              </div>
            )}
            {isStreaming && (
              <div className="flex items-center gap-1 mt-0.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-1 h-1 rounded-full bg-muted-foreground/30 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                ))}
              </div>
            )}
            {!isStreaming && expanded && (
              <button
                onClick={() => setExpanded(false)}
                className="text-xs font-mono text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors mt-1"
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
            Reasoned through {toolCalls.length} step{toolCalls.length !== 1 ? "s" : ""}{hasAgentPhases ? ` across ${agentCount} agents` : ""} in {elapsed}s
            <ChevronDown size={10} className="inline ml-1 -mt-px" />
          </button>
        )}
      </div>
    );
  }

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
              {/* Agent phase summaries in simple view */}
              {hasAgentPhases && !isStreaming && (
                <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-border/30">
                  {safetyPhase && (
                    <span className={`text-[10px] font-mono flex items-center gap-1 ${
                      safetyPhase.status === "running" ? "text-muted-foreground/50 animate-pulse" :
                      safetyPhase.result?.safe !== false ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                    }`}>
                      <ShieldCheck size={10} /> Safety: {safetyPhase.status === "running" ? "reviewing..." : safetyPhase.result?.safe !== false ? "passed" : "flagged"}
                    </span>
                  )}
                  {qualityPhase && (
                    <span className={`text-[10px] font-mono flex items-center gap-1 ${
                      qualityPhase.status === "running" ? "text-muted-foreground/50 animate-pulse" :
                      qualityPhase.result?.approved !== false ? "text-blue-600 dark:text-blue-400" : "text-amber-500"
                    }`}>
                      <FileCheck size={10} /> Quality: {qualityPhase.status === "running" ? "scoring..." :
                        qualityPhase.result?.approved !== false
                          ? `approved (${qualityPhase.result?.accuracy_score ?? "?"}/${qualityPhase.result?.clarity_score ?? "?"})`
                          : "needs review"}
                    </span>
                  )}
                </div>
              )}
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
          {deepExpand && (
            <div className="space-y-3 mt-1">
              {/* Phase 1: Technical Analysis */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
                    Phase 1
                  </span>
                  <span className="text-[11px] font-semibold text-foreground/70">Technical Analysis</span>
                </div>
                {reasoningSteps.length > 0 ? (
                  <div className="space-y-2 pl-1">
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
                ) : (
                  <div className="pl-1">
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
                  </div>
                )}
              </div>

              {/* Phase 2: Safety Review */}
              {safetyPhase && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      Phase 2
                    </span>
                    <span className="text-[11px] font-semibold text-foreground/70">Safety Review</span>
                    <span className="text-[9px] text-muted-foreground/40 font-mono">(parallel)</span>
                  </div>
                  <div className="pl-1">
                    <SafetyPhaseCard phase={safetyPhase} />
                  </div>
                </div>
              )}

              {/* Phase 3: Quality Review */}
              {qualityPhase && (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                      Phase 3
                    </span>
                    <span className="text-[11px] font-semibold text-foreground/70">Quality Review</span>
                    <span className="text-[9px] text-muted-foreground/40 font-mono">(parallel)</span>
                  </div>
                  <div className="pl-1">
                    <QualityPhaseCard phase={qualityPhase} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deep expand toggle */}
          {!isStreaming && (reasoningSteps.length > 0 || hasAgentPhases) && (
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
          Reasoned through {toolCalls.length} step{toolCalls.length !== 1 ? "s" : ""}{hasAgentPhases ? ` across ${agentCount} agents` : ""} in {elapsed}s
          <ChevronDown size={10} className="inline ml-1 -mt-px" />
        </button>
      )}
    </div>
  );
}
