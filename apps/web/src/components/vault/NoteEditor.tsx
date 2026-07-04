"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useVaultNote, useSaveNote } from "@/hooks/useVault";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// CodeMirror 6 imports
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, ViewUpdate, Decoration, DecorationSet, ViewPlugin } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";

// Wikilink decoration: highlights [[...]] spans in the editor
const wikilinkMark = Decoration.mark({ class: "cm-wikilink" });

const wikilinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }
    buildDecorations(view: EditorView): DecorationSet {
      const ranges: ReturnType<typeof wikilinkMark.range>[] = [];
      const re = /\[\[([^\]]+)]]/g;
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.sliceDoc(from, to);
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          ranges.push(wikilinkMark.range(from + m.index, from + m.index + m[0].length));
        }
      }
      return Decoration.set(ranges, true);
    }
  },
  { decorations: (v) => v.decorations },
);

// Dark theme for the editor
const darkTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: "#e5e7eb", height: "100%" },
    ".cm-content": { caretColor: "#a5b4fc", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: "14px", lineHeight: "1.75", padding: "16px" },
    ".cm-cursor": { borderLeftColor: "#a5b4fc" },
    ".cm-selectionBackground": { backgroundColor: "#3730a3" },
    "&.cm-focused .cm-selectionBackground": { backgroundColor: "#4338ca" },
    ".cm-activeLine": { backgroundColor: "#1f2937" },
    ".cm-wikilink": { color: "#818cf8", textDecoration: "underline", cursor: "pointer" },
    ".cm-gutters": { backgroundColor: "#111827", borderRight: "1px solid #1f2937", color: "#4b5563" },
  },
  { dark: true },
);

interface NoteEditorProps {
  notePath: string;
  onNavigate: (path: string) => void;
}

export function NoteEditor({ notePath, onNavigate }: NoteEditorProps) {
  const { data: note, isLoading } = useVaultNote(notePath);
  const saveNote = useSaveNote();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [preview, setPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = useCallback(
    async (content: string) => {
      setIsSaving(true);
      try {
        await saveNote.mutateAsync({ path: notePath, content });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("error");
      } finally {
        setIsSaving(false);
      }
    },
    [notePath, saveNote],
  );

  const scheduleSave = useCallback(
    (content: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => handleSave(content), 800);
    },
    [handleSave],
  );

  // Initialise/destroy CodeMirror when path changes
  useEffect(() => {
    if (!editorRef.current || !note) return;

    const clickHandler = EditorView.domEventHandlers({
      click(e, view) {
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null) return false;
        const line = view.state.doc.lineAt(pos);
        const text = line.text;
        const re = /\[\[([^\]]+)]]/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const start = line.from + m.index;
          const end = start + m[0].length;
          if (pos >= start && pos <= end && m[1]) {
            const target = m[1].trim();
            const path = target.endsWith(".md") ? target : `${target}.md`;
            onNavigate(path);
            return true;
          }
        }
        return false;
      },
    });

    const state = EditorState.create({
      doc: note.body,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        wikilinkPlugin,
        darkTheme,
        clickHandler,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            scheduleSave(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notePath, note?.body !== undefined ? note.body.slice(0, 20) : ""]); // reinit when path or initial content changes

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Loading…
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center h-full text-gray-600 text-sm">
        Note not found: {notePath}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#131c30] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-[13px] font-semibold text-[#e2e8f4] truncate">{note.title}</h2>
          <span className="font-mono text-[10px] text-[#3d5070] truncate">{notePath}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className={[
              "text-[11px] transition-opacity",
              saveStatus === "saved" ? "text-emerald-400 opacity-100"
                : saveStatus === "error" ? "text-red-400 opacity-100"
                  : isSaving ? "text-[#3d5070] opacity-100"
                    : "opacity-0",
            ].join(" ")}
          >
            {saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Error" : "Saving…"}
          </span>
          <button
            onClick={() => setPreview((p) => !p)}
            className={[
              "rounded-md px-2.5 py-1 text-[11px] font-medium border transition-colors",
              preview
                ? "border-blue-600/40 text-blue-300 bg-blue-600/15"
                : "border-[#1e2a40] text-[#7d92ad] hover:border-[#2d3d57] hover:text-[#e2e8f4]",
            ].join(" ")}
          >
            {preview ? "Edit" : "Preview"}
          </button>
        </div>
      </div>

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="flex gap-1 flex-wrap px-3 py-1.5 border-b border-[#131c30] flex-shrink-0">
          {note.tags.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-950/40 text-blue-300 border border-blue-900/40">
              #{t}
            </span>
          ))}
        </div>
      )}

      {/* Editor / Preview */}
      <div className="flex-1 overflow-hidden">
        {preview ? (
          <div className="h-full overflow-y-auto p-6">
            <article className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body}</ReactMarkdown>
            </article>
          </div>
        ) : (
          <div ref={editorRef} className="h-full overflow-auto" />
        )}
      </div>
    </div>
  );
}
