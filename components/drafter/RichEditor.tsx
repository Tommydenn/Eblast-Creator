"use client";

import React, { useRef, useEffect, useState } from "react";

// ── Toolbar ───────────────────────────────────────────────────────────────────

interface ToolbarProps {
  editorRef: { current: HTMLDivElement | null };
  brandColors: string[];
  brandFonts: string[];
  onInput: () => void;
  className?: string;
}

export function FormatToolbar({ editorRef, brandColors, brandFonts, onInput, className }: ToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [hasEyeDropper, setHasEyeDropper] = useState(false);
  const colorPanelRef = useRef<HTMLDivElement>(null);
  const fontPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHasEyeDropper("EyeDropper" in window);
  }, []);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (colorPanelRef.current && !colorPanelRef.current.contains(e.target as Node)) setColorOpen(false);
      if (fontPanelRef.current && !fontPanelRef.current.contains(e.target as Node)) setFontOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function exec(cmd: string, val?: string) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand("styleWithCSS", false, "true");
    document.execCommand(cmd, false, val);
    onInput();
  }

  async function eyedrop() {
    try {
      const result = await new (window as any).EyeDropper().open();
      exec("foreColor", result.sRGBHex);
      setColorOpen(false);
    } catch { /* cancelled */ }
  }

  // Color sections: brand colors (up to 3) + basic palette
  const brandSection = brandColors.slice(0, 3);
  const basicColors = ["#1a1a1a", "#ffffff", "#c0392b", "#2e86c1", "#27ae60", "#f39c12", "#8e44ad"];

  // Font options: community brand fonts first, then standard
  const standardFonts = ["Arial", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS"];
  const seenFonts = new Set<string>();
  const fontOptions: Array<{ name: string; label: string; isBrand: boolean }> = [];
  for (const f of brandFonts) {
    const key = f.toLowerCase();
    if (!seenFonts.has(key)) {
      seenFonts.add(key);
      fontOptions.push({ name: f, label: f.split(",")[0].trim(), isBrand: true });
    }
  }
  for (const f of standardFonts) {
    const key = f.toLowerCase();
    if (!seenFonts.has(key)) {
      seenFonts.add(key);
      fontOptions.push({ name: f, label: f, isBrand: false });
    }
  }

  return (
    <div className={className ?? "flex items-center gap-0.5 px-2 py-1.5 bg-[#f5f3ef] rounded-t-lg border border-b-0 border-[#ddd8d0] flex-wrap"}>
      {/* Bold / Italic / Underline */}
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}
        className="w-7 h-6 rounded text-[13px] font-bold text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors"
        title="Bold"
      >B</button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}
        className="w-7 h-6 rounded text-[13px] italic text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors"
        style={{ fontFamily: "Georgia, serif" }}
        title="Italic"
      >I</button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}
        className="w-7 h-6 rounded text-[13px] underline text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors"
        title="Underline"
      >U</button>

      <div className="w-px h-4 bg-[#ddd8d0] mx-0.5" />

      {/* Color picker */}
      <div className="relative" ref={colorPanelRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setColorOpen((v) => !v); setFontOpen(false); }}
          className="w-7 h-6 rounded text-[13px] font-bold text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors flex items-center justify-center"
          title="Font color"
        >
          <span style={{ borderBottom: "2.5px solid #c0392b", lineHeight: 1 }}>A</span>
        </button>

        {colorOpen && (
          <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-[#e8e3dc] shadow-lg z-30 p-2.5 w-44">
            {brandSection.length > 0 && (
              <>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9aaba4] mb-1.5">Brand colors</p>
                <div className="flex gap-1.5 mb-2.5">
                  {brandSection.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); exec("foreColor", hex); setColorOpen(false); }}
                      className="w-6 h-6 rounded-full ring-1 ring-black/10 hover:scale-125 transition-transform"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              </>
            )}

            <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9aaba4] mb-1.5">Standard</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {basicColors.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); exec("foreColor", hex); setColorOpen(false); }}
                  className={`w-6 h-6 rounded-full hover:scale-125 transition-transform ${
                    hex === "#ffffff" ? "ring-1 ring-[#ddd8d0]" : "ring-1 ring-black/10"
                  }`}
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))}
            </div>

            {hasEyeDropper && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); eyedrop(); }}
                className="w-full flex items-center gap-1.5 text-[10px] text-[#7a8c85] hover:text-[#1F4538] px-1 py-1.5 rounded hover:bg-[#f0f5f2] transition-colors border-t border-[#f0ede7] mt-1"
                title="Pick color from screen"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 22l10-10M20.5 3.5a2.121 2.121 0 0 0-3 0l-1 1-3-3 1-1a2.121 2.121 0 0 1 3 0z"/>
                  <path d="M15 8l-9 9 3 3 9-9"/>
                </svg>
                Eyedropper
              </button>
            )}

            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); exec("foreColor", "#3A3A3A"); setColorOpen(false); }}
              className="w-full flex items-center gap-1.5 text-[10px] text-[#9aaba4] hover:text-[#5a6b63] px-1 py-1 rounded hover:bg-[#f5f3ef] transition-colors mt-0.5"
              title="Reset to default"
            >
              <svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
              </svg>
              Reset color
            </button>
          </div>
        )}
      </div>

      {/* Font family picker */}
      <div className="relative" ref={fontPanelRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setFontOpen((v) => !v); setColorOpen(false); }}
          className="h-6 px-2 rounded text-[10px] font-medium text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors flex items-center gap-1"
          title="Font family"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="4 7 4 4 20 4 20 7"/>
            <line x1="9" y1="20" x2="15" y2="20"/>
            <line x1="12" y1="4" x2="12" y2="20"/>
          </svg>
          Font
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </button>

        {fontOpen && (
          <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-[#e8e3dc] shadow-lg z-30 overflow-hidden w-48">
            {fontOptions.map((f) => (
              <button
                key={f.name}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); exec("fontName", f.name); setFontOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#f0f5f2] transition-colors flex items-center justify-between border-b border-[#f5f3ef] last:border-0"
                style={{ fontFamily: f.name }}
              >
                <span className="truncate">{f.label}</span>
                {f.isBrand && (
                  <span className="text-[9px] text-[#1F4538] font-semibold uppercase tracking-wider ml-2 shrink-0">Brand</span>
                )}
              </button>
            ))}
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
  brandFonts: string[];
}

export function RichBodyEditor({ paragraphs, onChange, brandColors, brandFonts }: RichBodyEditorProps) {
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
      <FormatToolbar editorRef={editorRef} brandColors={brandColors} brandFonts={brandFonts} onInput={handleInput} />
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
