import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Camera, Check, Loader2, LogOut, Pencil, Search, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { EditorialButton, EditorialModal } from '../editorial';
import { SECURITY_GROUP_LABELS } from '../../lib/permissions';
import {
  addConversationMembers,
  leaveConversation,
  removeConversationMember,
  searchProfiles,
  updateConversationAvatar,
  updateConversationName,
  uploadGroupAvatar,
  type Conversation,
} from '../../lib/api/messaging';
import type { Profile } from '../../types';

interface GroupSettingsModalProps {
  open: boolean;
  onClose: () => void;
  conversation: Conversation;
  /** Profile lookup so we can render member names + avatars without
   *  another round-trip. */
  profileById: Map<string, Profile>;
  currentUserId: string;
  /** Fired after a rename or add-members succeeds so the parent can patch
   *  its cache. The patch contains only the fields that changed. */
  onUpdated: (patch: Partial<Conversation>) => void;
  /** Fired after the current user leaves the group. */
  onLeft: () => void;
}

type Tab = 'overview' | 'members' | 'add';

export default function GroupSettingsModal({
  open,
  onClose,
  conversation,
  profileById,
  currentUserId,
  onUpdated,
  onLeft,
}: GroupSettingsModalProps) {
  const isCreator = conversation.createdBy === currentUserId;
  const [tab, setTab] = useState<Tab>('overview');
  const [name, setName] = useState(conversation.name ?? '');
  const [editingName, setEditingName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group photo (creator-only edit). Uploads to the shared avatars bucket then
  // persists the URL on the conversation row; onUpdated patches the cache so
  // the inbox + header refresh immediately.
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const handleAvatarSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    setError(null);
    try {
      const url = await uploadGroupAvatar(conversation.id, file);
      await updateConversationAvatar(conversation.id, url);
      onUpdated({ avatarUrl: url });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    setAvatarBusy(true);
    setError(null);
    try {
      await updateConversationAvatar(conversation.id, null);
      onUpdated({ avatarUrl: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove photo.');
    } finally {
      setAvatarBusy(false);
    }
  };

  // Add-members tab state
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      setTab('overview');
      setEditingName(false);
      setName(conversation.name ?? '');
      setBusy(false);
      setError(null);
      setSearch('');
      setResults([]);
      setSelectedIds([]);
    }
  }, [open, conversation.name]);

  // Existing member ids — excluded from the add-member search results.
  const existingMemberIds = useMemo(
    () => new Set((conversation.members ?? []).map((m) => m.userId)),
    [conversation.members],
  );

  // Debounced search for the add-members tab.
  useEffect(() => {
    if (!open || tab !== 'add') return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const list = await searchProfiles(search, {
            excludeUserIds: [...Array.from(existingMemberIds)],
          });
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
  }, [open, tab, search, existingMemberIds]);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === conversation.name) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await updateConversationName(conversation.id, trimmed);
      onUpdated({ name: updated.name });
      setEditingName(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rename group.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (userId: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeConversationMember(conversation.id, userId);
      onUpdated({
        members: (conversation.members ?? []).filter((m) => m.userId !== userId),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddMembers = async () => {
    if (selectedIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await addConversationMembers(conversation.id, selectedIds);
      // Optimistic local patch — adds the new ids as members with `joinedAt`
      // = now so the overview shows them immediately. Realtime / a reload
      // will replace this with the canonical rows.
      const now = new Date().toISOString();
      onUpdated({
        members: [
          ...(conversation.members ?? []),
          ...selectedIds.map((id) => ({
            conversationId: conversation.id,
            userId: id,
            joinedAt: now,
            lastReadAt: null,
          })),
        ],
      });
      setSelectedIds([]);
      setSearch('');
      setTab('members');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add members.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!window.confirm('Leave this group? You will stop receiving its messages.')) return;
    setBusy(true);
    setError(null);
    try {
      await leaveConversation(conversation.id);
      onLeft();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to leave group.');
    } finally {
      setBusy(false);
    }
  };

  const memberCount = conversation.members?.length ?? 0;
  const eyebrow = tab === 'add' ? 'Add members' : 'Group';
  const title = tab === 'add' ? 'Invite to this group' : (conversation.name ?? 'Group settings');

  const footer = tab === 'add' ? (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-[#6B6B6B]">
        {selectedIds.length === 0
          ? 'Select people to invite.'
          : `${selectedIds.length} selected`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setTab('members'); setSelectedIds([]); setSearch(''); }}
          className="rounded-full px-4 py-2 text-sm font-medium text-[#3A3A3A] hover:text-[#1A1A1A]"
        >
          Cancel
        </button>
        <EditorialButton
          variant="pill"
          disabled={busy || selectedIds.length === 0}
          onClick={handleAddMembers}
        >
          {busy ? 'Adding…' : `Add ${selectedIds.length || ''}`.trim()}
        </EditorialButton>
      </div>
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
        <p className="mb-3 rounded-[14px] border border-[#FBE5E5] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
          {error}
        </p>
      )}

      {/* Tab strip (hidden on the add-members panel since it has its own footer) */}
      {tab !== 'add' && (
        <div className="mb-4 flex gap-6 border-b border-[#E6E1D4]">
          {(['overview', 'members'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
                tab === t
                  ? 'border-[#2F8F5C] text-[#1A1A1A]'
                  : 'border-transparent text-[#6B6B6B] hover:text-[#1A1A1A]'
              }`}
            >
              {t === 'overview' ? 'Overview' : `Members · ${memberCount}`}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Group photo */}
          <div className="flex items-center gap-4">
            <div className="relative h-16 w-16 shrink-0">
              {conversation.avatarUrl ? (
                <img
                  src={conversation.avatarUrl}
                  alt={conversation.name ?? 'Group'}
                  className="h-16 w-16 rounded-full border border-[#E6E1D4] object-cover"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-full bg-[#E5F2EA] text-[#246F47]">
                  <Users className="h-7 w-7" />
                </div>
              )}
              {avatarBusy && (
                <div className="absolute inset-0 grid place-items-center rounded-full bg-black/40">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[#1A1A1A]">Group photo</p>
              {isCreator ? (
                <>
                  <p className="mt-0.5 text-xs text-[#6B6B6B]">JPG, PNG, GIF, or WebP — up to 5 MB.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={avatarBusy}
                      onClick={() => avatarInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#246F47] disabled:opacity-50"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      {conversation.avatarUrl ? 'Change' : 'Upload'}
                    </button>
                    {conversation.avatarUrl && (
                      <button
                        type="button"
                        disabled={avatarBusy}
                        onClick={() => void handleAvatarRemove()}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-3 py-1.5 text-xs font-medium text-[#C44545] hover:bg-[#FBE5E5] disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-0.5 text-[11px] text-[#A0A0A0]">
                  Only the group&apos;s creator can change the photo.
                </p>
              )}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>
          </div>

          {/* Group name */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
              Group name
            </label>
            {editingName && isCreator ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="editorial-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveName();
                    if (e.key === 'Escape') {
                      setName(conversation.name ?? '');
                      setEditingName(false);
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSaveName()}
                  className="rounded-full bg-[#2F8F5C] px-4 py-2 text-xs font-medium text-white hover:bg-[#246F47] disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setName(conversation.name ?? ''); setEditingName(false); }}
                  className="rounded-full px-3 py-2 text-xs font-medium text-[#6B6B6B] hover:text-[#1A1A1A]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-[14px] border border-[#E6E1D4] bg-white px-4 py-3">
                <span className="truncate text-base font-medium text-[#1A1A1A]">
                  {conversation.name ?? 'Untitled group'}
                </span>
                {isCreator && (
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-[#3A3A3A] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </button>
                )}
              </div>
            )}
            {!isCreator && (
              <p className="mt-1.5 text-[11px] text-[#A0A0A0]">
                Only the group&apos;s creator can rename it.
              </p>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[14px] border border-[#E6E1D4] bg-white px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                Members
              </p>
              <p className="mt-0.5 text-2xl font-medium tabular-nums text-[#1A1A1A]">
                {memberCount}
              </p>
            </div>
            <div className="rounded-[14px] border border-[#E6E1D4] bg-white px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
                Created
              </p>
              <p className="mt-0.5 text-sm text-[#3A3A3A]">
                {new Date(conversation.createdAt).toLocaleDateString(undefined, {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Danger zone */}
          <div className="border-t border-[#E6E1D4] pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLeave()}
              className="flex w-full items-center justify-between rounded-[14px] border border-[#FBE5E5] bg-[#FBE5E5]/60 px-4 py-3 text-left transition-colors hover:bg-[#FBE5E5] disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium text-[#C44545]">Leave group</span>
                <span className="block text-xs text-[#C44545]/70">
                  You&apos;ll stop receiving messages and need an invite to rejoin.
                </span>
              </span>
              <LogOut className="h-4 w-4 shrink-0 text-[#C44545]" />
            </button>
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-[#6B6B6B]">
              {memberCount} {memberCount === 1 ? 'person' : 'people'} in this group
            </p>
            {isCreator && (
              <button
                type="button"
                onClick={() => setTab('add')}
                className="flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#246F47]"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Add member
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {(conversation.members ?? []).map((m) => {
              const p = profileById.get(m.userId);
              const name = p ? `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email : 'Unknown';
              const isSelf = m.userId === currentUserId;
              const wasCreator = m.userId === conversation.createdBy;
              return (
                <div
                  key={m.userId}
                  className="flex items-center gap-3 rounded-[14px] px-2 py-2"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={p?.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {(name[0] ?? '?').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1A1A1A]">
                      {name}{isSelf && <span className="ml-1.5 text-xs text-[#A0A0A0]">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-[#6B6B6B]">
                      {wasCreator && <span className="mr-1 inline-flex rounded-full bg-[#E5F2EA] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#246F47]">Creator</span>}
                      {p ? SECURITY_GROUP_LABELS[p.securityGroup] : '—'}
                    </p>
                  </div>
                  {isCreator && !isSelf && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemove(m.userId)}
                      className="shrink-0 rounded-full p-1.5 text-[#A0A0A0] hover:bg-[#FBE5E5] hover:text-[#C44545] disabled:opacity-50"
                      aria-label={`Remove ${name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'add' && (
        <div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
            <input
              autoFocus
              type="text"
              placeholder="Search people to invite…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="editorial-input pl-9"
            />
          </div>

          {selectedIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {results.filter((p) => selectedIds.includes(p.id)).map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1 rounded-full bg-[#E5F2EA] px-2.5 py-1 text-xs font-medium text-[#246F47]"
                >
                  {p.firstName}
                  <button
                    type="button"
                    onClick={() => setSelectedIds((s) => s.filter((x) => x !== p.id))}
                    className="ml-0.5 hover:text-[#1A1A1A]"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 max-h-60 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-[#A0A0A0]">
                No matches outside the group.
              </p>
            ) : (
              results.map((p) => {
                const selected = selectedIds.includes(p.id);
                const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setSelectedIds((s) =>
                        s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id],
                      )
                    }
                    className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-left transition-colors hover:bg-[#FAF8F2]"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={p.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {(name[0] ?? '?').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#1A1A1A]">{name}</p>
                      <p className="text-xs text-[#6B6B6B]">{SECURITY_GROUP_LABELS[p.securityGroup]}</p>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                      selected ? 'border-[#2F8F5C] bg-[#2F8F5C]' : 'border-[#D8D2C4]'
                    }`}>
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </EditorialModal>
  );
}
