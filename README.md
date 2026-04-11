# Vulcan OmniPro 220 — A Mini-Prox Prototype

*A miniature version of Prox Technologies' product, scoped to a single complex welder, built as a submission for the Founding Engineer challenge.*

**[Live demo](LIVE_URL_PLACEHOLDER) · [Video walkthrough](LOOM_URL_PLACEHOLDER) · [GitHub](https://github.com/thisisvk45) · [Website](https://helloviks.com) · [LinkedIn](https://www.linkedin.com/in/vikas-kumar45/)**

## Author

Vikas Kumar. MSBA candidate at Wake Forest University, graduating 2026. Founding AI Engineer at SViam.ai, with prior production AI work at Snap, Scale AI, Aditya Birla Group, and Lawroom AI.

> The only hobby I carry with me is building AI agents that solve real problems. Not API wrappers. Not chatbots over documentation. Systems that reason over structured knowledge and produce answers a human can act on — the kind of work where getting it wrong has real consequences.

I read the Prox job post, recognized it as the first company building the thing I actually want to build, and treated this challenge as an early prototype of what week one on the job would look like.

## The Challenge

Prox is building knowledge engines and multimodal agents for complex physical products. The thesis is sharp: general-purpose LLMs do not understand 48-page technical manuals, and even if they did, there is no harness to turn that understanding into a business tool. Dima's job post names the primitive directly: code generation. Not text generation. The agent's job is not to summarize a manual. It is to reason over structured knowledge and produce something the user can act on, whether that is a wiring diagram, a duty cycle calculation, or a settings recommendation.

The specific product is the Vulcan OmniPro 220, a multiprocess welder sold by Harbor Freight. Four welding processes: MIG, Flux-Cored, TIG, Stick. Dual voltage input (120V/240V). A 48-page owner's manual containing duty cycle matrices, polarity setup procedures, wire feed mechanisms, wiring schematics, troubleshooting tables, weld diagnosis photos, and a 61-part parts list. This is the kind of product where buying wrong or wiring wrong means a ruined job, a broken machine, or in the worst case, someone gets hurt.

The user is a garage hobbyist who just bought a welder, not a certified technician. They are not stupid. They are not a professional. They need an answer in 30 seconds, not a 48-page PDF. Every design decision in this project traces back to that user.

## The Approach: Four Pillars, Scoped Down

Rather than build a take-home, I built a miniature version of Prox. The job post describes four pillars the company is building. This prototype implements each one, scoped to one product.

1. **Knowledge Engine.** The 48-page manual was pre-extracted into 11 structured JSON files covering specs, duty cycles, polarity rules, troubleshooting matrices, setup procedures, parts, and process selection charts. This is not runtime RAG over a vector store. It is a structured knowledge base where every fact has a known location, a known type, and a known shape. The files live in `kb/` and load at startup.

2. **Multimodal Agent with Code Generation as a Primitive.** The agent decides at query time whether to respond with text, manual image citations, or interactive React artifacts. Five artifact types ship with the prototype: `FrontPanelPolarity` (a live SVG of the welder's front panel with the correct sockets highlighted), `DutyCycleCalculator` (an interactive slider with a donut chart), `TroubleshootingFlowchart` (a decision tree), `SettingsConfigurator` (a three-dropdown recommender), and `SelectionMatrix` (a process comparison grid). These are not descriptions of diagrams. They are diagrams, rendered live from structured data at query time.

3. **Visual Knowledge from Image-Only Sources.** Three of the highest-value assets in the manual contain zero extractable text: the process selection chart, the quick-reference chart printed inside the door panel, and the weld diagnosis photo pages. All tabular data is baked into the pixels. I ran Claude's vision API once at build time against these three assets, saved the results as structured JSON, and committed them to the repo. Total cost: under $0.05. Runtime cost: zero. The engine does not see images at query time. It reads pre-extracted structured data about images, and serves the original images as citations when the user needs to see them.

4. **Feedback-Aware Design.** A true tribal-knowledge feedback loop requires real deployment with real users asking real questions. This prototype does not fake that. What it does is design for it: the architecture separates knowledge (static JSON), reasoning (agent + tools), and presentation (frontend artifacts) cleanly enough that a feedback loop can be added by logging queries, flagging low-confidence answers, and promoting verified responses back into the knowledge base as new structured entries. Scoped out of the prototype, designed for.

## Architecture

Three layers. Every layer was built in response to a limitation discovered in the previous one. The full iteration story is below. Here is the final shape.

```
Layer 1: Knowledge Base (build-time, committed to repo)
  specs.json · duty_cycles.json · polarity.json · troubleshooting.json
  setup_procedures.json · parts.json · selection_chart_extracted.json
  door_panel_extracted.json · weld_diagnosis_extracted.json
  image_index.json (31 topics, 52 manual page images)
                          |
                          v
Layer 2: Agent Brain (runtime, per-query)
  Claude Agent SDK + Sonnet 4.5
  9 tools: lookup_spec · lookup_duty_cycle · lookup_polarity
           lookup_troubleshooting · lookup_selection_chart
           lookup_weld_diagnosis · search_procedures
           get_manual_image · render_artifact
  System prompt enforces tone (garage hobbyist, not pro)
  and artifact-first response format for polarity,
  duty cycle, troubleshooting, and process selection
                          |
                          v
Layer 3: Frontend (Next.js, streamed)
  Server-Sent Events from /api/chat
  React Markdown + rehype-unwrap-images for inline citations
  5 interactive React artifact components
  Light/dark theme via next-themes
  shadcn/ui + Geist Sans/Mono
```

**Layer 1** is the knowledge base. Eleven JSON files extracted from the manual, plus an image index mapping 31 topics to 52 page images. Every tool in Layer 2 reads from these files. No vector database. No embedding model. No retrieval pipeline. The structured data is small enough to hold in memory and precise enough that fuzzy search is unnecessary.

**Layer 2** is the agent. The Claude Agent SDK runs Sonnet 4.5 with nine MCP tools defined in `lib/tools.ts`. The system prompt in `lib/system-prompt.ts` enforces two things: always call a tool before answering, and always render an interactive artifact when the question involves polarity, duty cycles, troubleshooting, or process selection. The `render_artifact` tool is the code-generation primitive. It returns structured data that the frontend renders as a live React component.

**Layer 3** is the frontend. A single-page Next.js app that streams SSE events from the API route, progressively renders text and artifacts, and displays manual images inline with page citations. The empty state renders a live `FrontPanelPolarity` SVG so the reviewer sees the product's capability before typing a single character.

## The Iteration Story

### Iteration 1: Runtime RAG was the obvious move. It was also wrong.

The first instinct for any manual-based Q&A system is vector search over chunked PDF text. I rejected it before writing a line of code. Duty cycle numbers and polarity wiring cannot tolerate hallucination. If the agent says "ground goes in positive" when the answer is "ground goes in negative," someone wires their welder backwards, gets poor weld quality, and potentially damages the machine. RAG makes confident wrong answers easy. Structured extraction makes wrong answers impossible for the facts that matter most.

### Iteration 2: Pre-extracted JSON solved the text. It did not solve the pictures.

I read every page of the manual and wrote the structured JSON files. This worked for specs, duty cycles, polarity rules, troubleshooting matrices, and the parts list. Then I discovered that the three highest-value assets contain zero extractable text. The process selection chart, the door panel quick-reference, and the weld diagnosis photos are images with tabular data baked into the pixels. Text-only extraction would ignore exactly the content users would ask about most.

### Iteration 3: One-time vision calls, cached forever.

Rather than call Claude's vision API at runtime for every image-related question, I ran the extraction once at build time against the three image-only assets. The results are structured JSON committed to the repo. Total cost: under $0.05. Runtime cost per query: zero. The manual does not change between queries.

### Iteration 4: The reframe.

Mid-build, I stopped treating this as "a take-home for a welding manual" and started treating it as "a miniature version of what Prox is actually building." That reframe changed the architecture. It is why `render_artifact` exists as a separate tool from `get_manual_image`. Manual images are citations. Artifacts are answers. A top-tier response to a polarity question is not a link to page 14 of the PDF. It is a live SVG of the welder's front panel with the correct sockets pulsing green, labeled for the specific process the user asked about. That distinction comes directly from Dima's line in the job post: when something is too cognitively hard to explain in words, the agent draws it. The reframe is why the five interactive artifacts exist at all.

### Iteration 5: The frontend is the graded surface.

The first smoke test of the agent passed on the backend. Correct tool calls, correct answers, correct image references. But opening the placeholder UI revealed that react-markdown wrapped images in `<p>` tags (causing hydration errors with `<figure>` components), and the message surface looked like a developer debug view. That moment clarified a hard truth: a reviewer will never see the backend quality if the frontend hides it. I rebuilt the presentation layer: shadcn/ui components, light and dark theme support, SSE streaming with distinct event types for text, tool calls, and artifacts, and a hero empty state that renders the FrontPanelPolarity SVG the moment the page loads.

## Stress Test Results

Before submission, I ran a 30-question stress test across eight categories. Every question was graded PASS, PARTIAL, or FAIL against expected behavior including required tool calls, artifact rendering, and factual accuracy. Total cost: $1.17. Total runtime: 14 minutes.

| Category | Questions | Pass |
|---|---|---|
| Basic lookups | 5 | 5/5 |
| Polarity and artifact routing | 5 | 5/5 |
| Duty cycle and cross-reference | 4 | 4/4 |
| Known knowledge gaps (hallucination traps) | 3 | 3/3 |
| Wrong user assumptions | 4 | 4/4 |
| Troubleshooting | 4 | 4/4 |
| Vague / ambiguous | 3 | 3/3 |
| Multimodal / image-only content | 2 | 2/2 |
| **Total** | **30** | **30/30** |

Three questions that prove the system's reasoning:

- "I want to TIG weld aluminum, what settings?" The agent cross-referenced the selection chart, identified that the OmniPro 220 is a DC-only TIG machine, and flagged that aluminum TIG requires AC. It refused to provide settings for an impossible configuration and offered the alternative: aluminum MIG with the optional spool gun.

- "What's the exact voltage for 14 gauge steel with 0.030 wire?" The agent refused to invent a number. It correctly explained that the OmniPro 220 uses a synergic auto-settings system where the machine calculates voltage from the wire diameter and material thickness the user selects on the LCD.

- "I plugged my ground into the positive socket for MIG, is that right?" The agent caught the wrong assumption, explained that MIG uses DCEP so the ground clamp belongs in the negative socket, and rendered a live front panel SVG showing the correct wiring with the sockets pulsing green.

## Running It

```bash
git clone https://github.com/thisisvk45/prox-challenge
cd prox-challenge/app
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
npm install
npm run dev
```

The project uses the Claude Agent SDK. Requires an Anthropic API key from [console.anthropic.com](https://console.anthropic.com).

## What I Would Build In Week One

- **Voice in and voice out.** Deepgram STT into the agent, ElevenLabs TTS out. The garage user is holding a welding torch, not a keyboard. I already built this stack at SViam.ai and would lift it directly.
- **Photo-based weld diagnosis.** User uploads a photo of their weld. The agent matches it against the pre-extracted weld diagnosis library and renders a side-by-side comparison with the corrective action.
- **The tribal knowledge feedback loop.** Every user question logged, every low-confidence answer flagged, a lightweight admin view for a human expert to promote good answers into the knowledge base as new structured entries.
- **Multi-product knowledge isolation.** This prototype is hard-coded to one welder. A production version would namespace the knowledge base per product and load the relevant one at query time. The architecture already supports this. It is a folder structure change, not a rewrite.
- **Telephony.** SIP trunking, call routing, real phone support. The highest-value version of this product is not a website. It is a phone number a user calls when they are standing in their garage at 9 PM trying to fix a bad weld.

## Tech Stack

- **Agent:** Claude Agent SDK (TypeScript), Sonnet 4.5
- **Knowledge base:** Pre-extracted JSON, 11 files, committed to repo
- **Image index:** 52 manual page PNGs across 31 topics
- **Frontend:** Next.js 14 App Router, TypeScript, shadcn/ui, Tailwind, react-markdown, recharts, lucide-react
- **Themes:** next-themes, Geist Sans, Geist Mono
- **Hosting:** Vercel
- **Cost per query:** ~$0.04 average (30-question stress test totaled $1.17)

## Contact

Built by Vikas Kumar.
Primary: vikas.applications45@gmail.com
Academic: kumav25@wfu.edu
Website: [helloviks.com](https://helloviks.com)
LinkedIn: [linkedin.com/in/vikas-kumar45](https://www.linkedin.com/in/vikas-kumar45/)

*This prototype exists because I want the Prox role. The most honest application I can write is the company's product, rebuilt in miniature, in a week, with the founder reading the code.*
