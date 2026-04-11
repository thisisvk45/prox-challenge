"use client";

import { useState, useMemo, useEffect } from "react";
import { useTheme } from "next-themes";
import { Badge } from "@/components/ui/badge";
import { PieChart, Pie, Cell } from "recharts";

type Process = "MIG" | "TIG" | "Stick";
type Voltage = "120V" | "240V";

// From duty_cycles.json — two rated points per process/voltage
const DUTY_CYCLE_DATA: Record<string, { low: { amp: number; pct: number }; high: { amp: number; pct: number }; min: number; max: number }> = {
  "MIG-120V": { low: { amp: 75, pct: 100 }, high: { amp: 100, pct: 40 }, min: 30, max: 140 },
  "MIG-240V": { low: { amp: 115, pct: 100 }, high: { amp: 200, pct: 25 }, min: 30, max: 220 },
  "TIG-120V": { low: { amp: 90, pct: 100 }, high: { amp: 125, pct: 40 }, min: 10, max: 125 },
  "TIG-240V": { low: { amp: 105, pct: 100 }, high: { amp: 175, pct: 30 }, min: 10, max: 175 },
  "Stick-120V": { low: { amp: 60, pct: 100 }, high: { amp: 80, pct: 40 }, min: 10, max: 80 },
  "Stick-240V": { low: { amp: 100, pct: 100 }, high: { amp: 175, pct: 25 }, min: 10, max: 175 },
};

function interpolateDutyCycle(data: typeof DUTY_CYCLE_DATA[string], amperage: number): number {
  if (amperage <= data.low.amp) return 100;
  if (amperage >= data.high.amp) return data.high.pct;
  // Linear interpolation between the two rated points
  const ratio = (amperage - data.low.amp) / (data.high.amp - data.low.amp);
  return Math.round(100 - ratio * (100 - data.high.pct));
}

export function DutyCycleCalculator({ process, voltage }: { process: Process; voltage: Voltage }) {
  const key = `${process}-${voltage}`;
  const data = DUTY_CYCLE_DATA[key] || DUTY_CYCLE_DATA["MIG-240V"];
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [amperage, setAmperage] = useState(Math.round((data.min + data.max) / 2));
  const restColor = mounted && resolvedTheme === "light" ? "#d4d4d8" : "#3f3f46";

  const dutyCycle = useMemo(() => interpolateDutyCycle(data, amperage), [data, amperage]);
  const weldMinutes = +(dutyCycle / 10).toFixed(1);
  const restMinutes = +(10 - weldMinutes).toFixed(1);
  const safe = dutyCycle >= 100;

  const chartData = [
    { name: "Weld", value: weldMinutes },
    { name: "Rest", value: restMinutes },
  ];

  return (
    <div className="animate-message-in">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">
            Duty Cycle Calculator — {process} {voltage}
          </h3>
          <Badge variant="outline" className="font-mono text-xs">Interactive</Badge>
        </div>

        {/* Amperage slider */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-muted-foreground">Amperage</label>
            <span className="font-mono text-sm text-foreground">{amperage}A</span>
          </div>
          <input
            type="range"
            min={data.min}
            max={data.max}
            value={amperage}
            onChange={(e) => setAmperage(Number(e.target.value))}
            className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground font-mono mt-1">
            <span>{data.min}A</span>
            <span>{data.max}A</span>
          </div>
        </div>

        {/* Results */}
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Duty Cycle:</span>
              <span className="font-mono text-lg font-bold text-foreground">{dutyCycle}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Max Weld Time:</span>
              <span className="font-mono text-sm text-foreground">{weldMinutes} min</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Required Rest:</span>
              <span className="font-mono text-sm text-foreground">{restMinutes} min</span>
            </div>
            <div className="mt-2">
              {safe ? (
                <Badge className="bg-green-500/15 text-green-400 border-green-500/30 hover:bg-green-500/15">
                  CONTINUOUS — No rest needed
                </Badge>
              ) : dutyCycle >= 50 ? (
                <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/15">
                  MODERATE — Monitor temperature
                </Badge>
              ) : (
                <Badge className="bg-red-500/15 text-red-400 border-red-500/30 hover:bg-red-500/15">
                  HIGH LOAD — Rest required
                </Badge>
              )}
            </div>
          </div>

          {/* Donut chart */}
          <div className="flex-shrink-0">
            <PieChart width={100} height={100}>
              <Pie
                data={chartData}
                cx={50}
                cy={50}
                innerRadius={30}
                outerRadius={45}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                stroke="none"
              >
                <Cell fill="#22c55e" />
                <Cell fill={restColor} />
              </Pie>
            </PieChart>
            <div className="text-center text-xs text-muted-foreground font-mono -mt-1">
              <span className="text-green-400">{weldMinutes}m</span> / <span>{restMinutes}m</span>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground border-t border-border pt-3">
          At <span className="font-mono">{amperage}A</span>, you can weld{" "}
          <span className="font-mono">{weldMinutes} minutes</span> out of every 10.
          The machine has thermal protection and will shut down if exceeded.
        </p>
      </div>
    </div>
  );
}
