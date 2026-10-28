"use client";

import React, { useEffect, useState } from "react";
import { useDraft } from "@/context/DraftContext";
import { orderedSections } from "@/lib/eblast-blocks";
import { OUTLINE_SCOPE, OUTLINE_WITHOUT_FIELDS } from "@/lib/editor-outline";
import { FormatToolbar } from "@/components/drafter/RichEditor";
import { SectionGroup } from "@/components/drafter/SectionGroup";
import { quiet } from "@/components/drafter/ui";
import SubjectSection from "./sections/SubjectSection";
import HeroSection from "./sections/HeroSection";
import StorySection from "./sections/StorySection";
import CtaSection, { FooterSection } from "./sections/CtaSection";
import { ImagePickerHost, SecondaryImageSection, GallerySection } from "./sections/ImagesSection";

/**
 * The sidebar: the email's outline, and the fields of whichever part of it is
 * open.
 *
 * It used to be five tabs — Subject, Hero, Story, Images, Footer — over an
 * email that has seven sections. The names did not line up with anything: the
 * Hero tab held the Header too, the Footer tab held the Call to Action as
 * well, and the photos were gathered onto a tab of their own, so the hero
 * photo was edited two tabs away from the headline it sits above. The shape of
 * the email appeared nowhere, which is why rearranging its sections needed a
 * separate collapsed list at the top of the panel.
 *
 * Now there is one list, and it is the email: every section, in the order it
 * is drawn, opened and hidden and moved in the same row. The separate order
 * list is gone, and each photo is edited inside the section it belongs to.
 */

export default function EditorPanel({ onResetColors }: { onResetColors: () => void }) {
  const {
    fields, setField, community, activeSection, setActiveSection,
    activeEditorRef, activeEditorCallback, activeFieldNameRef,
  } = useDraft();
  const [open, setOpen] = useState<string>("Hero");

  // Opening a section is what points the AI at it. One section is open at a
  // time, so "the part you are working on" is never a guess.
  useEffect(() => {
    const scope = OUTLINE_SCOPE[open];
    if (scope && scope !== activeSection) setActiveSection(scope);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Clicking a section in the preview opens it here. The preview names the
  // section it was clicked in rather than which of the AI's coarser scopes it
  // falls into — otherwise clicking the Header and clicking the Hero would
  // both have opened the Hero.
  useEffect(() => {
    const onOpenSection = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name && OUTLINE_SCOPE[name]) setOpen(name);
    };
    window.addEventListener("eblast:open-section", onOpenSection);
    return () => window.removeEventListener("eblast:open-section", onOpenSection);
  }, []);

  if (!fields) return null;

  /** What each section of the email puts in the panel when it is opened. */
  const body: Record<string, React.ReactNode> = {
    Hero: <HeroSection />,
    Story: <StorySection />,
    "Secondary Image": <SecondaryImageSection />,
    "Photo Gallery": <GallerySection />,
    "Call to Action": <CtaSection />,
    Footer: <FooterSection />,
  };

  const sections = orderedSections(fields);
  const rearranged = !!fields.sectionOrder?.length;

  const move = (from: string, onto: string, before: boolean) => {
    const names = sections.map((s) => s.name).filter((n) => n !== from);
    const at = names.indexOf(onto);
    if (at === -1) return;
    names.splice(before ? at : at + 1, 0, from);
    setField("sectionOrder", names);
  };

  // All brand colors: primary, accent, background, secondary, plus supporting[]
  const brandColors = [
    community?.brand?.primary,
    community?.brand?.accent,
    community?.brand?.background,
    community?.brand?.secondary,
    ...(community?.brand?.supporting ?? []),
  ].filter(Boolean) as string[];

  // Brand fonts: headline + body from community profile
  const brandFonts = [
    community?.brand?.fontHeadline,
    community?.brand?.fontBody,
    community?.brand?.fonts?.script?.name,
  ].filter(Boolean) as string[];

  return (
    // The photo picker and the repositioning window are mounted once, around
    // the whole panel. They are what lets the three photo slots live in three
    // different sections: whichever one opens the picker, it is the same one.
    <ImagePickerHost>
      <div className="flex h-full flex-col border-r border-[#e8e3dc] bg-[#faf9f6]">
        {/* The formatting toolbar, over the fields it formats. It used to sit
            above the preview, on the far side of the window from the words it
            acts on — you selected text here and reached across the email to
            make it bold. It stays outside the scrolling list because its
            colour and font menus open downwards, and inside the list they
            would be clipped by it. */}
        <div className="shrink-0 border-b border-[#e8e3dc] bg-white px-3 py-1.5">
          <FormatToolbar
            editorRef={activeEditorRef}
            brandColors={brandColors}
            brandFonts={brandFonts}
            onInput={() => activeEditorCallback.current?.()}
            activeFieldNameRef={activeFieldNameRef}
            className="flex flex-wrap items-center gap-x-0.5 gap-y-1"
          />
        </div>

        <div className="eb-scroll flex-1 overflow-y-auto">
          {/* The subject line is the envelope, not the email: there is nothing
              in it to hide and nowhere in the order to move it to, so it is
              pinned above the outline rather than listed inside it. */}
          <SectionGroup
            name="Subject"
            fixed
            open={open === "Subject"}
            onOpen={() => setOpen((o) => (o === "Subject" ? "" : "Subject"))}
            onMove={move}
          >
            <SubjectSection />
          </SectionGroup>

          <div className="border-b-4 border-[#f0ede7]" aria-hidden />

          {sections.map((section) => (
            <SectionGroup
              key={section.name}
              name={section.name}
              flag={section.flag}
              empty={OUTLINE_WITHOUT_FIELDS.includes(section.name)}
              open={open === section.name}
              onOpen={() => setOpen((o) => (o === section.name ? "" : section.name))}
              onMove={move}
            >
              {body[section.name]}
            </SectionGroup>
          ))}

          {/* The two things that put the whole eblast back as it was found.
              Both undo a lot of small choices at once, so they sit together at
              the foot of the list rather than up among the controls used while
              working. */}
          <div className="flex items-center gap-4 px-4 py-4">
            <button type="button" onClick={onResetColors} className={quiet}>
              Reset colors
            </button>
            {rearranged && (
              <button type="button" onClick={() => setField("sectionOrder", undefined)} className={quiet}>
                Reset section order
              </button>
            )}
          </div>
        </div>
      </div>
    </ImagePickerHost>
  );
}
