"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeUnwrapImages from "rehype-unwrap-images";
import { ManualImage } from "@/components/chat/ManualImage";
import { ArtifactRenderer, type ArtifactPayload } from "@/components/ArtifactRenderer";
import { ArtifactErrorBoundary } from "@/components/ArtifactErrorBoundary";
import { FrontPanelPolarity } from "@/components/artifacts/FrontPanelPolarity";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ReasoningRibbon } from "@/components/chat/ReasoningRibbon";
import { MessageStats, type Stats } from "@/components/chat/MessageStats";
import { Badge } from "@/components/ui/badge";
import { Send, Mic, Square, Volume2, VolumeX, Headphones, ImagePlus, X as XIcon, Menu, Plus, Trash2, ListChecks, BookOpen, Brain, Compass, ThumbsUp, ThumbsDown, Briefcase, RefreshCw, ChevronDown, AlertCircle } from "lucide-react";
import { splitTextWithCitations } from "@/lib/citation-parser";
import { CitationLink } from "@/components/CitationLink";
import { SourcePageViewer } from "@/components/SourcePageViewer";
import { getUserMemory, getMemoryContext, applyMemoryUpdate, incrementSessionCount, clearMemory, type UserMemory } from "@/lib/user-memory";
import { isTourCompleted, startOnboardingTour, resetTourFlag } from "@/lib/onboarding-tour";

// --- Types ---

type ReasoningStep = {
  step_number: number;
  tool_name: string;
  input_params: Record<string, unknown>;
  result_summary: string;
  reasoning?: string;
  duration_ms: number;
};

type AgentPhase = {
  phase: "safety_review" | "quality_review";
  status: "running" | "complete";
  result?: {
    // Safety fields
    safe?: boolean;
    warnings?: string[];
    critical_issues?: string[];
    // Quality fields
    approved?: boolean;
    accuracy_score?: number;
    clarity_score?: number;
    suggestion?: string | null;
    // Common
    duration_ms?: number;
  };
};

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "artifact"; artifact: ArtifactPayload }
  | { type: "tool_call"; name: string; input: Record<string, unknown>; reasoning?: string };

type Message = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string; // data URL for user-attached weld photos
  blocks?: ContentBlock[];
  toolCalls?: { name: string; input: Record<string, unknown>; reasoning?: string }[];
  reasoningSteps?: ReasoningStep[];
  agentPhases?: AgentPhase[];
  elapsedMs?: number;
  stats?: Stats;
  cost?: number;
  turns?: number;
  confidence?: "high" | "medium" | "low";
  id?: string; // unique message ID for feedback
};

// --- Helpers ---

function extractPageFromUrl(url: string): string | undefined {
  const match = url.match(/owner_p(\d+)/);
  if (match) return match[1];
  const qsg = url.match(/qsg_p(\d+)/);
  if (qsg) return `QSG ${qsg[1]}`;
  return undefined;
}

/** Strip markdown, artifact tags, and image refs — return only readable prose for TTS */
function stripToPlainText(blocks: ContentBlock[]): string {
  const textBlocks = blocks.filter((b): b is ContentBlock & { type: "text" } => b.type === "text");
  let raw = textBlocks.map((b) => b.text).join("\n");
  // Remove markdown images
  raw = raw.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Remove markdown links, keep text
  raw = raw.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  // Remove bold/italic markers
  raw = raw.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  // Remove code blocks
  raw = raw.replace(/```[\s\S]*?```/g, "");
  // Remove inline code
  raw = raw.replace(/`([^`]+)`/g, "$1");
  // Remove headers
  raw = raw.replace(/^#{1,6}\s+/gm, "");
  // Remove HTML tags
  raw = raw.replace(/<[^>]+>/g, "");
  // Collapse whitespace
  raw = raw.replace(/\n{2,}/g, "\n").trim();
  return raw;
}

// --- Example questions ---

const EXAMPLES = [
  "What's the duty cycle for MIG at 200A on 240V?",
  "Where does the ground clamp go for flux-cored?",
  "My weld has porosity -- what should I check?",
  "Which process should I use for sheet metal?",
];

// --- Loading dots ---

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-pulse"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </div>
  );
}

// --- Markdown renderer ---

/** Renders a text string with inline citation links */
function TextWithCitations({
  text,
  onCitationClick,
}: {
  text: string;
  onCitationClick?: (page: number) => void;
}) {
  if (!onCitationClick) return <>{text}</>;
  const segments = splitTextWithCitations(text);
  if (segments.length === 1 && segments[0].type === "text") return <>{text}</>;
  return (
    <>
      {segments.map((seg, i) =>
        seg.type === "citation" ? (
          <CitationLink
            key={i}
            page={seg.page}
            displayText={seg.text}
            onClick={() => onCitationClick(seg.page)}
          />
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  );
}

function MarkdownContent({
  text,
  onCitationClick,
}: {
  text: string;
  onCitationClick?: (page: number) => void;
}) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeUnwrapImages]}
        components={{
          img: ({ src, alt }) => {
            if (!src || typeof src !== "string") return null;
            const page = extractPageFromUrl(src);
            return <ManualImage url={src} caption={alt || undefined} page={page} />;
          },
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">
              {children}
            </a>
          ),
          // Inject citation links into text nodes inside paragraphs, list items, etc.
          p: ({ children }) => (
            <p>
              {processChildren(children, onCitationClick)}
            </p>
          ),
          li: ({ children }) => (
            <li>
              {processChildren(children, onCitationClick)}
            </li>
          ),
          td: ({ children }) => (
            <td>
              {processChildren(children, onCitationClick)}
            </td>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Walk React children and replace string nodes with citation-aware rendering */
function processChildren(
  children: React.ReactNode,
  onCitationClick?: (page: number) => void
): React.ReactNode {
  if (!onCitationClick) return children;

  return Array.isArray(children)
    ? children.map((child, i) =>
        typeof child === "string" ? (
          <TextWithCitations key={i} text={child} onCitationClick={onCitationClick} />
        ) : (
          child
        )
      )
    : typeof children === "string"
    ? <TextWithCitations text={children} onCitationClick={onCitationClick} />
    : children;
}

// --- TTS Speaker button ---

function SpeakerButton({ blocks, onVoiceError }: { blocks: ContentBlock[]; onVoiceError?: () => void }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const handleClick = async () => {
    if (playing) {
      audioRef.current?.pause();
      audioRef.current = null;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
      setPlaying(false);
      return;
    }

    const text = stripToPlainText(blocks);
    if (!text) return;

    setPlaying(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        console.error("[TTS] voice service error:", res.status);
        setPlaying(false);
        onVoiceError?.();
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPlaying(false);
        URL.revokeObjectURL(url);
        urlRef.current = null;
      };
      audio.play();
    } catch (err) {
      console.error("[TTS] fetch failed:", err);
      setPlaying(false);
      onVoiceError?.();
    }
  };

  // Expose stop for external use
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return (
    <button
      onClick={handleClick}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      title={playing ? "Stop playback" : "Read aloud"}
    >
      {playing ? <VolumeX size={12} /> : <Volume2 size={12} />}
      <span>{playing ? "Stop" : "Listen"}</span>
    </button>
  );
}

// --- Feedback helpers ---

type FeedbackEntry = { message_id: string; rating: "up" | "down"; comment?: string; timestamp: string };

function loadFeedbackLog(): FeedbackEntry[] {
  try { return JSON.parse(localStorage.getItem("feedback_log") || "[]"); } catch { return []; }
}
function saveFeedback(entry: FeedbackEntry) {
  const log = loadFeedbackLog();
  // Replace if same message_id exists
  const idx = log.findIndex(e => e.message_id === entry.message_id);
  if (idx >= 0) log[idx] = entry; else log.push(entry);
  try { localStorage.setItem("feedback_log", JSON.stringify(log)); } catch {}
}

// --- Multi-product dropdown ---

const PRODUCTS = [
  { name: "Vulcan OmniPro 220", active: true },
  { name: "Lincoln Power MIG 210MP", active: false },
  { name: "Miller Multimatic 215", active: false },
  { name: "Hobart Handler 210MVP", active: false },
];

function ProductDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 group"
      >
        <div>
          <h1 className="text-sm font-semibold text-foreground tracking-tight flex items-center gap-1">
            Vulcan OmniPro 220
            <ChevronDown size={12} className="text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
          </h1>
          <p className="text-[11px] text-muted-foreground text-left">
            Technical support, built for garage hobbyists
          </p>
        </div>
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
          <div className="py-1">
            {PRODUCTS.map((p) => (
              <div
                key={p.name}
                className={`flex items-center gap-2.5 px-3 py-2 ${
                  p.active
                    ? "cursor-default"
                    : "opacity-40 cursor-not-allowed"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    p.active ? "bg-emerald-500" : "bg-muted-foreground/30"
                  }`}
                />
                <span className={`text-xs ${p.active ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {p.name}
                </span>
                {!p.active && (
                  <span className="ml-auto text-[9px] font-mono text-muted-foreground/50">
                    coming soon
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="border-t border-border/50 px-3 py-1.5">
            <p className="text-[9px] text-muted-foreground/40 font-mono">
              Multi-product support in development
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ConfidenceBadge({ level, customerMode }: { level: "high" | "medium" | "low"; customerMode?: boolean }) {
  if (customerMode && level !== "low") return null;
  const config = {
    high: { color: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "high confidence" },
    medium: { color: "bg-yellow-500", text: "text-yellow-600 dark:text-yellow-400", label: "medium confidence" },
    low: { color: "bg-zinc-400", text: "text-muted-foreground", label: "based on general knowledge — verify against manual" },
  }[level];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-mono ${config.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.color}`} />
      {config.label}
    </span>
  );
}

function FeedbackButtons({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<"up" | "down" | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [comment, setComment] = useState("");

  // Check existing feedback on mount
  useEffect(() => {
    const log = loadFeedbackLog();
    const existing = log.find(e => e.message_id === messageId);
    if (existing) setRating(existing.rating);
  }, [messageId]);

  const handleUp = () => {
    setRating("up");
    setShowInput(false);
    saveFeedback({ message_id: messageId, rating: "up", timestamp: new Date().toISOString() });
  };
  const handleDown = () => {
    setRating("down");
    setShowInput(true);
  };
  const handleSubmitComment = () => {
    saveFeedback({ message_id: messageId, rating: "down", comment, timestamp: new Date().toISOString() });
    setShowInput(false);
  };

  return (
    <div>
      <div className="flex items-center gap-1">
        <button onClick={handleUp} className={`p-0.5 rounded transition-colors ${rating === "up" ? "text-emerald-500" : "text-muted-foreground/40 hover:text-muted-foreground"}`} title="Helpful">
          <ThumbsUp size={12} />
        </button>
        <button onClick={handleDown} className={`p-0.5 rounded transition-colors ${rating === "down" ? "text-red-500" : "text-muted-foreground/40 hover:text-muted-foreground"}`} title="Not helpful">
          <ThumbsDown size={12} />
        </button>
      </div>
      {showInput && (
        <div className="flex items-center gap-1.5 mt-1">
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="What was wrong?"
            className="text-[10px] bg-muted border border-border rounded px-2 py-1 flex-1 min-w-0 focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={e => e.key === "Enter" && handleSubmitComment()}
          />
          <button onClick={handleSubmitComment} className="text-[10px] font-mono text-primary hover:opacity-80">Send</button>
        </div>
      )}
    </div>
  );
}

// --- Message component ---

function MessageBubble({
  message,
  isStreaming,
  onTTSComplete,
  autoSpeak,
  onCitationClick,
  onSendMessage,
  customerMode,
  onVoiceError,
}: {
  message: Message;
  isStreaming: boolean;
  onTTSComplete?: () => void;
  autoSpeak?: boolean;
  onCitationClick?: (page: number) => void;
  onSendMessage?: (msg: string) => void;
  customerMode?: boolean;
  onVoiceError?: () => void;
}) {
  const hasAutoSpoken = useRef(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end animate-message-in">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-muted px-4 py-2.5">
          {message.imageUrl && (
            <div className="mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={message.imageUrl}
                alt="Attached weld photo"
                className="max-w-[280px] w-full rounded-lg border border-border cursor-pointer"
                onClick={() => window.open(message.imageUrl, "_blank")}
              />
            </div>
          )}
          <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  const blocks = message.blocks || [];
  const textBlocks = blocks.filter((b): b is ContentBlock & { type: "text" } => b.type === "text");
  const artifactBlocks = blocks.filter((b): b is ContentBlock & { type: "artifact" } => b.type === "artifact");
  const toolCalls = message.toolCalls || [];
  const fullText = textBlocks.map((b) => b.text).join("\n");
  const hasContent = fullText.trim().length > 0 || artifactBlocks.length > 0;

  // Auto-speak when hands-free and message is done streaming
  useEffect(() => {
    if (autoSpeak && !isStreaming && hasContent && !hasAutoSpoken.current) {
      hasAutoSpoken.current = true;
      const text = stripToPlainText(blocks);
      if (!text) {
        onTTSComplete?.();
        return;
      }
      (async () => {
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          if (!res.ok) {
            console.error("[TTS] voice service error in autoSpeak:", res.status);
            onVoiceError?.();
            onTTSComplete?.();
            return;
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => {
            URL.revokeObjectURL(url);
            onTTSComplete?.();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(url);
            onTTSComplete?.();
          };
          audio.play();
        } catch (err) {
          console.error("[TTS] autoSpeak fetch failed:", err);
          onVoiceError?.();
          onTTSComplete?.();
        }
      })();
    }
  }, [autoSpeak, isStreaming, hasContent, blocks, onTTSComplete]);

  return (
    <div className="animate-message-in max-w-none border-l-2 border-border pl-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[11px] font-mono text-muted-foreground">Prox</span>
      </div>

      {toolCalls.length > 0 && (
        <ReasoningRibbon
          toolCalls={toolCalls}
          reasoningSteps={message.reasoningSteps || []}
          agentPhases={message.agentPhases || []}
          isStreaming={isStreaming}
          elapsedMs={message.elapsedMs || 0}
          customerMode={customerMode}
        />
      )}

      {!hasContent && isStreaming && toolCalls.length === 0 && <LoadingDots />}

      {artifactBlocks.map((block, i) => (
        <div key={i} className="mb-3">
          <ArtifactErrorBoundary customerMode={customerMode}>
            <ArtifactRenderer artifact={block.artifact} onCitationClick={onCitationClick} onSendMessage={onSendMessage} />
          </ArtifactErrorBoundary>
        </div>
      ))}

      {fullText.trim() && <MarkdownContent text={fullText} onCitationClick={onCitationClick} />}

      {isStreaming && hasContent && (
        <span className="inline-block w-1.5 h-4 bg-foreground/70 animate-pulse-cursor ml-0.5 -mb-0.5" />
      )}

      {/* Footer: stats + confidence + speaker + feedback */}
      {!isStreaming && hasContent && (
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {message.stats && !customerMode && <MessageStats stats={message.stats} />}
          {message.confidence && <ConfidenceBadge level={message.confidence} customerMode={customerMode} />}
          {!customerMode && <SpeakerButton blocks={blocks} onVoiceError={onVoiceError} />}
          {message.id && <FeedbackButtons messageId={message.id} />}
        </div>
      )}
    </div>
  );
}

// --- Voice Input Hook ---

function useVoiceInput() {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [debugStatus, setDebugStatus] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const onResultRef = useRef<((text: string) => void) | null>(null);

  // Check support once
  useEffect(() => {
    try {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) setSupported(false);
    } catch {
      setSupported(false);
    }
  }, []);

  const startListening = useCallback((onResult: (text: string) => void) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // Stop any previous instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }

    // Fresh instance every time — avoids stale-state bugs
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;
    onResultRef.current = onResult;

    recognition.onstart = () => {
      console.log("[STT] recognition started");
      setDebugStatus("listening");
    };

    recognition.onaudiostart = () => {
      console.log("[STT] audio capture started");
      setDebugStatus("hearing audio");
    };

    recognition.onresult = (event: any) => {
      console.log("[STT] onresult fired", event.results.length, "results");
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      if (finalText) {
        console.log("[STT] final:", finalText);
        setInterimText("");
        setDebugStatus("");
        setIsListening(false);
        recognitionRef.current = null;
        onResultRef.current?.(finalText.trim());
      } else {
        console.log("[STT] interim:", interim);
        setInterimText(interim);
        setDebugStatus("transcribing");
      }
    };

    recognition.onerror = (event: any) => {
      console.error("[STT] error:", event.error);
      setDebugStatus(`error: ${event.error}`);
      setIsListening(false);
      setInterimText("");
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      console.log("[STT] recognition ended");
      // Only clear if we're still in listening mode (not already handled by onresult)
      setIsListening(false);
      setInterimText((prev) => {
        // If there's leftover interim text and no final was received,
        // submit it as the final result
        if (prev.trim()) {
          console.log("[STT] submitting leftover interim as final:", prev);
          setTimeout(() => onResultRef.current?.(prev.trim()), 0);
          return "";
        }
        return "";
      });
      recognitionRef.current = null;
    };

    setInterimText("");
    setDebugStatus("starting");
    setIsListening(true);

    try {
      recognition.start();
    } catch (err) {
      console.error("[STT] start failed:", err);
      setDebugStatus("start failed");
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    setIsListening(false);
    setInterimText("");
    setDebugStatus("");
    recognitionRef.current = null;
  }, []);

  return { isListening, interimText, debugStatus, supported, startListening, stopListening };
}

// --- Main page ---

// --- Chat history types ---

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
};

function generateId() {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2);
}

function loadChats(): { chats: ChatSession[]; activeChatId: string | null } {
  try {
    const raw = localStorage.getItem("omnipro_chats");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { chats: [], activeChatId: null };
}

function saveChats(chats: ChatSession[], activeChatId: string | null) {
  try {
    // Strip imageUrl from messages before saving to avoid localStorage limits
    const stripped = chats.map(c => ({
      ...c,
      messages: c.messages.map(m => ({ ...m, imageUrl: undefined })),
    }));
    localStorage.setItem("omnipro_chats", JSON.stringify({ chats: stripped, activeChatId }));
  } catch {}
}

// --- Image helpers ---

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

async function fileToDataUrl(file: File): Promise<string> {
  // If under limit, convert directly
  if (file.size <= MAX_IMAGE_BYTES) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  // Resize using canvas
  const bitmap = await createImageBitmap(file);
  const scale = Math.sqrt(MAX_IMAGE_BYTES / file.size) * 0.9;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const [attachedImage, setAttachedImage] = useState<{ file: File; dataUrl: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [guidedMode, setGuidedMode] = useState(false);
  const [sourceViewer, setSourceViewer] = useState<{ open: boolean; page: number | null; topic: string | null; browse: boolean }>({ open: false, page: null, topic: null, browse: false });
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; process: string; material: string; thickness: string; voltage: string; created_at: string }>>([]);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [userMemory, setUserMemory] = useState<UserMemory | null>(null);
  const [memoryPopoverOpen, setMemoryPopoverOpen] = useState(false);
  const [customerMode, setCustomerMode] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [voiceToast, setVoiceToast] = useState<string | null>(null);
  const voiceToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUserMsgRef = useRef<string>("");
  const memoryPopoverRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handsFreeRef = useRef(false);
  const handleSubmitRef = useRef<(text?: string) => void>(() => {});
  const dragCounter = useRef(0);

  const voice = useVoiceInput();

  const showVoiceToast = useCallback((msg: string) => {
    if (voiceToastTimer.current) clearTimeout(voiceToastTimer.current);
    setVoiceToast(msg);
    voiceToastTimer.current = setTimeout(() => setVoiceToast(null), 5000);
  }, []);

  // Load chat history on mount
  useEffect(() => {
    const { chats: saved, activeChatId: savedId } = loadChats();
    setChats(saved);
    if (savedId && saved.find(c => c.id === savedId)) {
      setActiveChatId(savedId);
      const active = saved.find(c => c.id === savedId);
      if (active) setMessages(active.messages);
    }
    const sb = localStorage.getItem("omnipro_sidebar");
    if (sb === "false") setSidebarOpen(false);
  }, []);

  // Persist chats whenever they change
  useEffect(() => {
    if (chats.length > 0 || activeChatId) {
      saveChats(chats, activeChatId);
    }
  }, [chats, activeChatId]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem("omnipro_sidebar", String(sidebarOpen));
  }, [sidebarOpen]);

  // Sync messages back to active chat
  useEffect(() => {
    if (!activeChatId || messages.length === 0) return;
    setChats(prev => prev.map(c =>
      c.id === activeChatId
        ? { ...c, messages, title: c.title || (messages[0]?.content || "New chat").slice(0, 40) }
        : c
    ));
  }, [messages, activeChatId]);

  // Persist hands-free toggle
  useEffect(() => {
    const saved = localStorage.getItem("handsFree");
    if (saved === "true") setHandsFree(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("handsFree", String(handsFree));
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  // Persist guided mode toggle
  useEffect(() => {
    const saved = localStorage.getItem("guided_mode_enabled");
    if (saved === "true") setGuidedMode(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("guided_mode_enabled", String(guidedMode));
  }, [guidedMode]);

  // Persist customer mode toggle
  useEffect(() => {
    const saved = localStorage.getItem("customer_mode_enabled");
    if (saved === "true") setCustomerMode(true);
  }, []);
  useEffect(() => {
    localStorage.setItem("customer_mode_enabled", String(customerMode));
  }, [customerMode]);

  // Load presets + listen for updates from configurator
  useEffect(() => {
    function loadPresets() {
      try {
        const raw = localStorage.getItem("settings_presets");
        if (raw) setPresets(JSON.parse(raw));
      } catch {}
    }
    loadPresets();
    window.addEventListener("presets-updated", loadPresets);
    return () => window.removeEventListener("presets-updated", loadPresets);
  }, []);

  // Load user memory on mount
  useEffect(() => {
    const mem = getUserMemory();
    setUserMemory(mem);
  }, []);

  // Trigger onboarding tour for first-time users
  useEffect(() => {
    if (isTourCompleted()) return;
    if (chats.length > 0) return;
    const timer = setTimeout(() => {
      startOnboardingTour({
        onComplete: () => {},
        onSkip: () => {},
      });
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close memory popover on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (memoryPopoverRef.current && !memoryPopoverRef.current.contains(e.target as Node)) {
        setMemoryPopoverOpen(false);
      }
    }
    if (memoryPopoverOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [memoryPopoverOpen]);

  function handleNewChat() {
    const id = generateId();
    const session: ChatSession = { id, title: "", messages: [], createdAt: new Date().toISOString() };
    setChats(prev => [session, ...prev]);
    setActiveChatId(id);
    setMessages([]);
    setInput("");
    setAttachedImage(null);
    textareaRef.current?.focus();
  }

  function handleSwitchChat(id: string) {
    const chat = chats.find(c => c.id === id);
    if (!chat) return;
    setActiveChatId(id);
    setMessages(chat.messages);
    setInput("");
    setAttachedImage(null);
  }

  function handleDeleteChat(id: string) {
    setChats(prev => prev.filter(c => c.id !== id));
    setDeletingId(null);
    if (activeChatId === id) {
      setActiveChatId(null);
      setMessages([]);
    }
  }

  const openSourceViewer = useCallback((page: number, topic?: string | null) => {
    setSourceViewer({ open: true, page, topic: topic || null, browse: false });
  }, []);

  const openManualBrowser = useCallback(() => {
    const lastPage = parseInt(localStorage.getItem("source_viewer_last_page") || "1", 10);
    setSourceViewer({ open: true, page: lastPage, topic: null, browse: true });
  }, []);

  const closeSourceViewer = useCallback(() => {
    setSourceViewer((prev) => ({ ...prev, open: false }));
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  }, [input]);

  // Voice error: show toast, disable hands-free
  const handleVoiceError = useCallback(() => {
    showVoiceToast("Voice unavailable. Switched to text mode.");
    setHandsFree(false);
  }, [showVoiceToast]);

  // Hands-free: auto-start mic after TTS finishes
  const handleTTSComplete = useCallback(() => {
    console.log("[Hands-free] TTS complete, handsFreeRef:", handsFreeRef.current);
    if (handsFreeRef.current) {
      console.log("[Hands-free] restarting mic after 500ms delay");
      setTimeout(() => {
        if (!handsFreeRef.current) {
          console.log("[Hands-free] aborted — toggled off during delay");
          return;
        }
        console.log("[Hands-free] mic restarting now");
        voice.startListening((text) => {
          console.log("[Hands-free] loop speech received:", text);
          handleSubmitRef.current(text);
        });
      }, 500);
    }
  }, [voice.startListening]);

  // Image attachment
  async function handleImageSelect(file: File) {
    if (!file.type.startsWith("image/")) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setAttachedImage({ file, dataUrl });
    } catch (err) {
      console.error("Failed to process image:", err);
    }
  }

  // Drag-and-drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDragging(false);
      dragCounter.current = 0;
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    dragCounter.current = 0;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleImageSelect(file);
  }, []);

  async function handleSubmit(text?: string) {
    const msg = (text || input).trim();
    const hasImage = !!attachedImage;
    if ((!msg && !hasImage) || loading) return;

    const imageDataUrl = attachedImage?.dataUrl || null;
    setInput("");
    setAttachedImage(null);
    voice.stopListening();

    // Auto-create a chat session if none active
    if (!activeChatId) {
      const id = generateId();
      const title = (msg || "Weld photo").slice(0, 40);
      const session: ChatSession = { id, title, messages: [], createdAt: new Date().toISOString() };
      setChats(prev => [session, ...prev]);
      setActiveChatId(id);
    }

    const displayContent = hasImage && !msg ? "[Weld photo attached]" : msg || "[Weld photo attached]";
    const userMessage: Message = { role: "user", content: displayContent, imageUrl: imageDataUrl || undefined };
    lastUserMsgRef.current = msg;
    setStreamError(false);
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const msgId = generateId();
    const assistantMessage: Message = {
      role: "assistant",
      content: "",
      blocks: [],
      toolCalls: [],
      id: msgId,
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const payload: Record<string, unknown> = {};
      if (msg) payload.message = msg;
      if (imageDataUrl) payload.image = imageDataUrl;
      if (!msg && imageDataUrl) payload.message = "What's wrong with this weld? Diagnose it.";
      if (guidedMode) payload.guided_mode = true;
      payload.user_memory_context = getMemoryContext();

      // Increment session count on first message
      const updatedMem = incrementSessionCount();
      setUserMemory(updatedMem);

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "",
            blocks: [{ type: "text", text: `Error: ${err.error || res.statusText}` }],
          };
          return updated;
        });
        setLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      let textBlocks: { type: "text"; text: string }[] = [];
      let artifactBlocks: { type: "artifact"; artifact: ArtifactPayload }[] = [];
      let toolCalls: { name: string; input: Record<string, unknown>; reasoning?: string }[] = [];
      let reasoningSteps: ReasoningStep[] = [];
      let agentPhases: AgentPhase[] = [];
      let cost: number | undefined;
      let turns: number | undefined;
      let stats: Stats | undefined;
      let confidence: "high" | "medium" | "low" | undefined;
      const streamStartMs = Date.now();
      let elapsedMs = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7);
            else if (line.startsWith("data: ")) eventData = line.slice(6);
          }

          if (!eventType || !eventData) continue;

          let data: any;
          try {
            data = JSON.parse(eventData);
          } catch {
            continue;
          }

          if (eventType === "text" && data.text) {
            textBlocks = [...textBlocks, { type: "text", text: data.text }];
          } else if (eventType === "tool_call") {
            toolCalls = [...toolCalls, { name: data.name, input: data.input || {}, reasoning: data.reasoning }];
          } else if (eventType === "reasoning_step") {
            // Attach reasoning from the matching tool_call event
            const matchingToolCall = toolCalls.find(tc => tc.name === data.tool_name && !reasoningSteps.some(rs => rs.tool_name === tc.name && rs.step_number === data.step_number));
            reasoningSteps = [...reasoningSteps, {
              step_number: data.step_number,
              tool_name: data.tool_name,
              input_params: data.input_params || {},
              result_summary: data.result_summary || "",
              reasoning: matchingToolCall?.reasoning || data.reasoning,
              duration_ms: data.duration_ms || 0,
            }];
          } else if (eventType === "agent_phase") {
            const existing = agentPhases.findIndex(p => p.phase === data.phase);
            const phase: AgentPhase = { phase: data.phase, status: data.status, result: data.result };
            if (existing >= 0) {
              agentPhases = [...agentPhases];
              agentPhases[existing] = phase;
            } else {
              agentPhases = [...agentPhases, phase];
            }
          } else if (eventType === "artifact" && data.artifact_type) {
            // Deduplicate: skip if we already have this artifact type
            const dedupTypes = ["weld_diagnosis_result", "machine_photo_annotation", "guided_walkthrough", "video_recommendation"];
            if (dedupTypes.includes(data.artifact_type) &&
                artifactBlocks.some(b => b.artifact.artifact_type === data.artifact_type)) {
              continue;
            }
            const artifactData = data.data || data;
            // Inject the user's actual image into photo-based artifacts
            if (imageDataUrl && (
              data.artifact_type === "weld_diagnosis_result" ||
              data.artifact_type === "machine_photo_annotation"
            )) {
              artifactData.user_image_url = imageDataUrl;
            }
            const payload: ArtifactPayload = {
              artifact_type: data.artifact_type,
              title: data.title || "",
              data: artifactData,
            };
            artifactBlocks = [...artifactBlocks, { type: "artifact", artifact: payload }];
          } else if (eventType === "result") {
            cost = data.cost_usd;
            turns = data.turns;
            if (data.result && textBlocks.length === 0) {
              textBlocks = [{ type: "text", text: data.result }];
            }
          } else if (eventType === "stats" && data.cost_usd !== undefined) {
            stats = {
              cost_usd: data.cost_usd,
              elapsed_ms: data.elapsed_ms,
              tool_call_count: data.tool_call_count,
            };
          } else if (eventType === "confidence" && data.level) {
            confidence = data.level;
          } else if (eventType === "memory_update") {
            // Silently apply user state updates from extract_user_state
            applyMemoryUpdate(data);
            setUserMemory(getUserMemory());
          } else if (eventType === "error") {
            textBlocks = [...textBlocks, { type: "text", text: `Error: ${data.error}` }];
          }

          elapsedMs = Date.now() - streamStartMs;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "",
              blocks: [...textBlocks, ...artifactBlocks],
              toolCalls,
              reasoningSteps,
              agentPhases,
              elapsedMs,
              stats,
              cost,
              turns,
              confidence,
              id: msgId,
            };
            return updated;
          });
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setStreamError(true);
        setMessages((prev) => {
          const updated = [...prev];
          // Remove the empty assistant message
          if (updated.length > 0 && updated[updated.length - 1].role === "assistant" && !(updated[updated.length - 1].blocks?.length)) {
            updated.pop();
          }
          return updated;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }

  // Keep ref in sync so callbacks always call latest handleSubmit
  handleSubmitRef.current = handleSubmit;

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleMicClick() {
    if (voice.isListening) {
      voice.stopListening();
      return;
    }
    voice.startListening((text) => {
      handleSubmit(text);
    });
  }

  const MAX_CHARS = 500;

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside
        className={`flex flex-col border-r border-border bg-muted/30 transition-all duration-200 ease-in-out overflow-hidden ${
          sidebarOpen ? "w-[260px] min-w-[260px]" : "w-0 min-w-0"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold text-foreground truncate">OmniPro Support</span>
          <button
            onClick={handleNewChat}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
            title="New chat"
          >
            <Plus size={12} />
            <span>New</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {chats.length === 0 && (
            <p className="text-[10px] text-muted-foreground/50 text-center mt-8 px-4">
              No conversations yet
            </p>
          )}
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => handleSwitchChat(chat.id)}
              className={`group flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                chat.id === activeChatId
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs truncate">
                  {chat.title || "New chat"}
                </p>
                <p className="text-[9px] text-muted-foreground/50 font-mono">
                  {new Date(chat.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </p>
              </div>
              {deletingId === chat.id ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }}
                    className="text-[9px] text-red-500 hover:text-red-400 font-mono"
                  >
                    Delete
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeletingId(null); }}
                    className="text-[9px] text-muted-foreground hover:text-foreground font-mono"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setDeletingId(chat.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-0.5"
                  title="Delete chat"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Saved Presets */}
        {presets.length > 0 && (
          <div className="border-t border-border">
            <button
              onClick={() => setPresetsOpen((v) => !v)}
              className="flex items-center justify-between w-full px-4 py-2 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>Saved Presets ({presets.length})</span>
              <span>{presetsOpen ? "▲" : "▼"}</span>
            </button>
            {presetsOpen && (
              <div className="pb-2">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      handleSubmit(`What settings for ${p.thickness} ${p.material.toLowerCase()} ${p.process} on ${p.voltage}?`);
                    }}
                    className="block w-full text-left px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <span className="text-foreground">{p.name}</span>
                    <span className="block text-[9px] text-muted-foreground/50 font-mono">
                      {p.process} · {p.thickness} {p.material} · {p.voltage}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 -ml-1"
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <Menu size={18} />
            </button>
            <ProductDropdown />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openManualBrowser}
              data-tour-target="browse-manual-button"
              className="tour-browse-manual flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <BookOpen size={12} />
              <span className="hidden sm:inline">Browse Manual</span>
            </button>

            {/* Memory / Brain icon */}
            <div className={`relative ${customerMode ? "hidden" : ""}`} ref={memoryPopoverRef}>
              <button
                onClick={() => setMemoryPopoverOpen((v) => !v)}
                data-tour-target="brain-icon"
                className={`flex items-center gap-1 text-[10px] font-mono transition-colors p-1 rounded-md ${
                  userMemory?.machine_state.process
                    ? "text-primary hover:text-primary/80"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="What Prox remembers about you"
              >
                <Brain size={14} />
              </button>

              {memoryPopoverOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border bg-muted/30">
                    <p className="text-[11px] font-semibold text-foreground">What I remember</p>
                  </div>
                  <div className="px-3 py-2.5 space-y-2 text-[11px]">
                    {/* Machine state */}
                    {userMemory?.machine_state.process ? (
                      <div>
                        <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Setup</p>
                        <p className="text-foreground">
                          {[
                            userMemory.machine_state.voltage,
                            userMemory.machine_state.process,
                            userMemory.machine_state.material,
                            userMemory.machine_state.thickness,
                          ].filter(Boolean).join(", ")}
                          {userMemory.machine_state.wire_diameter && (
                            <span className="text-muted-foreground"> (wire: {userMemory.machine_state.wire_diameter})</span>
                          )}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground/60">No machine setup recorded yet</p>
                    )}

                    {/* Profile */}
                    {(userMemory?.user_profile.session_count ?? 0) > 0 && (
                      <div>
                        <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Profile</p>
                        <p className="text-foreground">
                          Session {userMemory!.user_profile.session_count}
                          {userMemory!.user_profile.experience_level && ` · ${userMemory!.user_profile.experience_level}`}
                          {userMemory!.user_profile.primary_use && ` · ${userMemory!.user_profile.primary_use}`}
                        </p>
                      </div>
                    )}

                    {/* Recent topics */}
                    {(userMemory?.recent_topics.length ?? 0) > 0 && (
                      <div>
                        <p className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Recent Topics</p>
                        <div className="flex flex-wrap gap-1">
                          {userMemory!.recent_topics.slice(0, 6).map((t, i) => (
                            <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                              {t.topic}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-3 py-2 border-t border-border">
                    <button
                      onClick={() => {
                        clearMemory();
                        setUserMemory(getUserMemory());
                        setMemoryPopoverOpen(false);
                      }}
                      className="text-[10px] font-mono text-red-500 hover:text-red-400 transition-colors"
                    >
                      Forget everything
                    </button>
                    <button
                      onClick={() => {
                        setMemoryPopoverOpen(false);
                        resetTourFlag();
                        setTimeout(() => {
                          startOnboardingTour({
                            onComplete: () => {},
                            onSkip: () => {},
                          });
                        }, 300);
                      }}
                      className="block mt-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Take the tour again
                    </button>
                    {loadFeedbackLog().length > 0 && (
                      <p className="mt-1.5 text-[10px] font-mono text-muted-foreground/60">
                        Feedback collected: {loadFeedbackLog().length} responses
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <a
              href="/graph"
              target="_blank"
              rel="noopener noreferrer"
              data-tour-target="knowledge-graph-link"
              className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              Knowledge Graph
            </a>

            {/* Tour / Help button */}
            <button
              onClick={() => {
                resetTourFlag();
                startOnboardingTour({ onComplete: () => {}, onSkip: () => {} });
              }}
              data-tour-target="tour-button"
              className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              title={customerMode ? "Get help" : "Take the product tour"}
            >
              <Compass size={12} />
              <span className="hidden sm:inline">{customerMode ? "Help" : "Tour"}</span>
            </button>

            {/* Hands-free toggle */}
            <button
              onClick={() => {
                if (!voice.supported) {
                  showVoiceToast("Voice input not supported in this browser. Use Chrome or Safari.");
                  return;
                }
                setHandsFree((prev) => {
                  const next = !prev;
                  if (next) {
                    console.log("[Hands-free] toggled ON — starting mic");
                    setTimeout(() => {
                      voice.startListening((text) => {
                        console.log("[Hands-free] speech received:", text);
                        handleSubmitRef.current(text);
                      });
                    }, 100);
                  } else {
                    console.log("[Hands-free] toggled OFF — stopping mic");
                    voice.stopListening();
                  }
                  return next;
                });
              }}
              data-tour-target="hands-free-toggle"
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-mono transition-all ${
                handsFree
                  ? "border-primary bg-primary/10 text-primary shadow-[0_0_6px_rgba(59,130,246,0.4)]"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              title={handsFree ? "Hands-free mode ON — click to disable" : "Enable hands-free voice conversation"}
            >
              <Headphones size={12} className={handsFree ? "animate-pulse" : ""} />
              <span className="hidden sm:inline">Hands-free</span>
            </button>

            {/* Guided Mode toggle */}
            <button
              onClick={() => setGuidedMode((v) => !v)}
              data-tour-target="guided-toggle"
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-mono transition-all ${
                guidedMode
                  ? "border-primary bg-primary/10 text-primary shadow-[0_0_6px_rgba(59,130,246,0.4)]"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              title={guidedMode ? "Guided Mode ON — step-by-step walkthroughs" : "Enable guided step-by-step walkthroughs"}
            >
              <ListChecks size={12} className={guidedMode ? "animate-pulse" : ""} />
              <span className="hidden sm:inline">Guided</span>
            </button>

            {/* Customer Mode toggle */}
            <button
              onClick={() => setCustomerMode((v) => !v)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-mono transition-all ${
                customerMode
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
              title={customerMode ? "Switch to Developer Mode" : "Switch to Customer Mode"}
            >
              <Briefcase size={12} />
              <span className="hidden sm:inline">{customerMode ? "Customer" : "Dev"}</span>
            </button>

            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
              {customerMode ? "Vulcan Support" : "Built for Prox"}
            </Badge>
            <ThemeToggle />
          </div>
        </header>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageSelect(file);
            e.target.value = "";
          }}
        />

        {/* Messages + drag-drop zone */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 relative"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="rounded-2xl border-2 border-dashed border-primary/50 bg-primary/5 px-12 py-10">
                <p className="text-sm font-medium text-primary">Drop your weld photo here</p>
              </div>
            </div>
          )}
          <div className="mx-auto max-w-4xl space-y-6">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center pt-8 pb-8">
                {/* Welcome back banner for returning users */}
                {userMemory && userMemory.user_profile.session_count >= 1 && (userMemory.machine_state.process || userMemory.machine_state.voltage) && (
                  <div className="w-full max-w-lg mb-4 animate-hero-1">
                    <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-center">
                      <p className="text-xs text-foreground">
                        Welcome back. I remember you&apos;re on{" "}
                        <span className="font-semibold">
                          {[
                            userMemory.machine_state.voltage,
                            userMemory.machine_state.process,
                            userMemory.machine_state.material,
                            userMemory.machine_state.thickness,
                          ].filter(Boolean).join(" ")}
                        </span>.
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Need to change anything, or pick up where you left off?
                      </p>
                    </div>
                  </div>
                )}

                <div className="w-full max-w-md animate-hero-1">
                  <FrontPanelPolarity process="MIG" />
                </div>

                <p className="text-muted-foreground text-sm mt-5 animate-hero-2">
                  Ask anything about the OmniPro 220.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-5 animate-hero-3">
                  {EXAMPLES.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSubmit(q)}
                      className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <p className="text-[10px] text-muted-foreground/50 mt-6 text-center font-mono animate-hero-4">
                  4 processes &middot; 48-page manual &middot; interactive diagrams &middot; cross-referenced troubleshooting
                </p>
              </div>
            )}

            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1 && msg.role === "assistant";
              return (
                <MessageBubble
                  key={i}
                  message={msg}
                  isStreaming={loading && isLast}
                  autoSpeak={handsFree && isLast && !loading}
                  onTTSComplete={handleTTSComplete}
                  onCitationClick={openSourceViewer}
                  onSendMessage={(msg) => handleSubmit(msg)}
                  customerMode={customerMode}
                  onVoiceError={handleVoiceError}
                />
              );
            })}

            {/* Network error retry card */}
            {streamError && (
              <div className="animate-message-in rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-center gap-3">
                <RefreshCw size={14} className="text-destructive flex-shrink-0" />
                <p className="text-xs text-foreground flex-1">Connection interrupted.</p>
                <button
                  onClick={() => { setStreamError(false); handleSubmit(lastUserMsgRef.current); }}
                  className="text-xs font-mono text-primary hover:underline flex-shrink-0"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <div className="border-t border-border px-4 py-3 sm:px-6">
          <div className="mx-auto max-w-4xl">
            {/* Image preview */}
            {attachedImage && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachedImage.dataUrl}
                  alt="Attached"
                  className="w-12 h-12 rounded object-cover border border-border"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-foreground truncate">{attachedImage.file.name}</p>
                  <p className="text-[10px] font-mono text-muted-foreground">{formatBytes(attachedImage.file.size)}</p>
                </div>
                <button
                  onClick={() => setAttachedImage(null)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  title="Remove image"
                >
                  <XIcon size={14} />
                </button>
              </div>
            )}

            <div className="relative flex items-end gap-2 rounded-xl border border-border bg-card p-2 min-h-[56px] focus-within:ring-1 focus-within:ring-ring transition-shadow">
              {/* Image attach button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                data-tour-target="image-upload-button"
                className="flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                title="Attach weld photo"
              >
                <ImagePlus size={16} />
              </button>

              {/* Mic button */}
              <button
                onClick={handleMicClick}
                disabled={!voice.supported || loading}
                data-tour-target="mic-button"
                className={`flex items-center justify-center rounded-lg p-2 transition-all ${
                  voice.isListening
                    ? "bg-red-500/15 text-red-500 animate-pulse"
                    : voice.supported
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/30 cursor-not-allowed"
                }`}
                title={
                  !voice.supported
                    ? "Voice input requires Chrome or Safari"
                    : voice.isListening
                    ? "Stop listening"
                    : "Voice input"
                }
              >
                {voice.isListening ? <Square size={16} /> : <Mic size={16} />}
              </button>

              <textarea
                ref={textareaRef}
                data-tour-target="chat-input"
                value={voice.isListening ? voice.interimText : input}
                onChange={(e) => {
                  if (!voice.isListening && e.target.value.length <= MAX_CHARS)
                    setInput(e.target.value);
                }}
                onKeyDown={handleKeyDown}
                placeholder={
                  voice.isListening
                    ? voice.debugStatus
                      ? `[${voice.debugStatus}] Speak now...`
                      : "Listening... speak now"
                    : attachedImage
                    ? "Describe the issue, or just hit send..."
                    : "Ask about specs, setup, troubleshooting..."
                }
                className={`flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none ${
                  voice.isListening ? "text-red-400 italic" : ""
                }`}
                rows={1}
                disabled={loading}
                readOnly={voice.isListening}
              />
              <button
                onClick={() => handleSubmit()}
                disabled={loading || (!input.trim() && !attachedImage) || voice.isListening}
                data-tour-target="send-button"
                className="flex items-center justify-center rounded-lg bg-primary p-2 text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
              >
                <Send size={16} />
              </button>
              {input.length > 0 && !voice.isListening && (
                <span className="absolute bottom-1 right-14 text-[9px] font-mono text-muted-foreground/40">
                  {input.length}/{MAX_CHARS}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
              Prox may make mistakes. Verify critical settings against the owner&apos;s manual.
            </p>
          </div>
        </div>
      </div>

      {/* Source Page Viewer */}
      <SourcePageViewer
        open={sourceViewer.open}
        page_number={sourceViewer.page}
        highlight_topic={sourceViewer.topic}
        browse_mode={sourceViewer.browse}
        on_close={closeSourceViewer}
        on_send_message={(text) => handleSubmit(text)}
      />

      {/* Voice toast */}
      {voiceToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 shadow-lg">
            <AlertCircle size={16} className="shrink-0 text-amber-500" />
            <span className="text-sm text-foreground">{voiceToast}</span>
            <button
              onClick={() => setVoiceToast(null)}
              className="ml-2 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <XIcon size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
