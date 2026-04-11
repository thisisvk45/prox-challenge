"use client";

import { FrontPanelPolarity } from "./artifacts/FrontPanelPolarity";
import { DutyCycleCalculator } from "./artifacts/DutyCycleCalculator";
import { TroubleshootingFlowchart } from "./artifacts/TroubleshootingFlowchart";
import { SettingsConfigurator } from "./artifacts/SettingsConfigurator";
import { SelectionMatrix } from "./artifacts/SelectionMatrix";
import { WeldDiagnosisResult } from "./artifacts/WeldDiagnosisResult";
import { MachinePhotoAnnotation } from "./artifacts/MachinePhotoAnnotation";
import { Badge } from "./ui/badge";

export type ArtifactPayload = {
  artifact_type: string;
  title: string;
  data: Record<string, unknown>;
};

export function ArtifactRenderer({ artifact }: { artifact: ArtifactPayload }) {
  const { artifact_type, data } = artifact;

  switch (artifact_type) {
    case "front_panel_polarity":
    case "polarity_diagram":
      return (
        <FrontPanelPolarity
          process={(data.process as "MIG" | "Flux-Cored" | "TIG" | "Stick") || "MIG"}
        />
      );

    case "duty_cycle_calculator":
      return (
        <DutyCycleCalculator
          process={(data.process as "MIG" | "TIG" | "Stick") || "MIG"}
          voltage={(data.voltage as "120V" | "240V") || "240V"}
        />
      );

    case "troubleshooting_flow":
    case "troubleshooting_flowchart":
      return (
        <TroubleshootingFlowchart
          initial_symptom={(data.initial_symptom as string) || (data.symptom as string) || "unknown issue"}
        />
      );

    case "settings_configurator":
    case "spec_table":
      return (
        <SettingsConfigurator
          process={data.process as "MIG" | "Flux-Cored" | "TIG" | "Stick" | undefined}
        />
      );

    case "selection_matrix":
    case "comparison_table":
      return (
        <SelectionMatrix
          highlight_process={data.highlight_process as "Flux-Cored" | "MIG" | "Stick" | "TIG" | undefined}
        />
      );

    case "procedure_checklist":
      return (
        <SettingsConfigurator
          process={data.process as "MIG" | "Flux-Cored" | "TIG" | "Stick" | undefined}
        />
      );

    case "weld_diagnosis_result":
      return (
        <WeldDiagnosisResult
          user_image_url={data.user_image_url as string}
          top_match={data.top_match as any}
          secondary_match={data.secondary_match as any}
          manual_image_url={data.manual_image_url as string | undefined}
          weld_type={(data.weld_type as "wire" | "stick") || "wire"}
        />
      );

    case "machine_photo_annotation":
      return (
        <MachinePhotoAnnotation
          user_image_url={data.user_image_url as string}
          view_type={(data.view_type as string) || "general"}
          annotations={(data.annotations as any[]) || []}
        />
      );

    default:
      return (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="font-mono text-xs">Artifact</Badge>
            <span className="text-xs text-muted-foreground">{artifact_type}</span>
          </div>
          <pre className="text-xs text-muted-foreground overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      );
  }
}
