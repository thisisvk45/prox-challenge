import { readFileSync } from "fs";
import { join } from "path";

const KB_DIR = join(process.cwd(), "kb");

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(KB_DIR, filename), "utf-8")) as T;
}

// --- Types ---

export type DutyCycleEntry = {
  process: string;
  voltage: string;
  duty_cycle_percent: number;
  at_amperage: number;
  max_continuous_amperage: number;
  weld_minutes: number;
  rest_minutes: number;
};

export type PolarityEntry = {
  process: string;
  polarity: string;
  cable_to_socket: Record<string, string>;
  notes: string;
  common_mistakes: string[];
};

export type TroubleshootingEntry = {
  problem: string;
  possible_causes: string[];
  remedies: string[];
  manual_page: number;
};

export type Part = {
  ref_no: number;
  part_number: string;
  description: string;
  quantity: number;
};

export type ImageIndexTopic = {
  images: string[];
  keywords: string[];
  description: string;
};

// --- Loaders ---

let _specs: any = null;
export function getSpecs() {
  if (!_specs) _specs = loadJson("specs.json");
  return _specs;
}

let _dutyCycles: { entries: DutyCycleEntry[] } | null = null;
export function getDutyCycles(): DutyCycleEntry[] {
  if (!_dutyCycles) _dutyCycles = loadJson("duty_cycles.json");
  return _dutyCycles!.entries;
}

let _polarity: { entries: PolarityEntry[] } | null = null;
export function getPolarity(): PolarityEntry[] {
  if (!_polarity) _polarity = loadJson("polarity.json");
  return _polarity!.entries;
}

let _troubleshooting: { entries: TroubleshootingEntry[] } | null = null;
export function getTroubleshooting(): TroubleshootingEntry[] {
  if (!_troubleshooting) _troubleshooting = loadJson("troubleshooting.json");
  return _troubleshooting!.entries;
}

let _parts: { parts: Part[] } | null = null;
export function getParts(): Part[] {
  if (!_parts) _parts = loadJson("parts.json");
  return _parts!.parts;
}

let _setupProcedures: any = null;
export function getSetupProcedures() {
  if (!_setupProcedures) _setupProcedures = loadJson("setup_procedures.json");
  return _setupProcedures;
}

let _imageIndex: { topics: Record<string, ImageIndexTopic> } | null = null;
export function getImageIndex(): Record<string, ImageIndexTopic> {
  if (!_imageIndex) _imageIndex = loadJson("image_index.json");
  return _imageIndex!.topics;
}

let _selectionChart: any = null;
export function getSelectionChart() {
  if (!_selectionChart)
    _selectionChart = loadJson("selection_chart_extracted.json");
  return _selectionChart;
}

let _weldDiagnosis: any = null;
export function getWeldDiagnosis() {
  if (!_weldDiagnosis)
    _weldDiagnosis = loadJson("weld_diagnosis_extracted.json");
  return _weldDiagnosis;
}

let _doorPanel: any = null;
export function getDoorPanel() {
  if (!_doorPanel) _doorPanel = loadJson("door_panel_extracted.json");
  return _doorPanel;
}
