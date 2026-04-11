"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeUnwrapImages from "rehype-unwrap-images";
import { ManualImage } from "@/components/chat/ManualImage";
import { ArtifactRenderer, type ArtifactPayload } from "@/components/ArtifactRenderer";
import { FrontPanelPolarity } from "@/components/artifacts/FrontPanelPolarity";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ReasoningRibbon } from "@/components/chat/ReasoningRibbon";
import { MessageStats, type Stats } from "@/components/chat/MessageStats";
import { Badge } from "@/components/ui/badge";
import { Send, Mic, Square, Volume2, VolumeX, Headphones, ImagePlus, X as XIcon, Menu, Plus, Trash2 } from "lucide-react";

// --- Types ---

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "artifact"; artifact: ArtifactPayload }
  | { type: "tool_call"; name: string; input: Record<string, unknown> };

type Message = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string; // data URL for user-attached weld photos
  blocks?: ContentBlock[];
  toolCalls?: { name: string; input: Record<string, unknown> }[];
  elapsedMs?: number;
  stats?: Stats;
  cost?: number;
  turns?: number;
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

function MarkdownContent({ text }: { text: string }) {
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
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// --- TTS Speaker button ---

function SpeakerButton({ blocks }: { blocks: ContentBlock[] }) {
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
        setPlaying(false);
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
    } catch {
      setPlaying(false);
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

// --- Message component ---

function MessageBubble({
  message,
  isStreaming,
  onTTSComplete,
  autoSpeak,
}: {
  message: Message;
  isStreaming: boolean;
  onTTSComplete?: () => void;
  autoSpeak?: boolean;
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
        } catch {
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
          isStreaming={isStreaming}
          elapsedMs={message.elapsedMs || 0}
        />
      )}

      {!hasContent && isStreaming && toolCalls.length === 0 && <LoadingDots />}

      {artifactBlocks.map((block, i) => (
        <div key={i} className="mb-3">
          <ArtifactRenderer artifact={block.artifact} />
        </div>
      ))}

      {fullText.trim() && <MarkdownContent text={fullText} />}

      {isStreaming && hasContent && (
        <span className="inline-block w-1.5 h-4 bg-foreground/70 animate-pulse-cursor ml-0.5 -mb-0.5" />
      )}

      {/* Footer: stats + speaker */}
      {!isStreaming && hasContent && (
        <div className="flex items-center gap-3 mt-1">
          {message.stats && <MessageStats stats={message.stats} />}
          <SpeakerButton blocks={blocks} />
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
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setSupported(false);
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const handsFreeRef = useRef(false);
  const dragCounter = useRef(0);

  const voice = useVoiceInput();

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

  // Hands-free: auto-start mic after TTS finishes
  const handleTTSComplete = useCallback(() => {
    if (handsFreeRef.current) {
      setTimeout(() => {
        voice.startListening((text) => {
          handleSubmit(text);
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
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const assistantMessage: Message = {
      role: "assistant",
      content: "",
      blocks: [],
      toolCalls: [],
    };
    setMessages((prev) => [...prev, assistantMessage]);

    try {
      const payload: Record<string, unknown> = {};
      if (msg) payload.message = msg;
      if (imageDataUrl) payload.image = imageDataUrl;
      if (!msg && imageDataUrl) payload.message = "What's wrong with this weld? Diagnose it.";

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
      let toolCalls: { name: string; input: Record<string, unknown> }[] = [];
      let cost: number | undefined;
      let turns: number | undefined;
      let stats: Stats | undefined;
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
            toolCalls = [...toolCalls, { name: data.name, input: data.input || {} }];
          } else if (eventType === "artifact" && data.artifact_type) {
            // Deduplicate: skip if we already have this artifact type
            if (data.artifact_type === "weld_diagnosis_result" &&
                artifactBlocks.some(b => b.artifact.artifact_type === "weld_diagnosis_result")) {
              continue;
            }
            const artifactData = data.data || data;
            // Inject the user's actual image into weld diagnosis artifacts
            if (data.artifact_type === "weld_diagnosis_result" && imageDataUrl) {
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
              elapsedMs,
              stats,
              cost,
              turns,
            };
            return updated;
          });
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: "",
            blocks: [{ type: "text", text: `Error: ${err.message}` }],
          };
          return updated;
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }

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
            <div>
              <h1 className="text-sm font-semibold text-foreground tracking-tight">
                Vulcan OmniPro 220
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Technical support, built for garage hobbyists
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/graph"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              Knowledge Graph
            </a>

            {/* Hands-free toggle */}
            <button
              onClick={() => setHandsFree((v) => !v)}
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

            <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
              Built for Prox
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
                />
              );
            })}
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
                className="flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                title="Attach weld photo"
              >
                <ImagePlus size={16} />
              </button>

              {/* Mic button */}
              <button
                onClick={handleMicClick}
                disabled={!voice.supported || loading}
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
    </div>
  );
}
