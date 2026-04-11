"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

type Process = "MIG" | "Flux-Cored" | "TIG" | "Stick";

const MATERIALS = ["Steel", "Stainless Steel", "Aluminum"] as const;
type Material = (typeof MATERIALS)[number];

const THICKNESSES = [
  "24ga", "22ga", "20ga", "18ga", "16ga", "14ga", "12ga", "10ga",
  "1/8\"", "5/32\"", "3/16\"", "1/4\"", "5/16\"", "3/8\"", "1/2\"",
] as const;
type Thickness = (typeof THICKNESSES)[number];

type Recommendation = {
  wire_diameter?: string;
  electrode_type?: string;
  electrode_diameter?: string;
  gas?: string;
  polarity: string;
  voltage_note: string;
  warnings: string[];
  synergic_note: string;
};

// Material thickness ranges supported per process (from selection_chart_extracted.json)
const THICKNESS_RANGES: Record<Process, { min: number; max: number }> = {
  "Flux-Cored": { min: 18, max: 5.16 }, // 18ga to 5/16"
  MIG: { min: 22, max: 3.8 }, // 22ga to 3/8"
  Stick: { min: 10, max: 0.5 }, // 10ga to 1/2"
  TIG: { min: 24, max: 3.16 }, // 24ga to 3/16"
};

// Convert thickness string to decimal inches for comparison
function thicknessToInches(t: string): number {
  const gauge: Record<string, number> = {
    "24ga": 0.024, "22ga": 0.030, "20ga": 0.036, "18ga": 0.048,
    "16ga": 0.060, "14ga": 0.075, "12ga": 0.105, "10ga": 0.135,
  };
  if (gauge[t]) return gauge[t];
  const frac: Record<string, number> = {
    "1/8\"": 0.125, "5/32\"": 0.156, "3/16\"": 0.188,
    "1/4\"": 0.250, "5/16\"": 0.313, "3/8\"": 0.375, "1/2\"": 0.500,
  };
  return frac[t] || 0;
}

function getRecommendation(process: Process, material: Material, thickness: Thickness): Recommendation {
  const inches = thicknessToInches(thickness);
  const warnings: string[] = [];

  // Material compatibility checks
  if (material === "Aluminum") {
    if (process === "TIG") {
      warnings.push("The OmniPro 220 is DC-only. AC TIG is required for aluminum. This machine cannot TIG weld aluminum.");
      return { polarity: "N/A", voltage_note: "Not supported", warnings, synergic_note: "" };
    }
    if (process === "MIG") {
      warnings.push("Aluminum MIG requires the optional Spool Gun (sold separately). Standard MIG gun will not feed aluminum wire reliably.");
    }
    if (process === "Flux-Cored") {
      warnings.push("Flux-cored aluminum wire is not commonly available. Use MIG with spool gun for aluminum.");
      return { polarity: "N/A", voltage_note: "Not recommended", warnings, synergic_note: "" };
    }
    if (process === "Stick") {
      warnings.push("Aluminum stick welding is possible but very difficult and not recommended for beginners. Results are generally poor.");
    }
  }

  // Thickness checks
  if (inches > 0.375 && (process === "MIG" || process === "Flux-Cored")) {
    warnings.push(`${thickness} is at or beyond the upper limit for ${process}. Consider Stick welding for better penetration on thick material.`);
  }
  if (inches < 0.048 && process === "Stick") {
    warnings.push(`${thickness} is too thin for Stick welding — you will likely burn through. Use MIG or TIG instead.`);
  }
  if (inches > 0.188 && process === "TIG") {
    warnings.push(`${thickness} is beyond the practical range for TIG on this machine. Consider MIG or Stick.`);
  }

  // Build recommendation per process
  const polarity: Record<Process, string> = {
    MIG: "DCEP (wire positive, workpiece negative)",
    "Flux-Cored": "DCEN (wire negative, workpiece positive)",
    TIG: "DCEN (tungsten negative, workpiece positive)",
    Stick: "DCEP (electrode positive, workpiece negative)",
  };

  const gas: Record<Process, string> = {
    MIG: material === "Aluminum" ? "100% Argon" : material === "Stainless Steel" ? "Stainless Tri-Mix" : "C25 (75% Argon / 25% CO2)",
    "Flux-Cored": "None (self-shielded)",
    TIG: "100% Argon",
    Stick: "None (electrode coating)",
  };

  let wire_diameter: string | undefined;
  let electrode_type: string | undefined;
  let electrode_diameter: string | undefined;

  if (process === "MIG" || process === "Flux-Cored") {
    if (inches <= 0.060) wire_diameter = process === "MIG" ? "0.025\" or 0.030\"" : "0.030\"";
    else if (inches <= 0.135) wire_diameter = process === "MIG" ? "0.030\" or 0.035\"" : "0.030\" or 0.035\"";
    else wire_diameter = process === "MIG" ? "0.035\"" : "0.035\" or 0.045\"";
  }

  if (process === "Stick") {
    electrode_type = "E7018 (70xx) for general purpose, E6013 (60xx) for thin material";
    if (inches <= 0.075) electrode_diameter = "1/16\" or 5/64\"";
    else if (inches <= 0.188) electrode_diameter = "3/32\" or 1/8\"";
    else electrode_diameter = "1/8\" or 5/32\"";
  }

  if (process === "TIG") {
    electrode_type = "2% Lanthanated or 2% Ceriated Tungsten";
    if (inches <= 0.060) electrode_diameter = "1/16\"";
    else if (inches <= 0.125) electrode_diameter = "3/32\"";
    else electrode_diameter = "1/8\"";
  }

  return {
    wire_diameter,
    electrode_type,
    electrode_diameter,
    gas: gas[process],
    polarity: polarity[process],
    voltage_note: "120V for thinner material / lower amps, 240V for full power range",
    warnings,
    synergic_note: process === "MIG" || process === "Flux-Cored"
      ? "The OmniPro 220 has synergic auto-settings. Select wire diameter and material thickness on the LCD, and the machine automatically calculates optimal WFS and voltage."
      : process === "TIG"
      ? "Select rod diameter and material thickness on the LCD. The machine suggests a starting amperage. Use the foot pedal for real-time control."
      : "Select electrode type and diameter on the LCD. The machine suggests starting amperage. Adjust Hot Start and Arc Force as needed.",
  };
}

export function SettingsConfigurator({ process: initialProcess }: { process?: Process }) {
  const [process, setProcess] = useState<Process | "">(initialProcess || "");
  const [material, setMaterial] = useState<Material | "">("");
  const [thickness, setThickness] = useState<Thickness | "">("");

  const allSet = process && material && thickness;
  const rec = allSet ? getRecommendation(process as Process, material as Material, thickness as Thickness) : null;

  return (
    <div className="animate-message-in">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Settings Configurator</h3>
          <Badge variant="outline" className="font-mono text-xs">Interactive</Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Process</label>
            <select
              value={process}
              onChange={(e) => setProcess(e.target.value as Process)}
              className="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select...</option>
              {(["MIG", "Flux-Cored", "TIG", "Stick"] as const).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Material</label>
            <select
              value={material}
              onChange={(e) => setMaterial(e.target.value as Material)}
              className="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select...</option>
              {MATERIALS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Thickness</label>
            <select
              value={thickness}
              onChange={(e) => setThickness(e.target.value as Thickness)}
              className="w-full rounded-md border border-border bg-muted/30 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">Select...</option>
              {THICKNESSES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {rec && (
          <div className="space-y-2">
            {rec.warnings.length > 0 && (
              <div className="space-y-1.5">
                {rec.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2">
                    <AlertTriangle size={14} className="text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">{w}</p>
                  </div>
                ))}
              </div>
            )}

            {rec.voltage_note !== "Not supported" && rec.voltage_note !== "Not recommended" && (
              <div className="grid grid-cols-2 gap-2 text-sm">
                {rec.wire_diameter && (
                  <div className="rounded-md bg-muted/30 border border-border px-3 py-2">
                    <p className="text-xs text-muted-foreground">Wire Diameter</p>
                    <p className="font-mono text-foreground">{rec.wire_diameter}</p>
                  </div>
                )}
                {rec.electrode_type && (
                  <div className="rounded-md bg-muted/30 border border-border px-3 py-2 col-span-2">
                    <p className="text-xs text-muted-foreground">Electrode</p>
                    <p className="text-foreground">{rec.electrode_type}</p>
                    {rec.electrode_diameter && (
                      <p className="font-mono text-muted-foreground text-xs mt-0.5">{rec.electrode_diameter}</p>
                    )}
                  </div>
                )}
                <div className="rounded-md bg-muted/30 border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Gas</p>
                  <p className="font-mono text-foreground text-xs">{rec.gas}</p>
                </div>
                <div className="rounded-md bg-muted/30 border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Polarity</p>
                  <p className="font-mono text-foreground text-xs">{rec.polarity}</p>
                </div>
              </div>
            )}

            {rec.synergic_note && (
              <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
                {rec.synergic_note}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
