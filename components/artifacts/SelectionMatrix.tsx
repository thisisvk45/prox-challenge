"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Process = "Flux-Cored" | "MIG" | "Stick" | "TIG";

// Data from selection_chart_extracted.json
const MATRIX: Record<Process, Record<string, string>> = {
  "Flux-Cored": {
    "Skill Level": "Low",
    "Shielding Gas": "None required",
    "Materials": "Steel, Stainless Steel",
    "Thickness": "18ga to 5/16\"",
    "Applications": "Galvanized steel, fabrication, pipe, repair",
    "Cleanliness": "More spatter",
  },
  MIG: {
    "Skill Level": "Low to Moderate",
    "Shielding Gas": "Required (indoor)",
    "Materials": "Steel, Stainless, Aluminum*",
    "Thickness": "22ga to 3/8\"",
    "Applications": "Sheet metal, automotive, tubing, structural",
    "Cleanliness": "Clean / minimal spatter",
  },
  Stick: {
    "Skill Level": "Moderate to High",
    "Shielding Gas": "None required",
    "Materials": "Steel, Stainless, Castings",
    "Thickness": "10ga to 1/2\"",
    "Applications": "Pipe, structural, pressure vessels, repair",
    "Cleanliness": "More spatter",
  },
  TIG: {
    "Skill Level": "High",
    "Shielding Gas": "Required (indoor)",
    "Materials": "Steel, Stainless, Chrome Moly",
    "Thickness": "24ga to 3/16\"",
    "Applications": "Exhausts, bike frames, thin pipe, metal art",
    "Cleanliness": "Extremely clean",
  },
};

const CRITERIA = ["Skill Level", "Shielding Gas", "Materials", "Thickness", "Applications", "Cleanliness"];
const PROCESSES: Process[] = ["Flux-Cored", "MIG", "Stick", "TIG"];

// Interactive picker
type PickerAnswers = {
  material?: "Steel" | "Stainless" | "Aluminum";
  thickness?: "Thin" | "Medium" | "Thick";
  environment?: "Indoor" | "Outdoor";
};

function recommendProcess(answers: PickerAnswers): Process | null {
  if (!answers.material || !answers.thickness || !answers.environment) return null;

  if (answers.material === "Aluminum") return "MIG"; // Spool gun
  if (answers.environment === "Outdoor" && answers.thickness === "Thin") return "Flux-Cored";
  if (answers.environment === "Outdoor") return answers.thickness === "Thick" ? "Stick" : "Flux-Cored";
  if (answers.thickness === "Thin") return "TIG";
  if (answers.thickness === "Thick") return "Stick";
  return "MIG";
}

export function SelectionMatrix({ highlight_process }: { highlight_process?: Process }) {
  const [highlight, setHighlight] = useState<Process | null>(highlight_process || null);
  const [answers, setAnswers] = useState<PickerAnswers>({});

  const recommended = recommendProcess(answers);

  // When picker recommends, highlight that process
  const activeHighlight = recommended || highlight;

  return (
    <div className="animate-message-in">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Welding Process Comparison
          </h3>
          <Badge variant="outline" className="font-mono text-xs">Interactive</Badge>
        </div>

        {/* Comparison grid */}
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 text-muted-foreground font-medium border-b border-border w-28"></th>
                {PROCESSES.map((p) => (
                  <th
                    key={p}
                    className={cn(
                      "text-center p-2 font-semibold border-b border-border cursor-pointer transition-colors",
                      activeHighlight === p
                        ? "text-foreground bg-primary/10"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                    onClick={() => { setHighlight(p); setAnswers({}); }}
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CRITERIA.map((criterion) => (
                <tr key={criterion}>
                  <td className="p-2 text-muted-foreground font-medium border-b border-border/50 font-mono text-[11px]">
                    {criterion}
                  </td>
                  {PROCESSES.map((p) => (
                    <td
                      key={p}
                      className={cn(
                        "p-2 text-center border-b border-border/50 transition-colors",
                        activeHighlight === p ? "text-foreground bg-primary/5" : "text-muted-foreground"
                      )}
                    >
                      {MATRIX[p][criterion]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Process picker */}
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground mb-2 font-medium">Pick a process</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Material</p>
              <div className="flex flex-wrap gap-1">
                {(["Steel", "Stainless", "Aluminum"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setAnswers((prev) => ({ ...prev, material: prev.material === m ? undefined : m }))}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] transition-colors",
                      answers.material === m
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Thickness</p>
              <div className="flex flex-wrap gap-1">
                {(["Thin", "Medium", "Thick"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setAnswers((prev) => ({ ...prev, thickness: prev.thickness === t ? undefined : t }))}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] transition-colors",
                      answers.thickness === t
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Environment</p>
              <div className="flex flex-wrap gap-1">
                {(["Indoor", "Outdoor"] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => setAnswers((prev) => ({ ...prev, environment: prev.environment === e ? undefined : e }))}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[11px] transition-colors",
                      answers.environment === e
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {recommended && (
            <div className="mt-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2">
              <p className="text-xs text-foreground">
                Recommended: <span className="font-semibold">{recommended}</span>
                {recommended === "MIG" && answers.material === "Aluminum" && (
                  <span className="text-muted-foreground"> (requires optional Spool Gun)</span>
                )}
              </p>
            </div>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-2">
          * Aluminum MIG requires optional Spool Gun. AC TIG (not available on this DC-only machine) is needed for aluminum TIG.
        </p>
      </div>
    </div>
  );
}
