"use client";

import { useState, useRef } from "react";
import { Badge } from "../ui/badge";
import { Camera, X as XIcon } from "lucide-react";

type Annotation = {
  id: number;
  label: string;
  x_percent: number;
  y_percent: number;
  description: string;
  manual_page: number;
  manual_image_url?: string;
};

type Props = {
  user_image_url: string;
  view_type: string;
  annotations: Annotation[];
};

const VIEW_LABELS: Record<string, string> = {
  front_panel: "Front Panel",
  interior: "Interior",
  wire_feed: "Wire Feed",
  back_panel: "Back Panel",
  general: "General",
};

export function MachinePhotoAnnotation({
  user_image_url,
  view_type,
  annotations,
}: Props) {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [tooltipId, setTooltipId] = useState<number | null>(null);
  const [manualModal, setManualModal] = useState<Annotation | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function handlePinClick(ann: Annotation) {
    if (ann.manual_image_url) {
      setManualModal(ann);
    }
    setTooltipId(tooltipId === ann.id ? null : ann.id);
  }

  function handleLegendClick(ann: Annotation) {
    if (ann.manual_image_url) {
      setManualModal(ann);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <Camera size={14} className="text-blue-400" />
        <span className="text-xs font-semibold text-foreground">Machine Annotation</span>
        <Badge variant="outline" className="ml-auto text-[10px] font-mono">
          {VIEW_LABELS[view_type] || view_type}
        </Badge>
        <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
          {annotations.length} parts
        </Badge>
      </div>

      {/* Photo with pins */}
      <div ref={containerRef} className="relative w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={user_image_url}
          alt="Uploaded machine photo"
          className="w-full h-auto block"
        />

        {/* Pin overlays */}
        {annotations.map((ann) => {
          const isActive = hoveredId === ann.id || tooltipId === ann.id;

          return (
            <div
              key={ann.id}
              className="absolute"
              style={{
                left: `${ann.x_percent}%`,
                top: `${ann.y_percent}%`,
                transform: "translate(-50%, -50%)",
                zIndex: isActive ? 20 : 10,
              }}
            >
              {/* Pin */}
              <button
                onClick={() => handlePinClick(ann)}
                onMouseEnter={() => setHoveredId(ann.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`
                  flex items-center justify-center
                  w-7 h-7 rounded-full
                  text-[11px] font-bold
                  border-2 shadow-md
                  transition-all duration-150 ease-out
                  animate-pin-in
                  ${isActive
                    ? "bg-primary text-primary-foreground border-primary scale-[1.15] shadow-lg shadow-primary/30"
                    : "bg-white text-gray-800 border-blue-500/80 hover:scale-110"
                  }
                `}
                style={{ animationDelay: `${ann.id * 60}ms` }}
              >
                {ann.id}
              </button>

              {/* Tooltip */}
              {isActive && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 pointer-events-none"
                  style={{ zIndex: 30 }}
                >
                  <div className="rounded-lg px-3 py-2 shadow-lg max-w-[240px] whitespace-normal bg-white/90 dark:bg-gray-900/90 backdrop-blur-[10px] border border-border">
                    <p className="text-[11px] font-semibold text-gray-900 dark:text-white leading-tight">
                      {ann.label}
                    </p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-300 mt-0.5 leading-snug">
                      {ann.description}
                    </p>
                    {ann.manual_page && (
                      <p className="text-[9px] text-blue-500 font-mono mt-1">
                        Manual p.{ann.manual_page}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="border-t border-border px-4 py-3">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
          Identified Components
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {annotations.map((ann) => {
            const isActive = hoveredId === ann.id;
            return (
              <div
                key={ann.id}
                onMouseEnter={() => setHoveredId(ann.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => handleLegendClick(ann)}
                className={`
                  flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors cursor-pointer
                  ${isActive
                    ? "bg-primary/10 ring-1 ring-primary/30"
                    : "hover:bg-muted/50"
                  }
                `}
              >
                <span
                  className={`
                    flex items-center justify-center flex-shrink-0
                    w-5 h-5 rounded-full text-[9px] font-bold border
                    transition-colors
                    ${isActive
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-blue-500/60"
                    }
                  `}
                >
                  {ann.id}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground leading-tight truncate">
                    {ann.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                    {ann.description}
                  </p>
                  {ann.manual_image_url && (
                    <p className="text-[9px] text-blue-500 font-mono mt-0.5">
                      p.{ann.manual_page} — click for manual
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual page modal */}
      {manualModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setManualModal(null)}
        >
          <div
            className="relative max-w-2xl w-full mx-4 rounded-xl border border-border bg-card overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
              <div>
                <p className="text-xs font-semibold text-foreground">{manualModal.label}</p>
                <p className="text-[10px] text-muted-foreground font-mono">
                  From manual page {manualModal.manual_page}
                </p>
              </div>
              <button
                onClick={() => setManualModal(null)}
                className="text-muted-foreground hover:text-foreground p-1"
              >
                <XIcon size={16} />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={manualModal.manual_image_url}
              alt={`Manual page ${manualModal.manual_page}`}
              className="w-full h-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
