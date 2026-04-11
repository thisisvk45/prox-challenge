"use client";

import { Badge } from "@/components/ui/badge";

type Process = "MIG" | "Flux-Cored" | "TIG" | "Stick";

type SocketConfig = {
  positive: string;
  negative: string;
  mig_gun: string | null;
  polarity: "DCEP" | "DCEN";
  polarity_label: string;
};

const SOCKET_MAP: Record<Process, SocketConfig> = {
  MIG: {
    positive: "Wire Feed Power Cable",
    negative: "Ground Clamp",
    mig_gun: "MIG Gun Cable",
    polarity: "DCEP",
    polarity_label: "Direct Current Electrode Positive (Reverse Polarity)",
  },
  "Flux-Cored": {
    positive: "Ground Clamp",
    negative: "Wire Feed Power Cable",
    mig_gun: "MIG Gun Cable",
    polarity: "DCEN",
    polarity_label: "Direct Current Electrode Negative (Straight Polarity)",
  },
  TIG: {
    positive: "Ground Clamp",
    negative: "TIG Torch",
    mig_gun: null,
    polarity: "DCEN",
    polarity_label: "Direct Current Electrode Negative (Straight Polarity)",
  },
  Stick: {
    positive: "Electrode Holder",
    negative: "Ground Clamp",
    mig_gun: null,
    polarity: "DCEP",
    polarity_label: "Direct Current Electrode Positive (Reverse Polarity)",
  },
};

export function FrontPanelPolarity({ process }: { process: Process }) {
  const config = SOCKET_MAP[process] || SOCKET_MAP["MIG"];

  const activeColor = "#22c55e";

  return (
    <div className="animate-message-in">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            {process} Cable Setup
          </h3>
          <Badge variant="outline" className="font-mono text-xs">
            Interactive
          </Badge>
        </div>

        <svg viewBox="0 0 480 220" className="w-full panel-svg" xmlns="http://www.w3.org/2000/svg">
          {/* Main chassis */}
          <rect x="20" y="20" width="440" height="180" rx="8" className="panel-chassis" strokeWidth="1.5" />
          <text x="240" y="14" textAnchor="middle" className="panel-label" fontSize="10" fontFamily="monospace">
            VULCAN OmniPro 220 — Front Panel
          </text>

          {/* Power switch */}
          <rect x="40" y="50" width="30" height="20" rx="4" className="panel-knob" strokeWidth="1" />
          <circle cx="55" cy="60" r="3" fill="#ef4444" />
          <text x="55" y="85" textAnchor="middle" className="panel-label" fontSize="7" fontFamily="monospace">
            POWER
          </text>

          {/* LCD Display */}
          <rect x="90" y="40" width="100" height="55" rx="4" className="panel-lcd" strokeWidth="1" />
          <text x="140" y="65" textAnchor="middle" className="panel-lcd-text" fontSize="9" fontFamily="monospace">
            {process}
          </text>
          <text x="140" y="78" textAnchor="middle" className="panel-lcd-text" fontSize="7" fontFamily="monospace">
            READY
          </text>
          <text x="140" y="108" textAnchor="middle" className="panel-label" fontSize="7" fontFamily="monospace">
            LCD DISPLAY
          </text>

          {/* Three knobs */}
          {[215, 250, 285].map((cx, i) => (
            <g key={i}>
              <circle cx={cx} cy="60" r="14" className="panel-knob" strokeWidth="1" />
              <circle cx={cx} cy="60" r="2" className="panel-knob-dot" />
              <text x={cx} y="85" textAnchor="middle" className="panel-label" fontSize="6" fontFamily="monospace">
                {["CONTROL", "LEFT", "RIGHT"][i]}
              </text>
            </g>
          ))}

          {/* Positive Socket (+) */}
          <g>
            <circle cx="340" cy="60" r="18" className="panel-socket-bg" stroke={activeColor} strokeWidth="2.5">
              <animate attributeName="stroke-opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <text x="340" y="64" textAnchor="middle" fill={activeColor} fontSize="16" fontWeight="bold" fontFamily="monospace">
              +
            </text>
            <text x="340" y="90" textAnchor="middle" className="panel-label" fontSize="6" fontFamily="monospace">
              POSITIVE
            </text>
            {/* Connection label */}
            <rect x="310" y="96" width="60" height="16" rx="3" fill={activeColor + "22"} stroke={activeColor} strokeWidth="0.5" />
            <text x="340" y="107" textAnchor="middle" fill={activeColor} fontSize="6" fontWeight="bold" fontFamily="monospace">
              {config.positive}
            </text>
          </g>

          {/* Negative Socket (-) */}
          <g>
            <circle cx="400" cy="60" r="18" className="panel-socket-bg" stroke={activeColor} strokeWidth="2.5">
              <animate attributeName="stroke-opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <text x="400" y="64" textAnchor="middle" fill={activeColor} fontSize="16" fontWeight="bold" fontFamily="monospace">
              -
            </text>
            <text x="400" y="90" textAnchor="middle" className="panel-label" fontSize="6" fontFamily="monospace">
              NEGATIVE
            </text>
            {/* Connection label */}
            <rect x="370" y="96" width="60" height="16" rx="3" fill={activeColor + "22"} stroke={activeColor} strokeWidth="0.5" />
            <text x="400" y="107" textAnchor="middle" fill={activeColor} fontSize="6" fontWeight="bold" fontFamily="monospace">
              {config.negative}
            </text>
          </g>

          {/* MIG Gun Socket */}
          <g>
            <circle
              cx="440" cy="150" r="14"
              className={config.mig_gun ? "panel-socket-bg" : "panel-inactive-socket"}
              stroke={config.mig_gun ? activeColor : undefined}
              strokeWidth={config.mig_gun ? "2" : "1"}
            >
              {config.mig_gun && (
                <animate attributeName="stroke-opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
              )}
            </circle>
            <text x="440" y="154" textAnchor="middle" fill={config.mig_gun ? activeColor : undefined} className={config.mig_gun ? undefined : "panel-dim-text"} fontSize="8" fontFamily="monospace">
              GUN
            </text>
            <text x="440" y="175" textAnchor="middle" className="panel-label" fontSize="6" fontFamily="monospace">
              MIG GUN
            </text>
            {config.mig_gun && (
              <>
                <rect x="405" y="180" width="70" height="14" rx="3" fill={activeColor + "22"} stroke={activeColor} strokeWidth="0.5" />
                <text x="440" y="190" textAnchor="middle" fill={activeColor} fontSize="6" fontWeight="bold" fontFamily="monospace">
                  {config.mig_gun}
                </text>
              </>
            )}
          </g>

          {/* Polarity label at bottom */}
          <rect x="40" y="140" width="360" height="45" rx="6" className="panel-polarity-bar" strokeWidth="0.5" />
          <text x="220" y="158" textAnchor="middle" className="panel-polarity-text" fontSize="11" fontWeight="bold" fontFamily="monospace">
            {config.polarity}
          </text>
          <text x="220" y="174" textAnchor="middle" className="panel-label" fontSize="8" fontFamily="monospace">
            {config.polarity_label}
          </text>
        </svg>
      </div>
    </div>
  );
}
