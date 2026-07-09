"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { useDraft } from "@/context/DraftContext";
import {
  applyFormat,
  queryFormatState,
  serializeInline,
  serializeBlocks,
  normalizeInlineHtml,
  blocksToHtml,
  setPendingToggle,
  getPending,
  clearPending,
  insertTextWithPending,
  type FormatCommand,
  type FormatState,
  type ToggleType,
} from "@/lib/rich-text/inline-format";

// ── shared editor wiring ────────────────────────────────────────────────────────
// Both the single-line field and the multi-paragraph body register themselves as
// the "active editor" on focus, so the one shared toolbar (mounted above the
// preview) targets whichever field the user is editing.

interface ActiveEditorProps {
  activeEditorRef: React.MutableRefObject<HTMLDivElement | null>;
  activeEditorCallback: React.MutableRefObject<(() => void) | null>;
  activeFieldNameRef: React.MutableRefObject<string | null>;
  fieldName: string;
}

// Insert plain text at the current selection (paste / typing fallback). Never
// inserts HTML, so pasted markup can't leak in as literal tags.
function insertPlainText(text: string, singleLine: boolean) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const clean = singleLine ? text.replace(/[\r\n]+/g, " ") : text.replace(/\r\n/g, "\n");
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(clean);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// Shared native-event wiring for a contentEditable region: pending-mark aware
// typing, plain-text paste, and pending cleanup on caret navigation.
function useEditorEvents(
  ref: React.RefObject<HTMLDivElement>,
  singleLine: boolean,
  serialize: () => void,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onBeforeInput = (e: InputEvent) => {
      if (e.isComposing) return;
      if (e.inputType === "insertText" && e.data && getPending(el)) {
        if (insertTextWithPending(el, e.data)) {
          e.preventDefault();
          serialize();
        }
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      insertPlainText(text, singleLine);
      serialize();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (singleLine && e.key === "Enter") {
        e.preventDefault();
        return;
      }
      // Caret navigation abandons any queued pending marks.
      if (
        e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" ||
        e.key === "ArrowDown" || e.key === "Home" || e.key === "End" || e.key === "Escape"
      ) {
        clearPending(el);
      }
    };

    el.addEventListener("beforeinput", onBeforeInput as EventListener);
    el.addEventListener("paste", onPaste as EventListener);
    el.addEventListener("keydown", onKeyDown as EventListener);
    return () => {
      el.removeEventListener("beforeinput", onBeforeInput as EventListener);
      el.removeEventListener("paste", onPaste as EventListener);
      el.removeEventListener("keydown", onKeyDown as EventListener);
    };
  }, [ref, singleLine, serialize]);
}

// Plain text of an HTML string (tags stripped, nbsp normalized).
function plainFromHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/ /g, " ");
}

function placeCaretEnd(el: HTMLElement) {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

// ── RichInput — single-line rich field ──────────────────────────────────────────

interface RichInputProps extends ActiveEditorProps {
  value: string;
  onValueChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  /**
   * Optional constraint on the field's plain text. When it returns false for an
   * edit, that edit is reverted (formatting is unaffected because it doesn't
   * change the text). Used to lock the tracking number into the call button.
   */
  guardPlain?: (plainText: string) => boolean;
}

export function RichInput({
  value,
  onValueChange,
  placeholder,
  className,
  activeEditorRef,
  activeEditorCallback,
  activeFieldNameRef,
  fieldName,
  guardPlain,
}: RichInputProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  const guardRef = useRef(guardPlain);
  guardRef.current = guardPlain;
  // What we last handed upward — lets the external-sync effect ignore our own
  // echoed change so the field never re-renders (and loses caret) from its own
  // edit, even when a focus-stealing control (font size / hex input) applied it.
  const lastEmitted = useRef<string | null>(null);
  // Last accepted live innerHTML, restored when a guarded edit is rejected.
  const lastGoodHtml = useRef<string>("");

  const serialize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const html = serializeInline(el);
    const guard = guardRef.current;
    if (guard && !guard(plainFromHtml(el.innerHTML))) {
      el.innerHTML = lastGoodHtml.current;
      placeCaretEnd(el);
      return;
    }
    lastGoodHtml.current = el.innerHTML;
    lastEmitted.current = html;
    onValueChangeRef.current(html);
  }, []);

  // Initial content.
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = normalizeInlineHtml(value ?? "");
      lastGoodHtml.current = ref.current.innerHTML;
      lastEmitted.current = serializeInline(ref.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync genuine external changes (AI refine, undo/redo, changed defaults) —
  // never while the user types, and never for our own echoed output.
  useEffect(() => {
    if (isFocused.current || !ref.current) return;
    if (value === lastEmitted.current) return;
    ref.current.innerHTML = normalizeInlineHtml(value ?? "");
    lastGoodHtml.current = ref.current.innerHTML;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEditorEvents(ref, true, serialize);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder ?? ""}
      onFocus={() => {
        isFocused.current = true;
        activeEditorRef.current = ref.current;
        activeEditorCallback.current = serialize;
        activeFieldNameRef.current = fieldName;
      }}
      onBlur={() => {
        isFocused.current = false;
        if (ref.current) clearPending(ref.current);
        serialize();
      }}
      onInput={serialize}
      className={`rich-input-display${className ? ` ${className}` : ""}`}
      style={{ outline: "none", minHeight: "2rem" }}
    />
  );
}

// ── RichBodyEditor — multi-paragraph body ───────────────────────────────────────

interface RichBodyEditorProps extends ActiveEditorProps {
  paragraphs: string[];
  onChange: (paras: string[]) => void;
  className?: string;
}

export function RichBodyEditor({
  paragraphs,
  onChange,
  className,
  activeEditorRef,
  activeEditorCallback,
  activeFieldNameRef,
  fieldName,
}: RichBodyEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const lastEmitted = useRef<string | null>(null);
  const serialize = useCallback(() => {
    if (!ref.current) return;
    const paras = serializeBlocks(ref.current);
    lastEmitted.current = paras.join(" ");
    onChangeRef.current(paras);
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = blocksToHtml(paragraphs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const extKey = paragraphs.join(" ");
  useEffect(() => {
    if (isFocused.current || !ref.current) return;
    if (extKey === lastEmitted.current) return;
    ref.current.innerHTML = blocksToHtml(paragraphs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extKey]);

  useEditorEvents(ref, false, serialize);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => {
        isFocused.current = true;
        activeEditorRef.current = ref.current;
        activeEditorCallback.current = serialize;
        activeFieldNameRef.current = fieldName;
      }}
      onBlur={() => {
        isFocused.current = false;
        if (ref.current) clearPending(ref.current);
        serialize();
      }}
      onInput={serialize}
      className={`rich-body-display ${
        className ??
        "w-full rounded-lg border border-[#ddd8d0] bg-white px-3 py-2.5 text-sm text-[#1a1a1a] focus:outline-none focus:ring-2 focus:ring-[#1F4538]/30 focus:border-[#1F4538] transition-colors leading-relaxed"
      }`}
      style={{ minHeight: 200, outline: "none" }}
    />
  );
}

// ── Call button field — editable label words, locked tracking number ────────────

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const m = digits.match(/^1?(\d{3})(\d{3})(\d{4})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : raw;
}
const PHONE_RE = /\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;

/**
 * The call button is a fully formattable rich field that includes the tracking
 * number as text. The digits are locked: any edit that removes the number from
 * the text is reverted (formatting never changes the text, so bold/italic/color/
 * font/size all apply freely — including to the number). If the community has no
 * tracking number, it behaves like a normal rich field.
 */
export function CallButtonField({
  value: rawValue,
  onValueChange,
  fieldName,
  className,
  activeEditorRef,
  activeEditorCallback,
  activeFieldNameRef,
}: {
  /** Raw stored value for this specific call-button field (caller resolves any fallback, e.g. `fields.finalCtaButtonLabel ?? fields.ctaButtonLabel`). */
  value: string;
  onValueChange: (html: string) => void;
  fieldName: string;
  className?: string;
} & Omit<ActiveEditorProps, "fieldName">) {
  const { community } = useDraft();
  const tracking = community?.trackingPhone ?? null;
  const formatted = tracking ? formatPhone(tracking) : null;

  const stored = rawValue ?? "";

  // The value shown in the box always contains the correct tracking number,
  // reconciling any legacy/placeholder number without a write until the user edits.
  const value = (() => {
    if (!formatted) return stored || "Call Us";
    const plain = stored.replace(/<[^>]+>/g, "");
    if (stored && plain.includes(formatted)) return stored;
    if (stored && PHONE_RE.test(plain)) return stored.replace(PHONE_RE, formatted);
    if (stored) return `${stored} ${formatted}`;
    return `Call ${formatted}`;
  })();

  const guardPlain = formatted ? (t: string) => t.includes(formatted) : undefined;

  return (
    <div>
      <RichInput
        value={value}
        onValueChange={onValueChange}
        guardPlain={guardPlain}
        placeholder="e.g. Call 920.504.3443"
        className={className}
        activeEditorRef={activeEditorRef}
        activeEditorCallback={activeEditorCallback}
        activeFieldNameRef={activeFieldNameRef}
        fieldName={fieldName}
      />
      {formatted && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#7a8c85]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span><span className="font-semibold text-[#5a6b63]">{formatted}</span> is locked — you can format it, but the digits can&rsquo;t be changed.</span>
        </div>
      )}
    </div>
  );
}

// ── Toolbar ─────────────────────────────────────────────────────────────────────

// Default font sizes as rendered in the email template, keyed by field name.
// Every editable field must appear here so the toolbar's px box shows the
// default size as a reference when the selection has no explicit size.
const FIELD_FONT_SIZES: Record<string, number> = {
  headline: 36,
  scriptSubheadline: 36,
  eventDate: 22,
  eventTime: 22,
  rsvpLabel: 11,
  storyEyebrow: 11,
  storyScriptTitle: 38,
  bodyParagraphs: 15,
  ctaEventDate: 28,
  ctaEventTime: 28,
  ctaRsvpLabel: 11,
  footerName: 14,
  thankYouText: 26,
  heroAddress: 12,
  galleryLabel: 11,
  ctaButtonLabel: 14,
  finalCtaButtonLabel: 14,
  footerButtonLabel: 13,
};

// Formatting the email template forces on a field's container. The toolbar uses
// these so a single click toggles the field's default off, and turning a toggle
// off writes the explicit neutral value that overrides the template.
const FIELD_DEFAULTS: Record<string, { bold?: boolean; italic?: boolean }> = {
  storyEyebrow: { bold: true },
  galleryLabel: { bold: true },
  ctaButtonLabel: { bold: true },
  finalCtaButtonLabel: { bold: true },
  footerButtonLabel: { bold: true },
  scriptSubheadline: { italic: true },
  storyScriptTitle: { italic: true },
};

interface ToolbarProps {
  editorRef: { current: HTMLDivElement | null };
  brandColors: string[];
  brandFonts: string[];
  onInput: () => void;
  activeFieldNameRef?: React.MutableRefObject<string | null>;
  className?: string;
}

const EMPTY_STATE: FormatState = {
  bold: false,
  italic: false,
  underline: false,
  color: null,
  fontFamily: null,
  fontSize: null,
};

export function FormatToolbar({
  editorRef,
  brandColors,
  brandFonts,
  onInput,
  activeFieldNameRef,
  className,
}: ToolbarProps) {
  const [colorOpen, setColorOpen] = useState(false);
  const [fontOpen, setFontOpen] = useState(false);
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [hexInput, setHexInput] = useState("");
  const [fontSizeInput, setFontSizeInput] = useState("");
  const [state, setState] = useState<FormatState>(EMPTY_STATE);
  const colorPanelRef = useRef<HTMLDivElement>(null);
  const fontPanelRef = useRef<HTMLDivElement>(null);
  const fontSizeInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("eblast_custom_colors");
      if (saved) setCustomColors(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (colorPanelRef.current && !colorPanelRef.current.contains(e.target as Node)) setColorOpen(false);
      if (fontPanelRef.current && !fontPanelRef.current.contains(e.target as Node)) setFontOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Reflect the current selection's formatting in the toolbar (active states +
  // font size/family read-outs) so it behaves like a real word processor.
  useEffect(() => {
    function refresh() {
      if (document.activeElement === fontSizeInputRef.current) return;
      const el = editorRef.current;
      if (!el || !el.isConnected) {
        setState(EMPTY_STATE);
        return;
      }
      const st = queryFormatState(el, getPending(el), fieldDefaults());
      setState(st);
      const fieldName = activeFieldNameRef?.current;
      const fallback = fieldName ? FIELD_FONT_SIZES[fieldName] : undefined;
      setFontSizeInput(st.fontSize != null ? String(st.fontSize) : fallback != null ? String(fallback) : "");
    }
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, [editorRef, activeFieldNameRef]);

  // Template-forced formatting for whichever field is currently focused.
  function fieldDefaults(): { bold?: boolean; italic?: boolean } | undefined {
    const fieldName = activeFieldNameRef?.current;
    return fieldName ? FIELD_DEFAULTS[fieldName] : undefined;
  }

  function run(cmd: FormatCommand, savedRange?: Range | null) {
    const el = editorRef.current;
    if (!el) return;
    applyFormat(el, cmd, savedRange ?? undefined, fieldDefaults());
    onInput();
    setState(queryFormatState(el, getPending(el), fieldDefaults()));
  }

  // Bold / Italic / Underline: toggle on a selection, or queue a pending mark
  // when the caret is collapsed (type-then-it's-bold behavior).
  function toggle(type: ToggleType) {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const collapsed = !sel || sel.rangeCount === 0 || sel.getRangeAt(0).collapsed;
    if (collapsed) {
      setPendingToggle(el, type, fieldDefaults());
      setState(queryFormatState(el, getPending(el), fieldDefaults()));
    } else {
      run({ type });
    }
  }

  function execColor(hex: string) {
    run({ type: "color", value: hex }, savedSelectionRef.current);
  }

  function addCustomColor(hex: string) {
    setCustomColors((prev) => {
      const next = [hex, ...prev.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, 10);
      try {
        localStorage.setItem("eblast_custom_colors", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function applyHexColor() {
    let hex = hexInput.trim();
    if (!hex.startsWith("#")) hex = "#" + hex;
    if (!/^#[0-9A-Fa-f]{3}$/.test(hex) && !/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    addCustomColor(hex);
    execColor(hex);
    setColorOpen(false);
    setHexInput("");
  }

  function applyFontFamily(fontFamily: string) {
    run({ type: "fontFamily", value: fontFamily }, savedSelectionRef.current);
  }

  function applyFontSize(px: number) {
    run({ type: "fontSize", value: px }, savedSelectionRef.current);
  }

  // Preserve the editor selection when focus moves to the font-size/hex inputs
  // (real <input>s steal focus and would otherwise collapse the selection).
  function saveSelection() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.getRangeAt(0).collapsed) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  }

  const uniqueColors: string[] = [];
  const seenColors = new Set<string>();
  for (const c of brandColors) {
    if (c && !seenColors.has(c.toLowerCase())) {
      seenColors.add(c.toLowerCase());
      uniqueColors.push(c);
    }
  }
  const basicColors = ["#1a1a1a", "#ffffff", "#c0392b", "#2e86c1", "#27ae60", "#f39c12", "#8e44ad"];

  const SCRIPT_FONT = "'Brush Script MT', 'Lucida Handwriting', cursive";
  const standardFonts = ["Arial", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS"];
  const seenFonts = new Set<string>();
  const fontOptions: Array<{ name: string; label: string; isBrand: boolean; isScript?: boolean }> = [];
  for (const f of brandFonts) {
    const key = f.toLowerCase();
    if (!seenFonts.has(key)) {
      seenFonts.add(key);
      fontOptions.push({ name: f, label: f.split(",")[0].trim().replace(/['"]/g, ""), isBrand: true });
    }
  }
  if (!seenFonts.has(SCRIPT_FONT.toLowerCase())) {
    seenFonts.add(SCRIPT_FONT.toLowerCase());
    fontOptions.push({ name: SCRIPT_FONT, label: "Script / Cursive", isBrand: false, isScript: true });
  }
  for (const f of standardFonts) {
    const key = f.toLowerCase();
    if (!seenFonts.has(key)) {
      seenFonts.add(key);
      fontOptions.push({ name: f, label: f, isBrand: false });
    }
  }

  const btn = (active: boolean, extra = "") =>
    `w-7 h-6 rounded text-[13px] transition-colors ${
      active ? "bg-[#1F4538] text-white" : "text-[#5a6b63] hover:bg-white hover:text-[#1F4538]"
    } ${extra}`;

  return (
    <div className={className ?? "flex items-center gap-0.5 px-2 py-1.5 bg-[#f5f3ef] rounded-t-lg border border-b-0 border-[#ddd8d0] flex-wrap"}>
      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); toggle("bold"); }}
        className={btn(state.bold, "font-bold")}
        title="Bold"
      >B</button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); toggle("italic"); }}
        className={btn(state.italic, "italic")}
        style={{ fontFamily: "Georgia, serif" }}
        title="Italic"
      >I</button>

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); toggle("underline"); }}
        className={btn(state.underline, "underline")}
        title="Underline"
      >U</button>

      <div className="w-px h-4 bg-[#ddd8d0] mx-0.5" />

      {/* Color picker */}
      <div className="relative" ref={colorPanelRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); setColorOpen((v) => !v); setFontOpen(false); }}
          className="w-7 h-6 rounded text-[13px] font-bold text-[#5a6b63] hover:bg-white hover:text-[#1F4538] transition-colors flex items-center justify-center"
          title="Font color"
        >
          <span style={{ borderBottom: `2.5px solid ${state.color ?? "#c0392b"}`, lineHeight: 1 }}>A</span>
        </button>

        {colorOpen && (
          <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-[#e8e3dc] shadow-lg z-30 p-2.5 w-52">
            {customColors.length > 0 && (
              <>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9aaba4] mb-1.5">Custom</p>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {customColors.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); execColor(hex); setColorOpen(false); }}
                      className="w-6 h-6 rounded-full ring-1 ring-black/10 hover:scale-125 transition-transform"
                      style={{ backgroundColor: hex }}
                      title={hex}
                    />
                  ))}
                </div>
              </>
            )}

            {uniqueColors.length > 0 && (
              <>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-[#9aaba4] mb-1.5">Brand colors</p>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {uniqueColors.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); execColor(hex); setColorOpen(false); }}
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
                  onMouseDown={(e) => { e.preventDefault(); execColor(hex); setColorOpen(false); }}
                  className={`w-6 h-6 rounded-full hover:scale-125 transition-transform ${
                    hex === "#ffffff" ? "ring-1 ring-[#ddd8d0]" : "ring-1 ring-black/10"
                  }`}
                  style={{ backgroundColor: hex }}
                  title={hex}
                />
              ))}
            </div>

            <div className="flex items-center gap-1 mt-2 border-t border-[#f0ede7] pt-2">
              <input
                type="text"
                placeholder="#hex"
                value={hexInput}
                onChange={(e) => setHexInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyHexColor(); } }}
                className="flex-1 text-[10px] border border-[#ddd8d0] rounded px-1.5 py-1 outline-none focus:border-[#1F4538] text-[#1a1a1a]"
                style={{ minWidth: 0 }}
              />
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); applyHexColor(); }}
                className="text-[10px] px-1.5 py-1 rounded bg-[#f0f5f2] text-[#1F4538] font-medium hover:bg-[#ddeee6] transition-colors shrink-0"
              >Apply</button>
            </div>

            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); execColor(""); setColorOpen(false); }}
              className="w-full flex items-center gap-1.5 text-[10px] text-[#9aaba4] hover:text-[#5a6b63] px-1 py-1 rounded hover:bg-[#f5f3ef] transition-colors mt-0.5"
              title="Reset to default color"
            >
              <svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
              </svg>
              Reset color
            </button>
          </div>
        )}
      </div>

      {/* Font family */}
      <div className="relative" ref={fontPanelRef}>
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); saveSelection(); setFontOpen((v) => !v); setColorOpen(false); }}
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
          <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-[#e8e3dc] shadow-lg z-30 overflow-hidden w-52">
            {fontOptions.map((f) => (
              <button
                key={f.name}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); applyFontFamily(f.name); setFontOpen(false); }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#f0f5f2] transition-colors flex items-center justify-between border-b border-[#f5f3ef] last:border-0"
                style={{ fontFamily: f.name }}
              >
                <span className="truncate">{f.label}</span>
                {f.isBrand && (
                  <span className="text-[9px] text-[#1F4538] font-semibold uppercase tracking-wider ml-2 shrink-0">Brand</span>
                )}
                {f.isScript && (
                  <span className="text-[9px] text-[#9aaba4] font-semibold uppercase tracking-wider ml-2 shrink-0">Email</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Font size */}
      <input
        ref={fontSizeInputRef}
        type="number"
        min={6}
        max={120}
        value={fontSizeInput}
        placeholder="px"
        onChange={(e) => setFontSizeInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const px = parseInt(fontSizeInput, 10);
            if (!isNaN(px) && px >= 6 && px <= 120) applyFontSize(px);
          }
        }}
        onBlur={() => {
          const px = parseInt(fontSizeInput, 10);
          if (!isNaN(px) && px >= 6 && px <= 120) applyFontSize(px);
        }}
        onMouseDown={(e) => { saveSelection(); e.stopPropagation(); }}
        className="w-14 h-6 text-center text-[11px] border border-[#ddd8d0] rounded bg-white text-[#1a1a1a] outline-none focus:border-[#1F4538] focus:ring-1 focus:ring-[#1F4538]/20"
        title="Font size (px) — shows the current selection's size; type to change"
      />

      <div className="w-px h-4 bg-[#ddd8d0] mx-0.5" />

      <button
        type="button"
        onMouseDown={(e) => { e.preventDefault(); run({ type: "clear" }); }}
        className="h-6 px-2 rounded text-[10px] font-medium text-[#9aaba4] hover:bg-white hover:text-[#5a6b63] transition-colors"
        title="Clear all formatting"
      >
        Clear
      </button>
    </div>
  );
}
