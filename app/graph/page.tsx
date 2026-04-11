"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  Position,
  type Node,
  type Edge,
  type NodeMouseHandler,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as d3 from "d3-force";
import { useTheme } from "next-themes";
import Link from "next/link";
import {
  nodes as graphNodes,
  edges as graphEdges,
  type NodeType,
  type EdgeType,
} from "@/lib/graph-data";
import { Search, X, ChevronLeft, ChevronRight, RotateCcw, Maximize2 } from "lucide-react";

// ── Precomputed lookups ──────────────────────────────────────────────────────

const graphNodeMap = new Map(graphNodes.map((n) => [n.id, n]));
const PROCESS_IDS = graphNodes.filter((n) => n.type === "process").map((n) => n.id);

const adjacency = new Map<string, Set<string>>();
for (const e of graphEdges) {
  if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
  if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
  adjacency.get(e.source)!.add(e.target);
  adjacency.get(e.target)!.add(e.source);
}

const degree = new Map<string, number>();
for (const n of graphNodes) {
  degree.set(n.id, adjacency.get(n.id)?.size || 0);
}

function topKNeighbors(nodeId: string, k: number, exclude: Set<string>): string[] {
  const neighbors = adjacency.get(nodeId) || new Set<string>();
  return [...neighbors]
    .filter((id) => !exclude.has(id))
    .sort((a, b) => (degree.get(b) || 0) - (degree.get(a) || 0))
    .slice(0, k);
}

function getEdgesInSet(ids: Set<string>) {
  return graphEdges.filter((e) => ids.has(e.source) && ids.has(e.target));
}

// ── Colors ───────────────────────────────────────────────────────────────────

const NODE_COLORS: Record<NodeType, { border: string; bg: string; bgDark: string; fill: string; fillDark: string }> = {
  process:     { border: "#3b82f6", bg: "#eff6ff", bgDark: "#1e3a5f", fill: "#3b82f6", fillDark: "#2563eb" },
  polarity:    { border: "#f59e0b", bg: "#fffbeb", bgDark: "#4a3728", fill: "#f59e0b", fillDark: "#d97706" },
  voltage:     { border: "#8b5cf6", bg: "#f5f3ff", bgDark: "#3b2d5e", fill: "#8b5cf6", fillDark: "#7c3aed" },
  material:    { border: "#10b981", bg: "#ecfdf5", bgDark: "#1a3a2e", fill: "#10b981", fillDark: "#059669" },
  gas:         { border: "#06b6d4", bg: "#ecfeff", bgDark: "#1a3545", fill: "#06b6d4", fillDark: "#0891b2" },
  duty_cycle:  { border: "#ec4899", bg: "#fdf2f8", bgDark: "#4a2035", fill: "#ec4899", fillDark: "#db2777" },
  defect:      { border: "#ef4444", bg: "#fef2f2", bgDark: "#4a2020", fill: "#ef4444", fillDark: "#dc2626" },
  problem:     { border: "#f97316", bg: "#fff7ed", bgDark: "#4a3020", fill: "#f97316", fillDark: "#ea580c" },
  setup_phase: { border: "#6366f1", bg: "#eef2ff", bgDark: "#2d2d5e", fill: "#6366f1", fillDark: "#4f46e5" },
  image:       { border: "#71717a", bg: "#f4f4f5", bgDark: "#2a2a2e", fill: "#71717a", fillDark: "#52525b" },
};

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  process: "Process", polarity: "Polarity", voltage: "Voltage",
  material: "Material", gas: "Gas", duty_cycle: "Duty Cycle",
  defect: "Defect", problem: "Problem", setup_phase: "Setup Phase", image: "Image",
};
const NODE_TYPE_COUNTS: Record<string, number> = {};
for (const n of graphNodes) NODE_TYPE_COUNTS[n.type] = (NODE_TYPE_COUNTS[n.type] || 0) + 1;

// ── Edge labels ──────────────────────────────────────────────────────────────

const EDGE_LABEL_MAP: Record<EdgeType, string> = {
  uses_polarity: "uses polarity",
  has_problem: "can have",
  welds_material: "welds",
  has_duty_cycle: "rated for",
  requires_gas: "requires",
  supports_voltage: "supports",
  applies_to: "applies to",
  has_setup_phase: "setup step",
  depicted_in: "shown in",
  related_to: "related to",
  causes: "causes",
  fixed_by: "fixed by",
};

// ── Label truncation ─────────────────────────────────────────────────────────

function truncateLabel(label: string, max = 25): string {
  const clean = label.replace(/\s+/g, " ").replace(/\n/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 3).trimEnd() + "\u2026";
}

// ── Default positions ────────────────────────────────────────────────────────

const CORE_POSITIONS: Record<string, { x: number; y: number }> = {
  "process:flux_cored": { x: -600, y: -300 },
  "process:mig":        { x: -200, y: -300 },
  "process:tig":        { x: 200, y: -300 },
  "process:stick":      { x: 600, y: -300 },
};

const processIdSet = new Set(PROCESS_IDS);
const defaultSatelliteMap = new Map<string, string[]>();
const allDefaultSatelliteIds = new Set<string>();
const satelliteParentMap = new Map<string, string[]>();

// K=7 per core → ~18 unique default nodes
const SAT_K = 7;

for (const pid of PROCESS_IDS) {
  const top = topKNeighbors(pid, SAT_K, processIdSet);
  defaultSatelliteMap.set(pid, top);
  for (const sid of top) {
    allDefaultSatelliteIds.add(sid);
    if (!satelliteParentMap.has(sid)) satelliteParentMap.set(sid, []);
    satelliteParentMap.get(sid)!.push(pid);
  }
}

// Fan layout: 7 angles in a 180° arc below core
const SAT_RADIUS = 160;
const SAT_ARC_OFFSET = 220;
const SAT_ANGLES_7 = [195, 217.5, 240, 270, 300, 322.5, 345].map((d) => (d * Math.PI) / 180);
const SAT_ANGLES_5 = [200, 235, 270, 305, 340].map((d) => (d * Math.PI) / 180);

const defaultPositions = new Map<string, { x: number; y: number }>();
for (const [id, pos] of Object.entries(CORE_POSITIONS)) {
  defaultPositions.set(id, pos);
}

const positionedSatellites = new Set<string>();
for (const pid of PROCESS_IDS) {
  const sats = defaultSatelliteMap.get(pid) || [];
  const corePos = CORE_POSITIONS[pid];
  const centerX = corePos.x;
  const centerY = corePos.y + SAT_ARC_OFFSET;
  let slotIdx = 0;

  for (const sid of sats) {
    if (positionedSatellites.has(sid)) continue;
    positionedSatellites.add(sid);

    const parents = satelliteParentMap.get(sid) || [pid];
    if (parents.length >= 2) {
      let sx = 0, sy = 0;
      for (const p of parents) {
        sx += CORE_POSITIONS[p].x;
        sy += CORE_POSITIONS[p].y;
      }
      defaultPositions.set(sid, {
        x: sx / parents.length,
        y: sy / parents.length + SAT_ARC_OFFSET + SAT_RADIUS * 0.3,
      });
    } else {
      const angles = SAT_ANGLES_7;
      const angle = angles[slotIdx % angles.length];
      defaultPositions.set(sid, {
        x: centerX + SAT_RADIUS * Math.cos(angle),
        y: centerY + SAT_RADIUS * Math.sin(angle),
      });
      slotIdx++;
    }
  }
}

const DEFAULT_VISIBLE = new Set<string>([...PROCESS_IDS, ...allDefaultSatelliteIds]);

// ── D3-force layout for show-all ─────────────────────────────────────────────

function computeForceLayout(nodeIds: string[], edgeList: { source: string; target: string }[]): Map<string, { x: number; y: number }> {
  const simNodes = nodeIds.map((id) => ({ id, x: (Math.random() - 0.5) * 1200, y: (Math.random() - 0.5) * 1200 }));
  const nodeIndex = new Map(simNodes.map((n, i) => [n.id, i]));
  const simLinks = edgeList
    .filter((e) => nodeIndex.has(e.source) && nodeIndex.has(e.target))
    .map((e) => ({ source: nodeIndex.get(e.source)!, target: nodeIndex.get(e.target)! }));

  const sim = d3.forceSimulation(simNodes)
    .force("link", d3.forceLink(simLinks).distance(120).strength(0.3))
    .force("charge", d3.forceManyBody().strength(-250))
    .force("center", d3.forceCenter(0, 0))
    .force("collision", d3.forceCollide(60))
    .stop();

  for (let i = 0; i < 200; i++) sim.tick();

  const result = new Map<string, { x: number; y: number }>();
  for (const n of simNodes) result.set(n.id, { x: n.x!, y: n.y! });
  return result;
}

// ── Graph component ──────────────────────────────────────────────────────────

function KnowledgeGraph() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { fitView } = useReactFlow();

  // Active path: chain of node IDs
  const [activePath, setActivePath] = useState<string[]>([]);
  const [showAllMode, setShowAllMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [filterTypes, setFilterTypes] = useState<Set<NodeType>>(
    new Set(Object.keys(NODE_COLORS) as NodeType[])
  );
  const [pulsingNode, setPulsingNode] = useState<string | null>(null);

  // Extra positions for expanded children
  const extraPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const forcePositions = useRef<Map<string, { x: number; y: number }> | null>(null);

  // Compute the "activeSet" — nodes that stay bright
  const { activeSet, revealedChildren } = useMemo(() => {
    if (activePath.length === 0) {
      return { activeSet: new Set<string>(), revealedChildren: new Set<string>() };
    }

    const active = new Set<string>(activePath);
    const revealed = new Set<string>();

    // Last node in path reveals its top-5 unseen children
    const lastNode = activePath[activePath.length - 1];
    const alreadyVisible = new Set([...DEFAULT_VISIBLE, ...extraPositions.current.keys()]);
    const children = topKNeighbors(lastNode, 5, alreadyVisible);

    // Also include the default satellites of the last node if it's a core
    if (processIdSet.has(lastNode)) {
      const sats = defaultSatelliteMap.get(lastNode) || [];
      for (const sid of sats) {
        active.add(sid);
      }
    }

    for (const cid of children) {
      active.add(cid);
      revealed.add(cid);
    }

    return { activeSet: active, revealedChildren: revealed };
  }, [activePath]);

  // Compute visible node set
  const visibleNodeIds = useMemo(() => {
    if (showAllMode) return new Set(graphNodes.map((n) => n.id));
    const visible = new Set(DEFAULT_VISIBLE);
    for (const id of revealedChildren) visible.add(id);
    return visible;
  }, [revealedChildren, showAllMode]);

  // Apply type filters
  const filteredNodeIds = useMemo(() => {
    const f = new Set<string>();
    for (const id of visibleNodeIds) {
      const n = graphNodeMap.get(id);
      if (n && filterTypes.has(n.type)) f.add(id);
    }
    return f;
  }, [visibleNodeIds, filterTypes]);

  // Search
  const searchMatches = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      graphNodes
        .filter((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
        .map((n) => n.id)
    );
  }, [searchQuery]);

  // Compute positions for revealed children
  useEffect(() => {
    if (activePath.length === 0) return;
    const lastNode = activePath[activePath.length - 1];
    const parentPos = defaultPositions.get(lastNode) || extraPositions.current.get(lastNode);
    if (!parentPos) return;

    const alreadyVisible = new Set([...DEFAULT_VISIBLE, ...extraPositions.current.keys()]);
    const children = topKNeighbors(lastNode, 5, alreadyVisible);
    const newChildren = children.filter((c) => !defaultPositions.has(c) && !extraPositions.current.has(c));

    const radius = 130;
    for (let i = 0; i < newChildren.length; i++) {
      const angle = SAT_ANGLES_5[i % SAT_ANGLES_5.length];
      extraPositions.current.set(newChildren[i], {
        x: parentPos.x + radius * Math.cos(angle),
        y: parentPos.y + radius * Math.sin(angle),
      });
    }
  }, [activePath]);

  // Force layout for show-all
  useEffect(() => {
    if (showAllMode && !forcePositions.current) {
      const allIds = graphNodes.map((n) => n.id);
      const allEdges = graphEdges.map((e) => ({ source: e.source, target: e.target }));
      forcePositions.current = computeForceLayout(allIds, allEdges);
    }
  }, [showAllMode]);

  const getPosition = useCallback((id: string): { x: number; y: number } => {
    if (showAllMode && forcePositions.current) {
      return forcePositions.current.get(id) || { x: 0, y: 0 };
    }
    return defaultPositions.get(id) || extraPositions.current.get(id) || { x: 0, y: 0 };
  }, [showAllMode]);

  // Is path active (dimming mode)?
  const isPathActive = activePath.length > 0;

  // Build react-flow nodes
  const rfNodes = useMemo((): Node[] => {
    const result: Node[] = [];
    for (const id of filteredNodeIds) {
      const gn = graphNodeMap.get(id);
      if (!gn) continue;
      const colors = NODE_COLORS[gn.type];
      const isCore = processIdSet.has(id);
      const isDefaultSat = allDefaultSatelliteIds.has(id);
      const isExpandedChild = !isCore && !isDefaultSat;
      const isSearchMatch = searchMatches.has(id);
      const pos = getPosition(id);
      const isOnActivePath = isPathActive && activeSet.has(id);
      const isDimmed = isPathActive && !activeSet.has(id);
      const isPulsing = pulsingNode === id;

      let style: React.CSSProperties;
      if (isCore) {
        style = {
          background: isDark ? colors.fillDark : colors.fill,
          color: "#ffffff",
          border: "none",
          borderRadius: "9999px",
          padding: "12px 24px",
          fontSize: "16px",
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: `0 4px 12px ${colors.fill}44, 0 0 0 4px ${colors.fill}30`,
        };
      } else if (isExpandedChild && !showAllMode) {
        style = {
          background: isDark ? `${colors.border}18` : `${colors.border}15`,
          color: isDark ? "#e4e4e7" : "#18181b",
          border: `1.5px solid ${colors.border}`,
          borderRadius: "9999px",
          padding: "6px 12px",
          fontSize: "11px",
          fontWeight: 500,
          cursor: "pointer",
        };
      } else {
        style = {
          background: isDark ? `${colors.border}20` : `${colors.border}18`,
          color: isDark ? "#e4e4e7" : "#18181b",
          border: `2px solid ${colors.border}`,
          borderRadius: "9999px",
          padding: "8px 16px",
          fontSize: "13px",
          fontWeight: 500,
          cursor: "pointer",
        };
      }

      // Dimming
      if (isDimmed) {
        style.opacity = 0.15;
      } else if (isOnActivePath && !isCore) {
        style.boxShadow = `0 0 0 3px ${colors.border}55, 0 0 8px ${colors.border}22`;
      }

      // Pulse animation
      if (isPulsing) {
        style.transform = "scale(1.08)";
        style.transition = "transform 0.1s ease-out";
      }

      // Search highlight
      if (isSearchMatch) {
        style.boxShadow = `0 0 0 3px #eab308aa`;
        style.border = `2px solid #eab308`;
      }

      const displayLabel = truncateLabel(gn.label);

      result.push({
        id,
        position: pos,
        data: { label: displayLabel, fullLabel: gn.label },
        type: "default",
        sourcePosition: isCore ? Position.Bottom : Position.Bottom,
        targetPosition: isCore ? Position.Bottom : Position.Top,
        style,
      } as Node);
    }
    return result;
  }, [filteredNodeIds, activeSet, isPathActive, searchMatches, isDark, showAllMode, getPosition, pulsingNode]);

  // Build edges
  const rfEdges = useMemo((): Edge[] => {
    const edgesInView = getEdgesInSet(filteredNodeIds);
    const result: Edge[] = [];
    for (const ge of edgesInView) {
      if (!showAllMode) {
        const srcIsCore = processIdSet.has(ge.source);
        const tgtIsCore = processIdSet.has(ge.target);
        const srcIsDefaultSat = allDefaultSatelliteIds.has(ge.source);
        const tgtIsDefaultSat = allDefaultSatelliteIds.has(ge.target);
        const srcOnPath = activeSet.has(ge.source);
        const tgtOnPath = activeSet.has(ge.target);
        const coreToSat = (srcIsCore && tgtIsDefaultSat) || (tgtIsCore && srcIsDefaultSat);
        const coreToCore = srcIsCore && tgtIsCore;
        const pathEdge = srcOnPath && tgtOnPath;
        if (!coreToSat && !coreToCore && !pathEdge) continue;
      }

      const sourceNode = graphNodeMap.get(ge.source);
      const clr = sourceNode ? NODE_COLORS[sourceNode.type].border : "#71717a";
      const humanLabel = EDGE_LABEL_MAP[ge.type] || ge.type;

      // Determine if this edge is on the active path
      const bothOnPath = isPathActive && activeSet.has(ge.source) && activeSet.has(ge.target);
      const isDimmedEdge = isPathActive && !bothOnPath;

      let strokeOpacity: string;
      let strokeWidth: number;
      if (isDimmedEdge) {
        strokeOpacity = "14"; // ~8%
        strokeWidth = 1;
      } else if (bothOnPath) {
        strokeOpacity = "e6"; // ~90%
        strokeWidth = 2;
      } else {
        strokeOpacity = "80"; // ~50%
        strokeWidth = 1.5;
      }

      const edgeStyle: React.CSSProperties = {
        stroke: `${clr}${strokeOpacity}`,
        strokeWidth,
      };

      // Marching ants on active-path edges
      if (bothOnPath) {
        edgeStyle.strokeDasharray = "6 3";
        edgeStyle.animation = "marching-ants 0.8s linear infinite";
      }

      result.push({
        id: `${ge.source}\u2192${ge.target}\u2192${ge.type}`,
        source: ge.source,
        target: ge.target,
        type: "smoothstep",
        label: isDimmedEdge ? undefined : humanLabel,
        labelStyle: {
          fontSize: 9,
          fontFamily: "var(--font-geist-mono), monospace",
          fill: isDark ? "#a1a1aa" : "#71717a",
        },
        labelBgStyle: {
          fill: isDark ? "#18181b" : "#ffffff",
          fillOpacity: 0.95,
          stroke: isDark ? "#3f3f46" : "#e4e4e7",
          strokeWidth: 1,
          rx: 4,
          ry: 4,
        },
        labelBgPadding: [4, 2] as [number, number],
        style: edgeStyle,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: `${clr}${strokeOpacity}`,
          width: 10,
          height: 10,
        },
      });
    }
    return result;
  }, [filteredNodeIds, activeSet, isPathActive, isDark, showAllMode]);

  // Sync react-flow state
  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  const prevKey = useRef("");
  useEffect(() => {
    const key = rfNodes.map((n) => n.id).sort().join(",") + "|" + rfEdges.length + "|" + (isDark ? "d" : "l") + "|" + activePath.join(",");
    const structureChanged = key !== prevKey.current;
    prevKey.current = key;
    setNodes(rfNodes);
    setEdges(rfEdges);
    if (structureChanged) {
      setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 60);
    }
  }, [rfNodes, rfEdges, setNodes, setEdges, fitView, isDark, activePath]);

  // Click handler — focus-and-dim chain
  const onNodeClick: NodeMouseHandler = useCallback((_ev, node) => {
    const id = node.id;

    setActivePath((prev) => {
      // If clicking the last node in path → collapse (shorten by one)
      if (prev.length > 0 && prev[prev.length - 1] === id) {
        const shortened = prev.slice(0, -1);
        // Clean up extra positions for removed children
        return shortened;
      }

      // If the node is a neighbor of the last path node → extend
      if (prev.length > 0) {
        const lastNode = prev[prev.length - 1];
        const neighbors = adjacency.get(lastNode) || new Set<string>();
        if (neighbors.has(id)) {
          // Trigger pulse
          setPulsingNode(id);
          setTimeout(() => setPulsingNode(null), 200);
          return [...prev, id];
        }
      }

      // Otherwise start a new path from this node
      setPulsingNode(id);
      setTimeout(() => setPulsingNode(null), 200);
      return [id];
    });
  }, []);

  // Click background → clear path
  const onPaneClick = useCallback(() => {
    if (activePath.length > 0) {
      setActivePath([]);
      extraPositions.current = new Map();
    }
  }, [activePath]);

  const handleReset = useCallback(() => {
    setActivePath([]);
    setShowAllMode(false);
    setSearchQuery("");
    extraPositions.current = new Map();
    forcePositions.current = null;
    setTimeout(() => fitView({ padding: 0.2, duration: 400 }), 50);
  }, [fitView]);

  const handleShowAll = useCallback(() => {
    setShowAllMode(true);
    setActivePath([]);
    setTimeout(() => fitView({ padding: 0.08, duration: 500 }), 300);
  }, [fitView]);

  const toggleFilter = (type: NodeType) => {
    setFilterTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size <= 1) return prev;
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Path breadcrumb labels
  const pathLabels = useMemo(() => {
    return activePath.map((id) => {
      const n = graphNodeMap.get(id);
      return n ? truncateLabel(n.label, 18) : id;
    });
  }, [activePath]);

  return (
    <div className="flex flex-col h-screen">
      {/* Marching ants CSS */}
      <style>{`
        @keyframes marching-ants {
          to { stroke-dashoffset: -18; }
        }
      `}</style>

      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5 bg-background z-20">
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-foreground tracking-tight">
            OmniPro 220 — Knowledge Graph
          </h1>
          <p className="text-[11px] text-muted-foreground truncate">
            {graphNodes.length} nodes &middot; {graphEdges.length} edges &middot; click any node to explore
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RotateCcw size={12} /> Reset
          </button>
          <button onClick={handleShowAll}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Maximize2 size={12} /> Show all
          </button>
          <Link href="/"
            className="rounded-md border border-border px-2.5 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
            Back to chat
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left sidebar */}
        <div className={`border-r border-border bg-background z-10 flex flex-col transition-all duration-200 ${leftSidebarOpen ? "w-[280px]" : "w-0"} overflow-hidden`}>
          <div className="flex-shrink-0 p-3 border-b border-border">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search nodes..."
                className="w-full rounded-md border border-border bg-card pl-8 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring" />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X size={12} />
                </button>
              )}
            </div>
            {searchMatches.size > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {searchMatches.size} match{searchMatches.size !== 1 ? "es" : ""}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div>
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
                Legend &amp; Filters
              </p>
              {(Object.keys(NODE_COLORS) as NodeType[]).map((type) => (
                <label key={type} className="flex items-center gap-2 py-1 cursor-pointer group">
                  <input type="checkbox" checked={filterTypes.has(type)}
                    onChange={() => toggleFilter(type)}
                    className="rounded border-border accent-primary w-3 h-3" />
                  <span className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: NODE_COLORS[type].border }} />
                  <span className="text-xs text-foreground group-hover:text-foreground/80">
                    {NODE_TYPE_LABELS[type]}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {NODE_TYPE_COUNTS[type] || 0}
                  </span>
                </label>
              ))}
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">Stats</p>
              <p className="text-xs text-muted-foreground">Visible: {filteredNodeIds.size} nodes</p>
              <p className="text-xs text-muted-foreground">Path depth: {activePath.length}</p>
            </div>
          </div>
        </div>

        {/* Sidebar toggle */}
        <button onClick={() => setLeftSidebarOpen((v) => !v)}
          className="absolute top-2 z-20 rounded-r-md border border-l-0 border-border bg-background p-1 text-muted-foreground hover:text-foreground transition-all"
          style={{ left: leftSidebarOpen ? 280 : 0 }}>
          {leftSidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Canvas */}
        <div className="flex-1 relative">
          {activePath.length === 0 && !showAllMode && (
            <div className="absolute inset-0 flex items-end justify-center z-10 pointer-events-none pb-8">
              <p className="text-sm text-muted-foreground/50 bg-background/80 px-4 py-2 rounded-full border border-border/40">
                Click any node to start exploring
              </p>
            </div>
          )}

          {/* Breadcrumb path pill */}
          {activePath.length > 0 && (
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1 bg-background/90 border border-border rounded-full px-3 py-1.5 shadow-sm">
              <span className="text-[10px] font-mono text-muted-foreground mr-1">Path:</span>
              {pathLabels.map((label, i) => (
                <span key={activePath[i]} className="flex items-center gap-1">
                  {i > 0 && <span className="text-[10px] text-muted-foreground">&rarr;</span>}
                  <span className="text-xs font-mono text-foreground">{label}</span>
                </span>
              ))}
            </div>
          )}

          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView fitViewOptions={{ padding: 0.2 }}
            minZoom={0.03} maxZoom={3}
            proOptions={{ hideAttribution: true }}
            colorMode={isDark ? "dark" : "light"}>
            <Background variant={"dots" as any} gap={20} size={1.5}
              color={isDark ? "#3f3f46" : "#d4d4d8"} />
            <Controls position="bottom-right" showInteractive={false}
              style={{ borderRadius: 8, border: `1px solid ${isDark ? "#3f3f46" : "#e4e4e7"}`, background: isDark ? "#18181b" : "#ffffff" }} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

// ── Page wrapper ─────────────────────────────────────────────────────────────

export default function GraphPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-sm text-muted-foreground animate-pulse">Loading knowledge graph...</div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <KnowledgeGraph />
    </ReactFlowProvider>
  );
}
