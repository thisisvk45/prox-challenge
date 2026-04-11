"use client";

import { Badge } from "../ui/badge";
import { CheckCircle2, AlertTriangle, Wrench, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

type DiagMatch = {
  label: string;
  visual_description: string;
  causes: string[];
  corrective_actions: string[];
  confidence: number;
};

type Props = {
  user_image_url: string;
  top_match: DiagMatch;
  secondary_match?: DiagMatch;
  manual_image_url?: string;
  weld_type: "wire" | "stick";
};

export function WeldDiagnosisResult({
  user_image_url,
  top_match,
  secondary_match,
  manual_image_url,
  weld_type,
}: Props) {
  const [showManual, setShowManual] = useState(false);

  const confidenceColor =
    top_match.confidence >= 70
      ? "text-green-500"
      : top_match.confidence >= 40
      ? "text-yellow-500"
      : "text-red-400";
  const confidenceLabel =
    top_match.confidence >= 70 ? "High" : top_match.confidence >= 40 ? "Medium" : "Low";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <AlertTriangle size={14} className="text-orange-400" />
        <span className="text-xs font-semibold text-foreground">Weld Diagnosis</span>
        <Badge variant="outline" className="ml-auto text-[10px] font-mono">
          {weld_type === "wire" ? "MIG / Flux-Cored" : "Stick"}
        </Badge>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-0 divide-x divide-border">
        {/* Left: User photo */}
        <div className="p-4">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
            Your Weld
          </p>
          <div className="rounded-lg overflow-hidden border border-border bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={user_image_url}
              alt="User uploaded weld photo"
              className="w-full h-auto max-h-[240px] object-contain"
            />
          </div>
        </div>

        {/* Right: Diagnosis */}
        <div className="p-4 space-y-3">
          <div>
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
              Best Match
            </p>
            <h3 className="text-sm font-semibold text-foreground">{top_match.label}</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {top_match.visual_description}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`text-[10px] font-mono ${confidenceColor}`}>
                {confidenceLabel} confidence ({top_match.confidence}%)
              </span>
            </div>
          </div>

          {/* Causes */}
          <div>
            <p className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
              <AlertTriangle size={10} /> Likely Causes
            </p>
            <ul className="space-y-0.5">
              {top_match.causes.map((c, i) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                  <span className="text-muted-foreground mt-0.5">•</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* Corrections */}
          <div>
            <p className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-1">
              <Wrench size={10} /> How to Fix
            </p>
            <ul className="space-y-0.5">
              {top_match.corrective_actions.map((a, i) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
                  <CheckCircle2 size={10} className="text-green-500 mt-0.5 flex-shrink-0" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Secondary match */}
      {secondary_match && (
        <div className="border-t border-border px-4 py-2.5 bg-muted/10">
          <p className="text-[10px] font-mono text-muted-foreground">
            Also possible: <span className="text-foreground font-medium">{secondary_match.label}</span>
            {" — "}
            {secondary_match.causes.join(", ")}
            <span className="ml-1 text-muted-foreground/60">({secondary_match.confidence}%)</span>
          </p>
        </div>
      )}

      {/* Manual reference */}
      {manual_image_url && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowManual(!showManual)}
            className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors w-full text-left"
          >
            <ImageIcon size={10} />
            {showManual ? "Hide" : "Show"} manual reference chart
          </button>
          {showManual && (
            <div className="px-4 pb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={manual_image_url}
                alt="Manual weld diagnosis chart"
                className="w-full rounded-lg border border-border"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
