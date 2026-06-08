import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Check, Hash, Search, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { EditorialButton, EditorialModal } from '../editorial';
import { SECURITY_GROUP_LABELS } from '../../lib/permissions';
import {
  createDirectConversation,
  createGroupConversation,
  searchProfiles,
  updateConversationAvatar,
  uploadGroupAvatar,
} from '../../lib/api/messaging';
import { useMessagingStore } from '../../store/messaging';
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

  // Optional group photo, chosen before the group exists. Held locally with an
  // object-URL preview; uploaded once createGroupConversation returns an id.
  const groupPhotoInputRef = useRef<HTMLInputElement | null>(null);
  const [groupPhoto, setGroupPhoto] = useState<File | null>(null);
  const [groupPhotoPreview, setGroupPhotoPreview] = useState<string | null>(null);
  // Remember a created group's id so a photo failure + retry doesn't spawn a
  // duplicate group — we reuse the id and only re-run the photo step.
  const [createdConvId, setCreatedConvId] = useState<string | null>(null);

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
      setGroupPhoto(null);
      setGroupPhotoPreview(null);
      setCreatedConvId(null);
    }
  }, [open]);

  // Revoke the previous object URL whenever the preview changes / on unmount.
  useEffect(() => {
    return () => {
      if (groupPhotoPreview) URL.revokeObjectURL(groupPhotoPreview);
    };
  }, [groupPhotoPreview]);

  const handleGroupPhotoSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG, GIF, or WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is too large — please keep it under 5 MB.');
      return;
    }
    setError(null);
    setGroupPhoto(file);
    setGroupPhotoPreview(URL.createObjectURL(file));
  };

  const clearGroupPhoto = () => {
    setGroupPhoto(null);
    setGroupPhotoPreview(null);
  };

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
      // Create the group once; reuse its id on a retry so a photo failure
      // doesn't create duplicate groups.
      let convId = createdConvId;
      if (!convId) {
        const conv = await createGroupConversation({ name: groupName, memberIds: selectedIds });
        convId = conv.id;
        setCreatedConvId(convId);
      }
      if (groupPhoto) {
        const url = await uploadGroupAvatar(convId, groupPhoto);
        const updated = await updateConversationAvatar(convId, url);
        // Patch the cache directly so the photo shows immediately — realtime
        // may be reconnecting and there's no guarantee its UPDATE arrives.
        useMessagingStore.getState().patchConversation(convId, { avatarUrl: updated.avatarUrl });
      }
      onCreated(convId);
      onClose();
    } catch (e) {
      // Surface the real error (e.g. a missing column / RLS) instead of
      // silently dropping the photo — the group is already created, so closing
      // + reopening group settings lets them retry the photo there too.
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
          {/* Group photo (optional) */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-14 w-14 shrink-0">
              {groupPhotoPreview ? (
                <img
                  src={groupPhotoPreview}
                  alt="Group"
                  className="h-14 w-14 rounded-full border border-[#E6E1D4] object-cover"
                />
              ) : (
                <div className="grid h-14 w-14 place-items-center rounded-full bg-[#E5F2EA] text-[#246F47]">
                  <Users className="h-6 w-6" />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-[#1A1A1A]">
                Group photo <span className="font-normal text-[#A0A0A0]">· optional</span>
              </p>
              <div className="mt-1.5 flex gap-2">
                <button
                  type="button"
                  onClick={() => groupPhotoInputRef.current?.click()}
                  className="rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-medium text-[#3A3A3A] hover:bg-[#FAF8F2]"
                >
                  {groupPhotoPreview ? 'Change' : 'Add photo'}
                </button>
                {groupPhotoPreview && (
                  <button
                    type="button"
                    onClick={clearGroupPhoto}
                    className="rounded-full px-3 py-1.5 text-xs font-medium text-[#C44545] hover:bg-[#FBE5E5]"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            <input
              ref={groupPhotoInputRef}
              type="file"
              accept="image/*"
              onChange={handleGroupPhotoSelect}
              className="hidden"
            />
          </div>

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
