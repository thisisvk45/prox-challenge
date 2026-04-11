"use client";

import { useState } from "react";
import { X } from "lucide-react";

type ManualImageProps = {
  url: string;
  caption?: string;
  page?: string;
};

export function ManualImage({ url, caption, page }: ManualImageProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <figure className="my-3 group cursor-pointer" onClick={() => setOpen(true)}>
        <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
          <img
            src={url}
            alt={caption || "Manual page"}
            loading="lazy"
            className="w-full max-h-80 object-contain transition-transform duration-200 group-hover:scale-[1.01]"
          />
        </div>
        {(caption || page) && (
          <figcaption className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground font-mono">
            {page && <span>p.{page}</span>}
            {page && caption && <span>--</span>}
            {caption && <span>{caption}</span>}
          </figcaption>
        )}
      </figure>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={24} />
          </button>
          <img
            src={url}
            alt={caption || "Manual page"}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
