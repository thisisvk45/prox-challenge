"use client";

export type Stats = {
  cost_usd: number;
  elapsed_ms: number;
  tool_call_count: number;
};

export function MessageStats({ stats }: { stats: Stats }) {
  const cost = `$${stats.cost_usd.toFixed(2)}`;
  const latency = `${(stats.elapsed_ms / 1000).toFixed(1)}s`;
  const tools = `${stats.tool_call_count} tool call${stats.tool_call_count !== 1 ? "s" : ""}`;

  return (
    <div className="mt-2 text-xs font-mono text-muted-foreground/40">
      {cost} · {latency} · {tools}
    </div>
  );
}
