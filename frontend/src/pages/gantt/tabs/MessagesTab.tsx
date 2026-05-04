import { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { MessageSquare, Send, Trash2 } from 'lucide-react';
import type { Project, User } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../../../components/ui/avatar';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useGanttSideStore } from '../store';

interface MessagesTabProps {
  project: Project;
  currentUser: User | null;
}

function dayLabel(dateISO: string): string {
  const d = parseISO(dateISO);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMM d');
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function MessagesTab({ project, currentUser }: MessagesTabProps) {
  const allMessages = useGanttSideStore((s) => s.messages);
  const addMessage = useGanttSideStore((s) => s.addMessage);
  const removeMessage = useGanttSideStore((s) => s.removeMessage);

  // One thread per project, shared by everyone tasked on the job (workers,
  // suppliers, project managers). Filter is by projectId — when a real
  // membership table arrives, swap the consumer out for a Supabase query.
  const messages = useMemo(() => allMessages?.[project.id] ?? [], [allMessages, project.id]);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the latest message whenever the thread grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Group consecutive messages by day so the eye gets natural separators.
  const grouped = useMemo(() => {
    const out: { day: string; items: typeof messages }[] = [];
    for (const m of messages) {
      const day = dayLabel(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === day) {
        last.items.push(m);
      } else {
        out.push({ day, items: [m] });
      }
    }
    return out;
  }, [messages]);

  const canPost = !!currentUser;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !currentUser) return;
    addMessage(project.id, {
      authorId: currentUser.id,
      authorName: currentUser.fullName,
      authorRole: currentUser.role,
      body,
    });
    setDraft('');
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Messages · ${project.name}`}
        title="Project chat."
        description="One thread for everyone working this job — workers, suppliers, project managers. Use it for site notes, schedule pings, and quick decisions that don't deserve a meeting."
      />

      <Card>
        <CardContent className="flex h-[60vh] min-h-[420px] flex-col p-0">
          {/* Thread */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
            {messages.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="No messages yet."
                description={
                  canPost
                    ? 'Kick off the conversation with the form below.'
                    : 'Sign in to participate in the project chat.'
                }
              />
            ) : (
              <div className="space-y-6">
                {grouped.map((group) => (
                  <div key={group.day}>
                    <div className="mb-3 flex items-center gap-3">
                      <div className="h-px flex-1 bg-slate-200" />
                      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                        {group.day}
                      </span>
                      <div className="h-px flex-1 bg-slate-200" />
                    </div>

                    <ul className="space-y-3">
                      {group.items.map((m) => {
                        const mine = currentUser?.id === m.authorId;
                        return (
                          <li
                            key={m.id}
                            className={`group flex items-start gap-3 ${mine ? 'flex-row-reverse text-right' : ''}`}
                          >
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              <AvatarImage />
                              <AvatarFallback className="text-[10px] font-semibold">
                                {initials(m.authorName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className={`min-w-0 flex-1 ${mine ? 'flex flex-col items-end' : ''}`}>
                              <div className={`flex items-baseline gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                                <span className="truncate text-sm font-medium text-slate-900">
                                  {m.authorName}
                                </span>
                                <span className="text-[11px] capitalize text-slate-400">{m.authorRole}</span>
                                <span className="text-[11px] text-slate-400">
                                  {format(parseISO(m.createdAt), 'h:mm a')}
                                </span>
                              </div>
                              <div
                                className={`mt-1 inline-block max-w-prose whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                                  mine
                                    ? 'bg-slate-900 text-white'
                                    : 'bg-slate-100 text-slate-800'
                                }`}
                              >
                                {m.body}
                              </div>
                            </div>
                            {mine && (
                              <button
                                type="button"
                                onClick={() => removeMessage(project.id, m.id)}
                                className="invisible mt-2 inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 group-hover:visible"
                                aria-label="Delete message"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSend}
            className="flex flex-shrink-0 items-end gap-2 border-t border-slate-100 bg-white p-3 sm:p-4"
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Cmd/Ctrl + Enter sends; plain Enter inserts a newline so
                // multi-line site notes don't get split into two messages.
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleSend(e as unknown as React.FormEvent);
                }
              }}
              rows={1}
              disabled={!canPost}
              placeholder={canPost ? 'Message the team…' : 'Sign in to chat'}
              className="min-h-[44px] flex-1 resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-slate-50"
            />
            <button
              type="submit"
              disabled={!canPost || !draft.trim()}
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white transition-colors hover:bg-emerald-700 active:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-slate-900"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
