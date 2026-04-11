import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import {
  getSpecs,
  getDutyCycles,
  getPolarity,
  getTroubleshooting,
  getParts,
  getSetupProcedures,
  getImageIndex,
  getSelectionChart,
  getWeldDiagnosis,
  getDoorPanel,
} from "./kb";

// Helper: format tool result as MCP CallToolResult
function textResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

// --- Tool Definitions ---

const lookupSpec = tool(
  "lookup_spec",
  "Look up specifications for the Vulcan OmniPro 220. Filter by process (MIG, TIG, Stick) and/or voltage (120V, 240V). Returns current ranges, duty cycles, wire sizes, OCV, and materials.",
  { process: z.enum(["MIG", "TIG", "Stick"]).optional(), voltage: z.enum(["120V", "240V"]).optional() },
  async (args) => {
    const specs = getSpecs();
    if (!args.process) return textResult(specs);
    const proc = specs.processes[args.process];
    if (!proc) return textResult({ error: `Unknown process: ${args.process}` });
    if (args.voltage) {
      const key = args.voltage === "120V" ? "120VAC_60Hz" : "240VAC_60Hz";
      return textResult({ process: args.process, voltage: args.voltage, ...proc[key], weldable_materials: proc.weldable_materials, ...(proc.welding_wire_capacity ? { welding_wire_capacity: proc.welding_wire_capacity, wire_speed_ipm: proc.wire_speed_ipm, wire_spool_capacity: proc.wire_spool_capacity } : {}) });
    }
    return textResult({ process: args.process, ...proc });
  }
);

const lookupDutyCycle = tool(
  "lookup_duty_cycle",
  "Look up duty cycle information. Filter by process and/or voltage. Returns duty cycle percentages, amperage ratings, and calculated weld/rest times based on a 10-minute cycle.",
  { process: z.enum(["MIG", "TIG", "Stick"]).optional(), voltage: z.enum(["120V", "240V"]).optional() },
  async (args) => {
    let entries = getDutyCycles();
    if (args.process) entries = entries.filter((e) => e.process === args.process);
    if (args.voltage) entries = entries.filter((e) => e.voltage === args.voltage);
    return textResult({ entries, note: "Duty cycle is based on a 10-minute cycle. Weld_minutes + rest_minutes = 10." });
  }
);

const lookupPolarity = tool(
  "lookup_polarity",
  "Look up cable polarity and socket connections for each welding process. Returns which cable goes in which socket (Positive/Negative), polarity type (DCEP/DCEN), and common mistakes.",
  { process: z.enum(["MIG", "Flux-Cored", "TIG", "Stick", "Spool Gun"]).optional() },
  async (args) => {
    let entries = getPolarity();
    if (args.process) entries = entries.filter((e) => e.process === args.process);
    return textResult({ entries });
  }
);

const lookupTroubleshooting = tool(
  "lookup_troubleshooting",
  "Search troubleshooting entries by keyword. Matches against problem descriptions, possible causes, and remedies. Returns matching problems with causes and fixes.",
  { keyword: z.string().describe("Search term to match against problems, causes, and remedies") },
  async (args) => {
    const all = getTroubleshooting();
    const kw = args.keyword.toLowerCase();
    const matches = all.filter(
      (e) =>
        e.problem.toLowerCase().includes(kw) ||
        e.possible_causes.some((c) => c.toLowerCase().includes(kw)) ||
        e.remedies.some((r) => r.toLowerCase().includes(kw))
    );
    if (matches.length === 0) return textResult({ matches: [], note: "No matching troubleshooting entries. Try broader keywords or rephrase.", all_problems: all.map((e) => e.problem) });
    return textResult({ matches });
  }
);

const getManualImage = tool(
  "get_manual_image",
  "Get relevant manual page images for a topic. Searches the image index by keyword to find the best matching page images. Returns image filenames and descriptions. Use when the user's question involves visual information (setup diagrams, weld diagnosis photos, panel layout, etc.).",
  { keyword: z.string().describe("Topic or keyword to search for relevant images") },
  async (args) => {
    const topics = getImageIndex();
    const kw = args.keyword.toLowerCase();
    const matches: Array<{ topic: string; images: string[]; description: string; relevance: number }> = [];
    for (const [topic, data] of Object.entries(topics)) {
      const kwMatch = data.keywords.filter((k) => k.toLowerCase().includes(kw) || kw.includes(k.toLowerCase()));
      const topicMatch = topic.toLowerCase().includes(kw) ? 1 : 0;
      const descMatch = data.description.toLowerCase().includes(kw) ? 1 : 0;
      const relevance = kwMatch.length * 2 + topicMatch + descMatch;
      if (relevance > 0) {
        matches.push({
          topic,
          images: data.images.map((img) => `/manual-images/${img}`),
          description: data.description,
          relevance,
        });
      }
    }
    matches.sort((a, b) => b.relevance - a.relevance);
    const top = matches.slice(0, 5);
    if (top.length === 0) return textResult({ matches: [], note: "No matching images found. Try different keywords.", available_topics: Object.keys(topics) });
    return textResult({ matches: top });
  }
);

const lookupSelectionChart = tool(
  "lookup_selection_chart",
  "Get the welding process selection chart. Helps users choose between MIG, Flux-Cored, TIG, and Stick based on skill level, material, thickness, gas requirements, and application.",
  {},
  async () => {
    const chart = getSelectionChart();
    const topics = getImageIndex();
    const img = topics["selection_chart"];
    return textResult({ chart, image: img ? `/manual-images/${img.images[0]}` : null });
  }
);

const lookupWeldDiagnosis = tool(
  "lookup_weld_diagnosis",
  "Get weld diagnosis information for identifying and fixing weld quality issues. Filter by process type (wire/stick). Returns diagnosis criteria, common defects, and correction guidance.",
  { process_type: z.enum(["wire", "stick"]).optional().describe("'wire' for MIG/Flux-Cored, 'stick' for Stick welding") },
  async (args) => {
    const diagnosis = getWeldDiagnosis();
    if (args.process_type && diagnosis[args.process_type]) {
      return textResult({ [args.process_type]: diagnosis[args.process_type] });
    }
    return textResult(diagnosis);
  }
);

const searchProcedures = tool(
  "search_procedures",
  "Search setup procedures by process name or keyword. Returns step-by-step instructions for MIG, Flux-Cored, TIG, and Stick setup, including LCD settings configuration.",
  { process: z.enum(["MIG", "Flux-Cored", "TIG", "Stick"]).optional(), keyword: z.string().optional().describe("Optional keyword to filter steps") },
  async (args) => {
    const procedures = getSetupProcedures();
    if (args.process) {
      const key = args.process.toLowerCase().replace("-", "_");
      const proc = procedures.processes?.[key] || procedures[key];
      if (!proc) return textResult({ error: `No procedure found for ${args.process}`, available: Object.keys(procedures.processes || procedures) });
      if (args.keyword) {
        const kw = args.keyword.toLowerCase();
        // Filter steps containing keyword
        const filtered = JSON.parse(JSON.stringify(proc));
        if (filtered.steps) {
          filtered.steps = filtered.steps.filter((s: any) =>
            JSON.stringify(s).toLowerCase().includes(kw)
          );
        }
        return textResult(filtered);
      }
      return textResult(proc);
    }
    // Return overview of all procedures
    const overview: Record<string, string[]> = {};
    const procs = procedures.processes || procedures;
    for (const [key, val] of Object.entries(procs) as any) {
      if (val?.steps) overview[key] = val.steps.map((s: any) => s.title || s.step || `Step ${s.step_number}`);
    }
    return textResult({ available_procedures: overview });
  }
);

const renderArtifact = tool(
  "render_artifact",
  "Return structured data for the frontend to render as an interactive artifact. Use for duty cycle calculators, polarity diagrams, troubleshooting flowcharts, comparison tables, etc.",
  {
    artifact_type: z.enum(["duty_cycle_calculator", "polarity_diagram", "troubleshooting_flow", "comparison_table", "spec_table", "procedure_checklist"]),
    title: z.string().describe("Display title for the artifact"),
    data: z.record(z.string(), z.unknown()).describe("Structured data payload for the frontend to render"),
  },
  async (args) => {
    return textResult({
      artifact: {
        type: args.artifact_type,
        title: args.title,
        data: args.data,
        render: true,
      },
    });
  }
);

// --- MCP Server ---

export function createKbMcpServer() {
  return createSdkMcpServer({
    name: "omnipro-kb",
    version: "1.0.0",
    tools: [
      lookupSpec,
      lookupDutyCycle,
      lookupPolarity,
      lookupTroubleshooting,
      getManualImage,
      lookupSelectionChart,
      lookupWeldDiagnosis,
      searchProcedures,
      renderArtifact,
    ],
  });
}
