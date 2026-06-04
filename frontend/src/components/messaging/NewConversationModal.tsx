import { useEffect, useMemo, useState } from 'react';
import { Check, Hash, Search, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { EditorialButton, EditorialModal } from '../editorial';
import { SECURITY_GROUP_LABELS } from '../../lib/permissions';
import {
  createDirectConversation,
  createGroupConversation,
  searchProfiles,
} from '../../lib/api/messaging';
import type { Profile } from '../../types';

interface NewConversationModalProps {
  open: boolean;
  onClose: () => void;
  /** Caller-provided id of the signed-in user — excluded from search results
   *  so the user can't message themselves. */
  currentUserId: string;
  /** Called with the new (or existing) conversation id once creation
   *  resolves. Drives the parent's "navigate-into-this-thread" state. */
  onCreated: (conversationId: string) => void;
}

type Mode = 'choose' | 'direct' | 'group';

// Two-tab modal that creates a direct or group conversation. Mirrors the
// pre-existing NewChatModal in `Messages.tsx` but talks to the real
// Supabase tables via `lib/api/messaging.ts`.
export default function NewConversationModal({
  open, onClose, currentUserId, onCreated,
}: NewConversationModalProps) {
  const [mode, setMode] = useState<Mode>('choose');
  const [search, setSearch] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [results, setResults] = useState<Profile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when the modal closes so a fresh open lands at the chooser.
  useEffect(() => {
    if (!open) {
      setMode('choose');
      setSearch('');
      setGroupName('');
      setSelectedIds([]);
      setResults([]);
      setBusy(false);
      setError(null);
    }
  }, [open]);

  // Search debounce — 200ms is enough to feel snappy without spamming the
  // profiles endpoint on every keystroke.
  useEffect(() => {
    if (!open || (mode !== 'direct' && mode !== 'group')) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const list = await searchProfiles(search, { excludeUserIds: [currentUserId] });
          if (!cancelled) setResults(list);
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : 'Search failed.');
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, mode, search, currentUserId]);

  const selectedProfiles = useMemo(
    () => results.filter((p) => selectedIds.includes(p.id)),
    [results, selectedIds],
  );

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handlePickDirect = async (otherUserId: string) => {
    setBusy(true);
    setError(null);
    try {
      const conv = await createDirectConversation(otherUserId);
      onCreated(conv.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create conversation.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedIds.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const conv = await createGroupConversation({ name: groupName, memberIds: selectedIds });
      onCreated(conv.id);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group.');
    } finally {
      setBusy(false);
    }
  };

  const title =
    mode === 'choose' ? 'New conversation' :
    mode === 'direct' ? 'Message someone' : 'Build a group';
  const eyebrow =
    mode === 'choose' ? 'Start' :
    mode === 'direct' ? 'Direct' : 'Group';

  const footer = mode === 'group' ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-[#6B6B6B]">
        {selectedIds.length < 2
          ? `Select at least ${2 - selectedIds.length} more member${selectedIds.length === 1 ? '' : 's'}`
          : `${selectedIds.length} member${selectedIds.length === 1 ? '' : 's'} selected`}
      </p>
      <EditorialButton
        variant="pill"
        disabled={busy || !groupName.trim() || selectedIds.length < 2}
        onClick={handleCreateGroup}
      >
        {busy ? 'Creating…' : 'Create group'}
      </EditorialButton>
    </div>
  ) : null;

  return (
    <EditorialModal
      open={open}
      onClose={onClose}
      title={title}
      eyebrow={eyebrow}
      size="md"
      footer={footer}
    >
      {error && (
        <p className="mb-3 rounded-[14px] border border-[#FBE5E5] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">{error}</p>
      )}

      {mode === 'choose' && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setMode('direct')}
            className="group flex w-full items-center gap-4 rounded-[14px] border border-[#E6E1D4] p-4 transition-colors hover:border-[#2F8F5C] hover:bg-[#E5F2EA]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F0EDE4] transition-colors group-hover:bg-[#E5F2EA]">
              <Users className="h-5 w-5 text-[#6B6B6B] group-hover:text-[#246F47]" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[#1A1A1A]">Direct message</p>
              <p className="text-xs text-[#6B6B6B]">One-on-one with someone on your team</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('group')}
            className="group flex w-full items-center gap-4 rounded-[14px] border border-[#E6E1D4] p-4 transition-colors hover:border-[#2F8F5C] hover:bg-[#E5F2EA]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F0EDE4] transition-colors group-hover:bg-[#E5F2EA]">
              <Hash className="h-5 w-5 text-[#6B6B6B] group-hover:text-[#246F47]" />
            </div>
            <div className="text-left">
              <p className="font-medium text-[#1A1A1A]">Group chat</p>
              <p className="text-xs text-[#6B6B6B]">Channel for a project, trade, or crew</p>
            </div>
          </button>
        </div>
      )}

      {mode === 'direct' && (
        <div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search people…" />
          <div className="mt-3 max-h-72 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-[#A0A0A0]">No matches.</p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => handlePickDirect(p.id)}
                  className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors hover:bg-[#FAF8F2] disabled:cursor-wait disabled:opacity-60"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={p.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">{initials(p)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#1A1A1A]">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-xs text-[#6B6B6B]">
                      {SECURITY_GROUP_LABELS[p.securityGroup]}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {mode === 'group' && (
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">
            Group name
          </label>
          <input
            autoFocus
            type="text"
            placeholder="e.g. Site B Crew, Tower Crane Team…"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="editorial-input"
          />

          {selectedProfiles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {selectedProfiles.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 rounded-full bg-[#E5F2EA] px-2.5 py-1 text-xs font-medium text-[#246F47]"
                >
                  {p.firstName}
                  <button type="button" onClick={() => toggleMember(p.id)} className="ml-0.5 hover:text-[#1A1A1A]">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-4">
            <SearchBar value={search} onChange={setSearch} placeholder="Add members…" />
          </div>

          <div className="mt-3 max-h-56 overflow-y-auto">
            {results.map((p) => {
              const selected = selectedIds.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleMember(p.id)}
                  className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors hover:bg-[#FAF8F2]"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={p.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">{initials(p)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1A1A1A]">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-xs text-[#6B6B6B]">{SECURITY_GROUP_LABELS[p.securityGroup]}</p>
                  </div>
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                    selected ? 'border-[#2F8F5C] bg-[#2F8F5C]' : 'border-[#D8D2C4]'
                  }`}>
                    {selected && <Check className="h-3 w-3 text-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </EditorialModal>
  );
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="editorial-input pl-9"
      />
    </div>
  );
}

function initials(p: Profile): string {
  return `${p.firstName?.[0] ?? ''}${p.lastName?.[0] ?? ''}`.toUpperCase() || '?';
}
