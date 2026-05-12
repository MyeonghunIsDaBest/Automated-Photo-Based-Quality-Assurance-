import { useEffect, useMemo, useState } from 'react';
import { Check, LogOut, Pencil, Search, Trash2, UserPlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { EditorialButton, EditorialModal } from '../editorial';
import { SECURITY_GROUP_LABELS } from '../../lib/permissions';
import {
  addConversationMembers,
  leaveConversation,
  removeConversationMember,
  searchProfiles,
  updateConversationName,
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
      <p className="text-xs text-slate-500">
        {selectedIds.length === 0
          ? 'Select people to invite.'
          : `${selectedIds.length} selected`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setTab('members'); setSelectedIds([]); setSearch(''); }}
          className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
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
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {/* Tab strip (hidden on the add-members panel since it has its own footer) */}
      {tab !== 'add' && (
        <div className="mb-4 flex gap-6 border-b border-slate-200">
          {(['overview', 'members'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 pb-2 text-sm font-medium transition-colors ${
                tab === t
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {t === 'overview' ? 'Overview' : `Members · ${memberCount}`}
            </button>
          ))}
        </div>
      )}

      {tab === 'overview' && (
        <div className="space-y-5">
          {/* Group name */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
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
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => { setName(conversation.name ?? ''); setEditingName(false); }}
                  className="rounded-full px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                <span className="display truncate text-base font-medium text-slate-900">
                  {conversation.name ?? 'Untitled group'}
                </span>
                {isCreator && (
                  <button
                    type="button"
                    onClick={() => setEditingName(true)}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Rename
                  </button>
                )}
              </div>
            )}
            {!isCreator && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                Only the group&apos;s creator can rename it.
              </p>
            )}
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Members
              </p>
              <p className="display mt-0.5 text-2xl font-medium tabular-nums text-slate-900">
                {memberCount}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Created
              </p>
              <p className="mt-0.5 text-sm text-slate-700">
                {new Date(conversation.createdAt).toLocaleDateString(undefined, {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Danger zone */}
          <div className="border-t border-slate-200 pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLeave()}
              className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50/40 px-4 py-3 text-left transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium text-red-700">Leave group</span>
                <span className="block text-xs text-red-600/70">
                  You&apos;ll stop receiving messages and need an invite to rejoin.
                </span>
              </span>
              <LogOut className="h-4 w-4 flex-shrink-0 text-red-600" />
            </button>
          </div>
        </div>
      )}

      {tab === 'members' && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {memberCount} {memberCount === 1 ? 'person' : 'people'} in this group
            </p>
            {isCreator && (
              <button
                type="button"
                onClick={() => setTab('add')}
                className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
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
                  className="flex items-center gap-3 rounded-lg px-2 py-2"
                >
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={p?.avatarUrl ?? undefined} />
                    <AvatarFallback className="text-xs">
                      {(name[0] ?? '?').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {name}{isSelf && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {wasCreator && <span className="mr-1 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-700">Creator</span>}
                      {p ? SECURITY_GROUP_LABELS[p.securityGroup] : '—'}
                    </p>
                  </div>
                  {isCreator && !isSelf && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemove(m.userId)}
                      className="flex-shrink-0 rounded-full p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
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
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                  className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800"
                >
                  {p.firstName}
                  <button
                    type="button"
                    onClick={() => setSelectedIds((s) => s.filter((x) => x !== p.id))}
                    className="ml-0.5 hover:text-emerald-900"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="mt-3 max-h-60 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-400">
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
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={p.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {(name[0] ?? '?').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{name}</p>
                      <p className="text-xs text-slate-500">{SECURITY_GROUP_LABELS[p.securityGroup]}</p>
                    </div>
                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                      selected ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
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
