/**
 * Tool definitions in Anthropic API format + dispatcher.
 * Reads KB JSON files directly to avoid kb.ts type mismatches.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { join } from "path";

const KB_DIR = join(process.cwd(), "kb");

function loadJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(KB_DIR, filename), "utf-8")) as T;
}

// Lazy-loaded KB data
let _specs: any;
let _dutyCycles: any;
let _polarity: any;
let _troubleshooting: any;
let _imageIndex: any;
let _selectionChart: any;
let _weldDiagnosis: any;
let _setupProcedures: any;

function specs() { return _specs ??= loadJson("specs.json"); }
function dutyCycles() { return (_dutyCycles ??= loadJson("duty_cycles.json")).duty_cycles as any[]; }
function polarity() { return _polarity ??= loadJson("polarity.json"); }
function troubleshooting() { return (_troubleshooting ??= loadJson("troubleshooting.json")).entries as any[]; }
function imageIndex() { return (_imageIndex ??= loadJson("image_index.json")).topics as Record<string, any>; }
function selectionChart() { return _selectionChart ??= loadJson("selection_chart_extracted.json"); }
function weldDiagnosis() {
  // Always re-read in dev; in production the serverless function cold-starts fresh anyway
  if (process.env.NODE_ENV === "development") return loadJson("weld_diagnosis_extracted.json");
  return _weldDiagnosis ??= loadJson("weld_diagnosis_extracted.json");
}
function setupProcedures() { return _setupProcedures ??= loadJson("setup_procedures.json"); }

// --- Anthropic API tool definitions ---

export const TOOL_DEFINITIONS: Anthropic.Messages.Tool[] = [
  {
    name: "lookup_spec",
    description:
      "Look up specifications for the Vulcan OmniPro 220. Filter by process (MIG, TIG, Stick) and/or voltage (120V, 240V). Returns current ranges, duty cycles, wire sizes, OCV, and materials.",
    input_schema: {
      type: "object" as const,
      properties: {
        process: { type: "string", enum: ["MIG", "TIG", "Stick"] },
        voltage: { type: "string", enum: ["120V", "240V"] },
      },
      required: [],
    },
  },
  {
    name: "lookup_duty_cycle",
    description:
      "Look up duty cycle information. Filter by process and/or voltage. Returns duty cycle percentages, amperage ratings, and calculated weld/rest times based on a 10-minute cycle.",
    input_schema: {
      type: "object" as const,
      properties: {
        process: { type: "string", enum: ["MIG", "TIG", "Stick"] },
        voltage: { type: "string", enum: ["120V", "240V"] },
      },
      required: [],
    },
  },
  {
    name: "lookup_polarity",
    description:
      "Look up cable polarity and socket connections for each welding process. Returns which cable goes in which socket (Positive/Negative), polarity type (DCEP/DCEN), and common mistakes.",
    input_schema: {
      type: "object" as const,
      properties: {
        process: {
          type: "string",
          enum: ["MIG", "Flux-Cored", "TIG", "Stick", "Spool Gun"],
        },
      },
      required: [],
    },
  },
  {
    name: "lookup_troubleshooting",
    description:
      "Search troubleshooting entries by keyword. Matches against problem descriptions, possible causes, and remedies.",
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: {
          type: "string",
          description:
            "Search term to match against problems, causes, and remedies",
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "get_manual_image",
    description:
      "Get relevant manual page images for a topic. Searches the image index by keyword to find the best matching page images.",
    input_schema: {
      type: "object" as const,
      properties: {
        keyword: {
          type: "string",
          description: "Topic or keyword to search for relevant images",
        },
      },
      required: ["keyword"],
    },
  },
  {
    name: "lookup_selection_chart",
    description:
      "Get the welding process selection chart. Helps users choose between MIG, Flux-Cored, TIG, and Stick based on skill level, material, thickness, gas requirements, and application.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "lookup_weld_diagnosis",
    description:
      "Get weld diagnosis information for identifying and fixing weld quality issues. Filter by process type (wire/stick).",
    input_schema: {
      type: "object" as const,
      properties: {
        process_type: {
          type: "string",
          enum: ["wire", "stick"],
          description: "'wire' for MIG/Flux-Cored, 'stick' for Stick welding",
        },
      },
      required: [],
    },
  },
  {
    name: "search_procedures",
    description:
      "Search setup procedures by process name or keyword. Returns step-by-step instructions for MIG, Flux-Cored, TIG, and Stick setup.",
    input_schema: {
      type: "object" as const,
      properties: {
        process: { type: "string", enum: ["MIG", "Flux-Cored", "TIG", "Stick"] },
        keyword: {
          type: "string",
          description: "Optional keyword to filter steps",
        },
      },
      required: [],
    },
  },
  {
    name: "diagnose_weld_photo",
    description:
      "Match a user's weld photo against the manual's weld diagnosis library. Call this ONLY when the user has uploaded a weld photo. Provide what you visually observe in the photo so the tool can find the best match from the manual's reference welds.",
    input_schema: {
      type: "object" as const,
      properties: {
        weld_type: {
          type: "string",
          enum: ["wire", "stick"],
          description: "'wire' for MIG/Flux-Cored welds, 'stick' for Stick/SMAW welds",
        },
        visible_characteristics: {
          type: "array",
          items: { type: "string" },
          description:
            "List of visual characteristics you observe in the photo, e.g. 'narrow bead', 'excessive spatter', 'high crown', 'undercut', 'burn-through', 'irregular ripples', 'wide flat bead', 'poor tie-in', 'porosity'",
        },
      },
      required: ["weld_type", "visible_characteristics"],
    },
  },
  {
    name: "render_artifact",
    description:
      "Return structured data for the frontend to render as an interactive artifact. Use for duty cycle calculators, polarity diagrams, troubleshooting flowcharts, comparison tables, weld diagnosis results, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        artifact_type: {
          type: "string",
          enum: [
            "duty_cycle_calculator",
            "front_panel_polarity",
            "polarity_diagram",
            "troubleshooting_flow",
            "troubleshooting_flowchart",
            "settings_configurator",
            "selection_matrix",
            "comparison_table",
            "spec_table",
            "procedure_checklist",
            "weld_diagnosis_result",
          ],
        },
        title: { type: "string", description: "Display title for the artifact" },
        data: {
          type: "object",
          description: "Structured data payload for the frontend to render",
        },
      },
      required: ["artifact_type", "title", "data"],
    },
  },
];

// --- Tool dispatcher ---

export async function handleToolCall(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "lookup_spec": {
      const s = specs();
      if (!input.process) return JSON.stringify(s, null, 2);
      const proc = s.processes[input.process as string];
      if (!proc)
        return JSON.stringify({ error: `Unknown process: ${input.process}` });
      if (input.voltage) {
        const key =
          input.voltage === "120V" ? "120VAC_60Hz" : "240VAC_60Hz";
        return JSON.stringify(
          {
            process: input.process,
            voltage: input.voltage,
            ...proc[key],
            weldable_materials: proc.weldable_materials,
            ...(proc.welding_wire_capacity
              ? {
                  welding_wire_capacity: proc.welding_wire_capacity,
                  wire_speed_ipm: proc.wire_speed_ipm,
                  wire_spool_capacity: proc.wire_spool_capacity,
                }
              : {}),
          },
          null,
          2
        );
      }
      return JSON.stringify({ process: input.process, ...proc }, null, 2);
    }

    case "lookup_duty_cycle": {
      let entries = dutyCycles();
      if (input.process)
        entries = entries.filter((e: any) => e.process === input.process);
      if (input.voltage) {
        const v = input.voltage as string;
        entries = entries.filter((e: any) => e.voltage === v || e.voltage === v.replace("V", "VAC"));
      }
      return JSON.stringify(
        {
          entries,
          note: "Duty cycle is based on a 10-minute cycle. Weld_minutes + rest_minutes = 10.",
        },
        null,
        2
      );
    }

    case "lookup_polarity": {
      const p = polarity();
      if (input.process) {
        const procName = input.process as string;
        if (procName === "Spool Gun") {
          return JSON.stringify({ process: "Spool Gun", ...p.spool_gun, common_mistakes: p.common_mistakes }, null, 2);
        }
        const proc = p.processes[procName];
        if (!proc)
          return JSON.stringify({ error: `Unknown process: ${procName}`, available: Object.keys(p.processes) });
        return JSON.stringify({ entries: [{ process: procName, ...proc }], common_mistakes: p.common_mistakes }, null, 2);
      }
      // Return all processes
      const entries = Object.entries(p.processes).map(([name, data]: [string, any]) => ({
        process: name,
        ...data,
      }));
      return JSON.stringify({ entries, spool_gun: p.spool_gun, common_mistakes: p.common_mistakes }, null, 2);
    }

    case "lookup_troubleshooting": {
      const all = troubleshooting();
      const kw = (input.keyword as string).toLowerCase();
      const matches = all.filter(
        (e: any) =>
          e.problem.toLowerCase().includes(kw) ||
          e.possible_causes.some((c: string) => c.toLowerCase().includes(kw)) ||
          e.remedies.some((r: string) => r.toLowerCase().includes(kw))
      );
      if (matches.length === 0)
        return JSON.stringify({
          matches: [],
          note: "No matching troubleshooting entries. Try broader keywords or rephrase.",
          all_problems: all.map((e: any) => e.problem),
        });
      return JSON.stringify({ matches }, null, 2);
    }

    case "get_manual_image": {
      const topics = imageIndex();
      const kw = (input.keyword as string).toLowerCase();
      const matches: Array<{
        topic: string;
        images: string[];
        description: string;
        relevance: number;
      }> = [];
      for (const [topic, data] of Object.entries(topics)) {
        const kwMatch = (data as any).keywords.filter(
          (k: string) => k.toLowerCase().includes(kw) || kw.includes(k.toLowerCase())
        );
        const topicMatch = topic.toLowerCase().includes(kw) ? 1 : 0;
        const descMatch = (data as any).description.toLowerCase().includes(kw) ? 1 : 0;
        const relevance = kwMatch.length * 2 + topicMatch + descMatch;
        if (relevance > 0) {
          matches.push({
            topic,
            images: (data as any).images.map((img: string) => `/manual-images/${img}`),
            description: (data as any).description,
            relevance,
          });
        }
      }
      matches.sort((a, b) => b.relevance - a.relevance);
      const top = matches.slice(0, 5);
      if (top.length === 0)
        return JSON.stringify({
          matches: [],
          note: "No matching images found. Try different keywords.",
          available_topics: Object.keys(topics),
        });
      return JSON.stringify({ matches: top }, null, 2);
    }

    case "lookup_selection_chart": {
      const chart = selectionChart();
      const topics = imageIndex();
      const img = topics["selection_chart"];
      return JSON.stringify(
        { chart, image: img ? `/manual-images/${img.images[0]}` : null },
        null,
        2
      );
    }

    case "lookup_weld_diagnosis": {
      const diagnosis = weldDiagnosis();
      if (input.process_type) {
        const key = input.process_type === "wire" ? "wire_weld_diagnosis" : "stick_weld_diagnosis";
        if (diagnosis[key]) return JSON.stringify({ [input.process_type as string]: diagnosis[key] }, null, 2);
        // Fallback to direct key
        if (diagnosis[input.process_type as string]) return JSON.stringify({ [input.process_type as string]: diagnosis[input.process_type as string] }, null, 2);
      }
      return JSON.stringify(diagnosis, null, 2);
    }

    case "search_procedures": {
      const procedures = setupProcedures();
      if (input.process) {
        const key = (input.process as string).toLowerCase().replace("-", "_");
        const proc = procedures.processes?.[key] || procedures[key];
        if (!proc)
          return JSON.stringify({
            error: `No procedure found for ${input.process}`,
            available: Object.keys(procedures.processes || procedures),
          });
        if (input.keyword) {
          const kw = (input.keyword as string).toLowerCase();
          const filtered = JSON.parse(JSON.stringify(proc));
          if (filtered.steps) {
            filtered.steps = filtered.steps.filter((s: any) =>
              JSON.stringify(s).toLowerCase().includes(kw)
            );
          }
          return JSON.stringify(filtered, null, 2);
        }
        return JSON.stringify(proc, null, 2);
      }
      const overview: Record<string, string[]> = {};
      const procs = procedures.processes || procedures;
      for (const [key, val] of Object.entries(procs) as any) {
        if (val?.steps)
          overview[key] = val.steps.map(
            (s: any) => s.title || s.step || `Step ${s.step_number}`
          );
      }
      return JSON.stringify({ available_procedures: overview }, null, 2);
    }

    case "diagnose_weld_photo": {
      const diagnosis = weldDiagnosis();
      const weldType = (input.weld_type as string) || "wire";
      const chars = (input.visible_characteristics as string[]) || [];
      const key = weldType === "stick" ? "stick_weld_diagnosis" : "wire_weld_diagnosis";
      const data = diagnosis[key];
      if (!data) return JSON.stringify({ error: "No diagnosis data for " + weldType });

      console.log("[diagnose_weld_photo] weld_type:", weldType);
      console.log("[diagnose_weld_photo] visible_characteristics:", JSON.stringify(chars));

      // Exact-name boost map: characteristic keywords → defect name
      const DEFECT_BOOSTS: Record<string, string[]> = {
        "porosity": ["porosity"], "porous": ["porosity"], "pores": ["porosity"], "pinhole": ["porosity"],
        "holes": ["porosity"], "cavities": ["porosity"], "gas pockets": ["porosity"],
        "spatter": ["spatter"], "splatter": ["spatter"],
        "burn-through": ["burn_through"], "burn through": ["burn_through"], "burnthrough": ["burn_through"],
        "undercut": ["undercut"],
        "crack": ["crack"], "cracking": ["crack"],
        "slag": ["slag"],
      };

      // Collect all characteristic words for boost lookup
      const charsLower = chars.map(c => c.toLowerCase());

      const candidates: Array<{
        label: string;
        visual_description: string;
        causes: string[];
        corrective_actions: string[];
        score: number;
        match_type: "scenario" | "defect";
      }> = [];

      function scoreText(text: string, label: string): number {
        let score = 0;
        const desc = text.toLowerCase();
        const lbl = label.toLowerCase();
        for (const c of chars) {
          const words = c.toLowerCase().split(/\s+/);
          for (const w of words) {
            if (w.length < 3) continue;
            if (desc.includes(w)) score += 2;
            if (lbl.includes(w)) score += 3;
          }
          if (desc.includes(c.toLowerCase())) score += 5;
        }
        return score;
      }

      // Score example welds (scenarios)
      for (const ex of data.example_welds || []) {
        const score = scoreText(ex.visual_description || "", ex.label || "");
        if (score > 0) {
          candidates.push({
            label: ex.label,
            visual_description: ex.visual_description,
            causes: ex.causes || [],
            corrective_actions: ex.corrective_actions || [],
            score,
            match_type: "scenario",
          });
        }
      }

      // Score defects — 3x multiplier + exact-name boosts (+200)
      for (const def of data.defects || []) {
        let score = scoreText(def.visual_description || "", def.name || "");
        // 3x multiplier for defects over scenarios
        score = Math.round(score * 3);
        // Exact-name boost: if any visible characteristic maps to this defect
        const defName = (def.name || "").toLowerCase();
        for (const cl of charsLower) {
          for (const [keyword, targets] of Object.entries(DEFECT_BOOSTS)) {
            if (cl.includes(keyword) && targets.includes(defName)) {
              score += 200;
              console.log(`[diagnose_weld_photo] BOOST +200: "${cl}" matched keyword "${keyword}" → defect "${defName}"`);
            }
          }
        }
        if (score > 0) {
          candidates.push({
            label: def.name.replace(/_/g, " "),
            visual_description: def.visual_description,
            causes: def.causes || [],
            corrective_actions: def.corrections || [],
            score,
            match_type: "defect",
          });
        }
      }

      console.log("[diagnose_weld_photo] candidates:", candidates.map(c => `${c.label}=${c.score}(${c.match_type})`).join(", "));

      // Sort by score descending
      candidates.sort((a, b) => b.score - a.score);
      const maxScore = candidates[0]?.score || 1;
      const top2 = candidates.slice(0, 2).map((c) => ({
        ...c,
        confidence: Math.min(95, Math.round((c.score / maxScore) * 85 + 10)),
      }));

      // If no matches, return a fallback
      if (top2.length === 0) {
        return JSON.stringify({
          matches: [],
          note: "Could not match the photo to a known weld pattern. Try describing the defect manually.",
          all_labels: (data.example_welds || []).map((e: any) => e.label),
        });
      }

      // Manual page reference
      const manualPage = weldType === "wire"
        ? "/manual-images/owner_p35_wire_weld_diagnosis.png"
        : "/manual-images/owner_p38_stick_weld_diagnosis.png";

      return JSON.stringify({
        matches: top2,
        manual_reference_image: manualPage,
        weld_type: weldType,
        note: "The weld_diagnosis_result artifact has been auto-rendered for the user. Provide your text analysis based on these matches — do NOT call render_artifact for this diagnosis.",
      }, null, 2);
    }

    case "render_artifact": {
      return JSON.stringify(
        {
          artifact: {
            type: input.artifact_type,
            title: input.title,
            data: input.data,
            render: true,
          },
        },
        null,
        2
      );
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
