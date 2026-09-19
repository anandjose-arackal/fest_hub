"use client";

import { X, Rows3, FileStack } from "lucide-react";

// Shared by /admin/participants (exportPDF) and /admin/results (exportAll) —
// both build one PDF section per competition and previously hardcoded
// opposite defaults (participants always page-broke between competitions,
// results always ran them continuously). This asks once, per export click,
// instead of guessing.
export type PrintLayout = "continuous" | "per-page";

export function PrintLayoutDialog({ onChoose, onClose }: { onChoose: (layout: PrintLayout) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-neutral-800">Print Layout</h2>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-neutral-400" />
          </button>
        </div>
        <p className="mb-4 text-sm text-neutral-600">How should the competitions be laid out on paper?</p>
        <div className="space-y-2">
          <button
            onClick={() => onChoose("continuous")}
            className="flex w-full items-start gap-3 rounded-xl border-2 border-neutral-200 p-3 text-left transition-colors hover:border-[#6B46FF] hover:bg-[#6B46FF]/5"
          >
            <Rows3 className="mt-0.5 h-5 w-5 shrink-0 text-[#6B46FF]" />
            <span>
              <span className="block text-sm font-bold text-neutral-800">Print all content continuously</span>
              <span className="block text-xs text-neutral-500">Competitions flow one after another, saving paper.</span>
            </span>
          </button>
          <button
            onClick={() => onChoose("per-page")}
            className="flex w-full items-start gap-3 rounded-xl border-2 border-neutral-200 p-3 text-left transition-colors hover:border-[#6B46FF] hover:bg-[#6B46FF]/5"
          >
            <FileStack className="mt-0.5 h-5 w-5 shrink-0 text-[#6B46FF]" />
            <span>
              <span className="block text-sm font-bold text-neutral-800">One competition per page</span>
              <span className="block text-xs text-neutral-500">Each competition starts on a fresh page.</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
