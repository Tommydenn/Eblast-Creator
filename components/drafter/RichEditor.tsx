"use client";

import React, { useRef, useEffect, useState } from "react";

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface ToolbarProps {
  editorRef: React.RefObject<HTMLDivElement>;
  brandColors: string[];
  onInput: () => void;
}

export function FormatToolbar({ editorRef, brandColors, onInput }: ToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false);
  const colorPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (colorPanelRef.current && !colorPanelRef.current.contains(e.target as Node)) {
        setColorOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function exec(cmd: string, val?: string) {
    editorRef.current?.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(cmd, false, val);
    onInput();
  }

  const seenColors = new Set<string>();
  const presets = ["#1a1a1a", "#c0392b", "#2e86c1", "#27ae60", "#8e44ad"];
  const combined = [...brandColors, ...presets];
  const paletteColors: string[] = [];
  for (const c of combined) {
    const key = c.toLowerCase();
    if (!seenColors.has(key)) {
      seenColors.add(key);
      paletteColors.push(c);
    }
    if (paletteColors.length >= 8) break;
  }

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 bg-[#f5f3ef] rounded-t-lg border border-b-0 border-[#ddd8d0]">
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}
        className="w-7 h-6 rounded text-[13px] font-bold text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors"
        title="Bold"
      >
        B
      </button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}
        className="w-7 h-6 rounded text-[13px] italic text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors"
        style={{ fontFamily: "Georgia, serif" }}
        title="Italic"
      >
        I
      </button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}
        className="w-7 h-6 rounded text-[13px] underline text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors"
        title="Underline"
      >
        U
      </button>

      <div className="w-px h-4 bg-[#ddd8d0] mx-0.5" />

      <div className="relative" ref={colorPanelRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setColorOpen((v) => !v); }}
          className="w-7 h-6 rounded text-[13px] font-bold text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors flex items-center justify-center"
          title="Font color"
        >
          <span style={{ borderBottom: "2.5px solid #c0392b", lineHeight: 1 }}>A</span>
        </button>

        {colorOpen && (
          <div
            className="absolute top-full left-0 mt-1.5 flex flex-wrap gap-1.5 p-2.5 bg-white rounded-xl border border-[#e8e3dc] shadow-lg z-30"
            style={{ minWidth: 120 }}
          >
            {paletteColors.map((hex) => (
              <button
                key={hex}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); exec("foreColor", hex); setColorOpen(false); }}
                className="w-5 h-5 rounded-full ring-1 ring-black/10 hover:scale-125 transition-transform"
                style={{ backgroundColor: hex }}
                title={hex}
              />
            ))}
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); exec("foreColor", "#3A3A3A"); setColorOpen(false); }}
              className="w-5 h-5 rounded-full ring-1 ring-[#ddd8d0] bg-white hover:scale-125 transition-transform flex items-center justify-center"
              title="Reset to default"
            >
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#9aaba4" strokeWidth="1.5">
                <line x1="1" y1="1" x2="7" y2="7" />
                <line x1="7" y1="1" x2="1" y2="7" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-4 bg-[#ddd8d0] mx-0.5" />

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("removeFormat"); }}
        className="h-6 px-2 rounded text-[10px] font-medium text-[#9aaba4] hover:bg-white hover:text-[#5a6b63] transition-colors"
        title="Clear all formatting"
      >
        Clear
      </button>
    </div>
  );
}

// ── Rich body editor ──────────────────────────────────────────────────────────

interface RichBodyEditorProps {
  paragraphs: string[];
  onChange: (paras: string[]) => void;
  brandColors: string[];
}

export function RichBodyEditor({ paragraphs, onChange, brandColors }: RichBodyEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function toHtml(paras: string[]) {
    return paras.map((p) => "<div>" + (p || "<br>") + "</div>").join("");
  }

  function fromHtml(): string[] {
    const el = editorRef.current;
    if (!el) return [""];
    const divs = Array.from(el.querySelectorAll(":scope > div"));
    if (divs.length === 0) {
      const html = el.innerHTML.replace(/<br\s*\/?>/gi, "").trim();
      return html ? [html] : [""];
    }
    const paras = divs
      .map((d) => (d as HTMLElement).innerHTML.replace(/<br\s*\/?>$/i, "").trim())
      .filter((p) => p !== "" && p !== "<br>");
    return paras.length > 0 ? paras : [""];
  }

  useEffect(() => {
    if (editorRef.current) {
      document.execCommand("defaultParagraphSeparator", false, "div");
      editorRef.current.innerHTML = toHtml(paragraphs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extKey = paragraphs.join(" ");
  useEffect(() => {
    if (!isFocused.current && editorRef.current) {
      editorRef.current.innerHTML = toHtml(paragraphs);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extKey]);

  function handleInput() {
    onChangeRef.current(fromHtml());
  }

  return (
    <div>
      <FormatToolbar editorRef={editorRef} brandColors={brandColors} onInput={handleInput} />
      <div
        ref={editorRef}
        contentEditable={true}
        suppressContentEditableWarning={true}
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => { isFocused.current = false; handleInput(); }}
        onInput={handleInput}
        onPaste={(e) => {
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
        }}
        className="w-full rounded-b-lg border border-[#ddd8d0] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] transition-colors leading-relaxed"
        style={{ minHeight: 200, outline: "none" }}
      />
    </div>
  );
}
