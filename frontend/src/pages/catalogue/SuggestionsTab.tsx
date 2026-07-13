// ─────────────────────────────────────────────────────────────────────────────
// pages/catalogue/SuggestionsTab.tsx
//
// Material candidates review inbox.
//
// Status filter chips: Pending (default) / Dismissed / Approved.
// Pending list: sorted occurrences desc — raw text, count chip, last seen date.
//
// Per-row:
//   Approve → opens MaterialFormModal prefilled (name = title-cased raw_text),
//             source="mined" so the ONE createMaterial happens with the right
//             source tag.
//             → onSaved: calls approveCandidate(candidateId, material.id) to
//               link the already-created material to the candidate row.
//             → on linkError: info toast ("Material created but the suggestion
//               link failed — refresh"), not a success toast
//   Dismiss → dismissCandidate(id) inline
//
// Multi-select checkboxes + bulk dismiss for Pending rows.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { RefreshCw, CheckSquare, Square, Loader2, X, Pencil, Check, RotateCcw } from "lucide-react";

import { TONE, cardShell, btnPrimary, btnGhost } from "../gantt/components/ledger";
import { SkeletonLine } from "../../components/ui/skeleton";
import { Toaster, type ToastState } from "../../components/ui/Toaster";

import {
  listCandidates,
  approveCandidate,
  dismissCandidate,
  updateCandidate,
  type Material,
  type MaterialCandidate,
  type CandidateStatus,
} from "../../lib/api/materials";
import MaterialFormModal, { type MaterialFormInitial } from "./MaterialFormModal";

// ─── types ────────────────────────────────────────────────────────────────────

interface Props {
  onWritten: () => void;
}

// ─── title-case helper ────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

// ─── component ───────────────────────────────────────────────────────────────

export default function SuggestionsTab({ onWritten }: Props) {
  const [activeStatus, setActiveStatus] = useState<CandidateStatus>("pending");
  const [candidates, setCandidates]     = useState<MaterialCandidate[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  // multi-select for bulk dismiss
  const [selected, setSelected]         = useState<Set<string>>(new Set());

  // approval modal
  const [approving, setApproving]       = useState<MaterialCandidate | null>(null);

  // row-level busy (dismissing)
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy]           = useState(false);

  // inline raw-text edit (clean up mined text before approving)
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editText, setEditText]     = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // restore dismissed → pending
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [toast, setToast] = useState<ToastState>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const list = await listCandidates(activeStatus);
      setCandidates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, [activeStatus]);

  useEffect(() => {
    void fetchCandidates();
  }, [fetchCandidates]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === candidates.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((c) => c.id)));
    }
  }

  async function handleDismiss(id: string) {
    setDismissingIds((prev) => new Set([...prev, id]));
    try {
      await dismissCandidate(id);
      setToast({ message: "Suggestion dismissed", type: "success" });
      void fetchCandidates();
      onWritten();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Dismiss failed", type: "error" });
    } finally {
      setDismissingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  async function handleBulkDismiss() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selected].map((id) => dismissCandidate(id)));
      setToast({ message: `${selected.size} suggestion${selected.size !== 1 ? "s" : ""} dismissed`, type: "success" });
      void fetchCandidates();
      onWritten();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Bulk dismiss failed", type: "error" });
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleApprovalSaved(candidateId: string, material: Material) {
    try {
      const { linkError } = await approveCandidate(candidateId, material.id);
      setApproving(null);
      if (linkError) {
        setToast({
          message: "Material created but the suggestion link failed — refresh",
          type: "info",
        });
      } else {
        setToast({ message: "Material approved and created", type: "success" });
      }
      void fetchCandidates();
      onWritten();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Approval failed", type: "error" });
      setApproving(null);
    }
  }

  function startEdit(c: MaterialCandidate) {
    setEditingId(c.id);
    setEditText(c.rawText);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(c: MaterialCandidate) {
    const text = editText.trim();
    if (!text || text === c.rawText) { cancelEdit(); return; }
    setSavingEdit(true);
    try {
      await updateCandidate(c.id, { rawText: text });
      setToast({ message: "Suggestion updated", type: "success" });
      cancelEdit();
      void fetchCandidates();
      onWritten();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Update failed", type: "error" });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleRestore(c: MaterialCandidate) {
    setRestoringId(c.id);
    try {
      await updateCandidate(c.id, { status: "pending" });
      setToast({ message: "Suggestion restored to pending", type: "success" });
      void fetchCandidates();
      onWritten();
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Restore failed", type: "error" });
    } finally {
      setRestoringId(null);
    }
  }

  const STATUS_TABS: { key: CandidateStatus; label: string }[] = [
    { key: "pending",   label: "Pending"   },
    { key: "approved",  label: "Approved"  },
    { key: "dismissed", label: "Dismissed" },
  ];

  const isPending = activeStatus === "pending";

  return (
    <div className={`${cardShell} overflow-hidden`}>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E6E1D4] px-4 py-3">
        <h2 className="text-[13px] font-semibold text-[#1A1A1A]">Suggestions</h2>
        <p className="text-xs text-[#6B6B6B]">
          Materials mined from historical order line items.
        </p>

        {/* Status filter chips */}
        <div className="ml-auto flex items-center gap-1.5">
          {STATUS_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setActiveStatus(key); }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeStatus === key
                  ? "border-[#1A1A1A] bg-[#1A1A1A] text-white"
                  : "border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk action bar (only when pending items are selected) */}
      {isPending && selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-[#E6E1D4] bg-[#F9EFD9] px-4 py-2.5">
          <span className="text-xs font-medium text-[#C8841E]">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={() => void handleBulkDismiss()}
            disabled={bulkBusy}
            className="flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-xs font-medium text-[#3A3A3A] hover:bg-[#FBE5E5] hover:text-[#C44545] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkBusy && <Loader2 className="h-3 w-3 animate-spin" />}
            <X className="h-3 w-3" />
            Dismiss selected
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs text-[#A0A0A0] hover:text-[#1A1A1A]"
          >
            Clear
          </button>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-center justify-between bg-[#FBE5E5] border-b border-[#F0BFBF] px-4 py-3">
          <p className="text-xs text-[#C44545]">{error}</p>
          <button
            type="button"
            onClick={() => void fetchCandidates()}
            className={btnGhost + " py-1! px-3! text-xs!"}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[#E6E1D4] bg-[#FAF8F2]">
              {isPending && (
                <th className="w-10 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="text-[#A0A0A0] hover:text-[#1A1A1A]"
                    aria-label="Select all"
                  >
                    {selected.size > 0 && selected.size === candidates.length ? (
                      <CheckSquare className="h-4 w-4" />
                    ) : (
                      <Square className="h-4 w-4" />
                    )}
                  </button>
                </th>
              )}
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                Raw text
              </th>
              <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                Count
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                Last seen
              </th>
              {!isPending && (
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                  Status
                </th>
              )}
              {isPending && (
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-[#6B6B6B]">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading &&
              [1, 2, 3, 4].map((i) => (
                <tr key={i} className="border-b border-[#EFEBE0]">
                  {isPending && <td className="px-4 py-3" />}
                  <td className="px-4 py-3"><SkeletonLine className="w-48" /></td>
                  <td className="px-4 py-3"><SkeletonLine className="w-8 mx-auto" /></td>
                  <td className="px-4 py-3"><SkeletonLine className="w-24" /></td>
                  <td className="px-4 py-3" />
                </tr>
              ))}

            {!loading && candidates.length === 0 && !error && (
              <tr>
                <td colSpan={isPending ? 5 : 4} className="px-4 py-12 text-center text-[#A0A0A0]">
                  <p className="text-sm font-medium">No {activeStatus} suggestions</p>
                  {activeStatus === "pending" && (
                    <p className="mt-1 text-xs">
                      Candidates are mined from historical order line items when migration 64 is applied.
                    </p>
                  )}
                </td>
              </tr>
            )}

            {!loading &&
              candidates.map((c) => {
                const isDismissing = dismissingIds.has(c.id);
                return (
                  <tr
                    key={c.id}
                    className="border-b border-[#EFEBE0] transition-colors hover:bg-[#FAF8F2]"
                  >
                    {isPending && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleSelect(c.id)}
                          className="text-[#A0A0A0] hover:text-[#1A1A1A]"
                          aria-label={selected.has(c.id) ? "Deselect" : "Select"}
                        >
                          {selected.has(c.id) ? (
                            <CheckSquare className="h-4 w-4 text-[#2F8F5C]" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      {editingId === c.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveEdit(c);
                              if (e.key === "Escape") cancelEdit();
                            }}
                            disabled={savingEdit}
                            className="min-w-[200px] flex-1 rounded-md border border-[#E6E1D4] bg-white px-2.5 py-1.5 text-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                          />
                          <button
                            type="button"
                            onClick={() => void saveEdit(c)}
                            disabled={savingEdit}
                            title="Save"
                            aria-label="Save text"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#2F8F5C] text-white transition-colors hover:bg-[#246F47] disabled:opacity-50"
                          >
                            {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={savingEdit}
                            title="Cancel"
                            aria-label="Cancel edit"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#E6E1D4] bg-white text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1A1A1A]">{c.rawText}</span>
                          {isPending && (
                            <button
                              type="button"
                              onClick={() => startEdit(c)}
                              title="Edit text before approving"
                              aria-label="Edit suggestion text"
                              className="text-[#C0BAB0] transition-colors hover:text-[#2F8F5C]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums"
                        style={{ background: TONE.amber.bg, color: TONE.amber.fg }}
                      >
                        {c.occurrences}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#6B6B6B]">
                      {c.lastSeen
                        ? format(new Date(c.lastSeen), "d MMM yyyy")
                        : "—"}
                    </td>
                    {!isPending && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{
                              background: c.status === "approved" ? TONE.sage.bg : "#F0EDE4",
                              color: c.status === "approved" ? TONE.sage.fg : "#8A8378",
                            }}
                          >
                            {c.status}
                          </span>
                          {c.status === "dismissed" && (
                            <button
                              type="button"
                              onClick={() => void handleRestore(c)}
                              disabled={restoringId === c.id}
                              title="Restore to pending"
                              className="inline-flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#6B6B6B] transition-colors hover:bg-[#FAF8F2] hover:text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {restoringId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                    {isPending && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setApproving(c)}
                            className={btnPrimary + " py-1! px-3! text-xs!"}
                            disabled={isDismissing}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDismiss(c.id)}
                            disabled={isDismissing}
                            className="flex items-center gap-1 rounded-full border border-[#E6E1D4] bg-white px-3 py-1 text-xs font-medium text-[#6B6B6B] transition-colors hover:bg-[#FBE5E5] hover:text-[#C44545] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isDismissing && <Loader2 className="h-3 w-3 animate-spin" />}
                            Dismiss
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Approval modal — MaterialFormModal prefilled from candidate, source="mined" */}
      {approving && (
        <ApprovalModal
          candidate={approving}
          onSaved={(m) => void handleApprovalSaved(approving.id, m)}
          onClose={() => setApproving(null)}
        />
      )}

      {toast && (
        <Toaster message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

// ─── ApprovalModal wrapper ────────────────────────────────────────────────────
// Wraps MaterialFormModal with source="mined" so the single createMaterial call
// (inside MaterialFormModal.handleSubmit) tags the record correctly. The saved
// Material is passed directly to the parent — no second create step.

interface ApprovalModalProps {
  candidate: MaterialCandidate;
  onSaved: (material: Material) => void;
  onClose: () => void;
}

function ApprovalModal({ candidate, onSaved, onClose }: ApprovalModalProps) {
  const prefill: MaterialFormInitial = {
    name: toTitleCase(candidate.rawText),
    unit: "ea",
  };

  return (
    <MaterialFormModal
      initial={prefill}
      source="mined"
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}
