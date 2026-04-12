"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";

export function SafetyWarning({ level, issues }: { level: "critical" | "caution"; issues: string[] }) {
  if (!issues || issues.length === 0) return null;

  const isCritical = level === "critical";

  return (
    <div
      className={`rounded-lg border-2 p-3 ${
        isCritical
          ? "border-red-500/50 bg-red-500/10"
          : "border-amber-500/40 bg-amber-500/10"
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        {isCritical ? (
          <ShieldAlert size={16} className="text-red-500 flex-shrink-0" />
        ) : (
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
        )}
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${
            isCritical ? "text-red-500" : "text-amber-600 dark:text-amber-400"
          }`}
        >
          {isCritical ? "Safety Warning" : "Caution"}
        </span>
      </div>
      <ul className="space-y-1">
        {issues.map((issue, i) => (
          <li
            key={i}
            className={`text-sm leading-relaxed ${
              isCritical ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"
            }`}
          >
            {issues.length > 1 && <span className="font-mono text-xs mr-1.5 opacity-50">{i + 1}.</span>}
            {issue}
          </li>
        ))}
      </ul>
    </div>
  );
}
