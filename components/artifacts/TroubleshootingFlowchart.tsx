"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, RotateCcw, CheckCircle2 } from "lucide-react";

type TroubleshootingData = {
  problem: string;
  causes: string[];
  solutions: string[];
};

// From troubleshooting.json — hardcoded lookup
const TROUBLESHOOTING_DB: TroubleshootingData[] = [
  {
    problem: "Wire Feed Motor Runs but Wire Does Not Feed Properly",
    causes: ["Insufficient wire feed pressure", "Incorrect wire feed roller size", "Damaged MIG Gun, cable, or liner assembly", "Feed Tensioner is too tight"],
    solutions: ["Increase wire feed pressure properly (see page 17)", "Flip roll to correct size (see page 12)", "Have a qualified technician inspect and replace as necessary", "Loosen Feed Tensioner — apply only enough pressure to prevent spinning after trigger release"],
  },
  {
    problem: "Wire Creates a Bird's Nest During Operation",
    causes: ["Excess wire feed pressure", "Incorrect Contact Tip size", "Gun Cable Connector not fully inserted", "Damaged liner"],
    solutions: ["Adjust wire feed pressure properly (see page 17)", "Replace with the proper tip for wire used", "Insert Gun Cable Connector properly (see page 13)", "Have a qualified technician inspect and replace liner"],
  },
  {
    problem: "Wire Stops During Welding",
    causes: ["Gun cable is severely bent", "Gun liner is clogged or worn", "Gun liner too small for wire", "Wire tangled on spool", "Wire not contacting Feed Rollers", "Feed Roller crushing flux-cored wire"],
    solutions: ["Straighten Gun cable", "Check gun liner for obstruction, replace if needed", "Verify gun liner matches wire size", "Check wire for cross winding or tangles", "Ensure correct groove for wire diameter", "Adjust Feed Tensioner properly"],
  },
  {
    problem: "Welding Arc Not Stable",
    causes: ["Wire not feeding properly", "Incorrect Contact Tip or liner size", "Incorrect wire feed speed", "Loose connections", "Incorrect polarity for process", "Gas coverage insufficient or too high", "Poor workpiece connection"],
    solutions: ["See wire feed troubleshooting above", "Replace with proper tip/liner for wire", "Adjust wire feed speed for stable arc", "Check all connections are tight", "Ensure DCEP for MIG, DCEN for Flux-Cored", "Set gas flow per Settings Chart (20-30 SCFH)", "Check ground clamp connection"],
  },
  {
    problem: "Porosity in the Weld Metal",
    causes: ["Shielding gas bottle empty", "Gas flow too low or too high", "Dirty workpiece", "Gun too far from workpiece (CTWD)", "Incorrect polarity", "Dirty welding wire"],
    solutions: ["Check gas bottle and refill", "Check regulator for proper flow (20-30 SCFH)", "Clean workpiece to bare metal", "Check CTWD — keep within 1/2 inch", "Verify DCEP for MIG, DCEN for Flux-Cored", "Ensure wire is clean and free of rust"],
  },
  {
    problem: "Wire Feeds but Arc Does Not Ignite",
    causes: ["Improper ground connection", "Wrong Contact Tip size", "Worn Contact Tip", "Dirty Contact Tip"],
    solutions: ["Ensure workpiece is properly grounded and clean near clamp", "Verify Contact Tip matches wire size", "Replace deformed or enlarged Contact Tip", "Clean Contact Tip thoroughly"],
  },
  {
    problem: "Weak Arc Strength",
    causes: ["Incorrect line voltage", "Improper gauge or length of cord", "Not enough current"],
    solutions: ["Check line voltage — have electrician fix if insufficient", "Do not use extension cords — use supplied power cord only", "Increase current setting for metal thickness"],
  },
  {
    problem: "Welder Does Not Function When Switched On",
    causes: ["Tripped thermal protection", "Insufficient input voltage/amperage", "Faulty Trigger connection", "Low/over-voltage protection active", "Incorrect mode selected"],
    solutions: ["Wait with Power ON for welder to cool — reduce weld duration", "Verify circuit supplies required voltage/amperage", "Check gun connection is properly seated", "Check input voltage, press Reset Button on back", "Ensure correct process is selected on LCD"],
  },
  {
    problem: "LCD Display Does Not Light",
    causes: ["Not connected to outlet properly", "Outlet unpowered", "Wrong plug rating", "Circuit breaker tripped", "Power cord not fully seated"],
    solutions: ["Verify voltage at outlet and connection", "Check/reset circuit breaker and GFCI", "Ensure plug has correct rating (see Specifications p.7)", "Press Reset Button on back of machine", "Ensure twist lock Power Cord is fully secured"],
  },
];

function findBestMatch(symptom: string): TroubleshootingData {
  const kw = symptom.toLowerCase();
  let best = TROUBLESHOOTING_DB[0];
  let bestScore = 0;

  for (const entry of TROUBLESHOOTING_DB) {
    let score = 0;
    const words = kw.split(/\s+/);
    for (const word of words) {
      if (word.length < 3) continue;
      if (entry.problem.toLowerCase().includes(word)) score += 3;
      for (const cause of entry.causes) {
        if (cause.toLowerCase().includes(word)) score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best;
}

export function TroubleshootingFlowchart({ initial_symptom }: { initial_symptom: string }) {
  const match = findBestMatch(initial_symptom);
  const maxCauses = Math.min(match.causes.length, 5);
  const [currentCause, setCurrentCause] = useState(-1);
  const [resolved, setResolved] = useState(false);
  const [triedCauses, setTriedCauses] = useState<number[]>([]);

  function handleCauseClick(index: number) {
    setCurrentCause(index);
  }

  function handleNo() {
    setTriedCauses((prev) => [...prev, currentCause]);
    setCurrentCause(-1);
  }

  function handleYes() {
    setResolved(true);
  }

  function handleReset() {
    setCurrentCause(-1);
    setResolved(false);
    setTriedCauses([]);
  }

  const availableCauses = match.causes
    .slice(0, maxCauses)
    .map((cause, i) => ({ cause, solution: match.solutions[i] || "Consult a qualified technician.", index: i }))
    .filter((c) => !triedCauses.includes(c.index));

  return (
    <div className="animate-message-in">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">
            Troubleshooting
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">Interactive</Badge>
            {(triedCauses.length > 0 || resolved) && (
              <button onClick={handleReset} className="text-muted-foreground hover:text-foreground transition-colors">
                <RotateCcw size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Symptom */}
        <div className="rounded-md bg-muted/50 border border-border px-3 py-2 mb-3">
          <p className="text-xs text-muted-foreground">Symptom</p>
          <p className="text-sm font-medium text-foreground">{match.problem}</p>
        </div>

        {resolved ? (
          <div className="flex items-center gap-2 rounded-md bg-green-500/10 border border-green-500/30 px-3 py-3">
            <CheckCircle2 size={16} className="text-green-400" />
            <p className="text-sm text-green-400">Issue resolved. If the problem returns, reset and try other causes.</p>
          </div>
        ) : currentCause === -1 ? (
          <>
            <p className="text-xs text-muted-foreground mb-2">
              {triedCauses.length > 0
                ? `${availableCauses.length} remaining cause${availableCauses.length !== 1 ? "s" : ""} to check:`
                : "Select the most likely cause:"}
            </p>
            <div className="space-y-1.5">
              {availableCauses.map(({ cause, index }) => (
                <button
                  key={index}
                  onClick={() => handleCauseClick(index)}
                  className="w-full flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-left text-sm text-foreground hover:bg-muted/60 transition-colors"
                >
                  <span>{cause}</span>
                  <ChevronRight size={14} className="text-muted-foreground flex-shrink-0" />
                </button>
              ))}
              {availableCauses.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">
                  All common causes checked. If the problem persists, consult a qualified welding technician or contact Vulcan support.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/50 border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Cause</p>
              <p className="text-sm font-medium text-foreground">{match.causes[currentCause]}</p>
            </div>
            <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
              <p className="text-xs text-muted-foreground">Fix</p>
              <p className="text-sm text-foreground">{match.solutions[currentCause]}</p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground mr-2">Did this fix it?</p>
              <button
                onClick={handleYes}
                className="rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/20 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={handleNo}
                className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/60 transition-colors"
              >
                No, try next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
