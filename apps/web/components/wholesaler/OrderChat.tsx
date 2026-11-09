'use client';

import type { ReplyChip } from '@optiworld/shared';
import { format, parseISO } from 'date-fns';
import { Check, Lock, Send } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

import { formatRupee } from '@/components/retailer/dashboard-format';
import {
  confirmOrderChat,
  connectOrderChat,
  joinOrderChat,
  respondToOrderChange,
  sendOrderChatMessage,
} from '@/lib/order-chat';

import { AssistReplyChips } from './AssistReplyChips';
import {
  ActionAckSchema,
  ChangeProposedSchema,
  ChangeRespondedSchema,
  ChatMessageSchema,
  JoinAckSchema,
  StatusUpdatedSchema,
  cardFromProposal,
  loadSuggestedReplies,
  localSystemMessage,
  type ChangeCard,
  type ChatItem,
  type ChatMessage,
} from './order-chat-model';

const MESSAGE_LIMIT = 500;
const COUNTER_FROM = 400;
const COUNTER_WARN = 490;

type OrderChatProps = {
  orderId: string;
  reference: string;
  retailerName: string;
  retailerCity: string | null;
  retailerPhone: string | null;
  initiallyLocked: boolean;
  initialStatus: string;
  initialTotal: string | null;
  initialItems: readonly ChatItem[];
  onOrderChanged?: () => void;
};

export function OrderChat({
  orderId,
  reference,
  retailerName,
  retailerCity,
  retailerPhone,
  initiallyLocked,
  initialStatus,
  initialTotal,
  initialItems,
  onOrderChanged,
}: OrderChatProps): React.ReactElement {
  const { data: session } = useSession();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [wholesalerOrgId, setWholesalerOrgId] = useState<string | null>(null);
  const [changes, setChanges] = useState<Record<string, ChangeCard>>({});
  const [items, setItems] = useState<readonly ChatItem[]>(initialItems);
  const [total, setTotal] = useState<string | null>(initialTotal);
  const [status, setStatus] = useState(initialStatus);
  const [locked, setLocked] = useState(initiallyLocked);
  const [chips, setChips] = useState<ReplyChip[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [link, setLink] = useState<'connecting' | 'live' | 'reconnecting'>('connecting');
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);
  const lockedRef = useRef(locked);
  const itemsRef = useRef(items);
  const tokenRef = useRef(session?.accessToken);
  const onChangedRef = useRef(onOrderChanged);
  lockedRef.current = locked;
  itemsRef.current = items;
  tokenRef.current = session?.accessToken;
  onChangedRef.current = onOrderChanged;

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 2_500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) {
      return;
    }
    node.style.height = 'auto';
    node.style.height = `${Math.min(node.scrollHeight, 96)}px`;
  }, [draft]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    if (stickRef.current) {
      node.scrollTop = node.scrollHeight;
      setShowJump(false);
      return;
    }
    setShowJump(true);
  }, [messages]);

  useEffect(() => {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    let active = true;
    const socket = connectOrderChat(token);
    socketRef.current = socket;

    const append = (message: ChatMessage): void => {
      setMessages((current) =>
        current.some((entry) => entry.id === message.id) ? current : [...current, message],
      );
    };

    const refreshChips = (bypassCache: boolean): void => {
      const accessToken = tokenRef.current;
      if (!accessToken) {
        return;
      }
      void loadSuggestedReplies(accessToken, orderId, bypassCache)
        .then((next) => {
          if (active) {
            setChips(next);
          }
        })
        .catch(() => {
          if (active) {
            setChips((current) => current ?? []);
          }
        });
    };

    const join = (): void => {
      void joinOrderChat(socket, orderId)
        .then((raw) => {
          if (!active) {
            return;
          }
          const parsed = JoinAckSchema.safeParse(raw);
          if (!parsed.success || !parsed.data.success || !parsed.data.data) {
            setToast('Could not open this chat');
            return;
          }
          const snapshot = parsed.data.data.order;
          setWholesalerOrgId(snapshot.wholesalerOrgId);
          setItems(snapshot.items);
          setTotal(snapshot.totalValue);
          setStatus(snapshot.status);
          setLocked(Boolean(snapshot.lockedAt) || snapshot.status !== 'PENDING');
          setMessages(parsed.data.data.messages);
          const cards: Record<string, ChangeCard> = {};
          for (const message of parsed.data.data.messages) {
            if (message.changeRequest) {
              cards[message.id] = message.changeRequest;
            }
          }
          setChanges(cards);
          stickRef.current = true;
        })
        .catch(() => {
          if (active) {
            setToast('Could not open this chat');
          }
        });
    };

    socket.on('connect', () => {
      if (!active) {
        return;
      }
      setLink('live');
      join();
    });
    socket.on('disconnect', () => {
      if (active) {
        setLink('reconnecting');
      }
    });
    socket.on('message_received', (payload: unknown) => {
      const parsed = ChatMessageSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      append(parsed.data);
      refreshChips(false);
    });
    socket.on('change_proposed', (payload: unknown) => {
      const parsed = ChangeProposedSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      if (lockedRef.current) {
        append(localSystemMessage('Order is locked — changes not possible'));
        return;
      }
      const card = cardFromProposal(parsed.data, itemsRef.current);
      setChanges((current) => ({ ...current, [parsed.data.chatMessageId]: card }));
      setItems((current) =>
        current.map((item) => {
          const change = parsed.data.proposedChanges.find(
            (entry) => entry.catalogProductId === item.catalogProductId,
          );
          return change ? { ...item, quantity: change.quantity } : item;
        }),
      );
      onChangedRef.current?.();
    });
    socket.on('change_responded', (payload: unknown) => {
      const parsed = ChangeRespondedSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      setChanges((current) => {
        const next = { ...current };
        for (const [messageId, card] of Object.entries(next)) {
          if (card.id === parsed.data.changeRequestId) {
            next[messageId] = {
              ...card,
              status: parsed.data.action === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED',
            };
          }
        }
        return next;
      });
      if (parsed.data.action === 'ACCEPT') {
        setItems(parsed.data.updatedOrder.items);
        setTotal(parsed.data.updatedOrder.totalValue);
        onChangedRef.current?.();
      }
    });
    socket.on('order_confirmed', () => {
      setLocked(true);
      setStatus('CONFIRMED');
      onChangedRef.current?.();
    });
    socket.on('order_status_updated', (payload: unknown) => {
      const parsed = StatusUpdatedSchema.safeParse(payload);
      if (!parsed.success) {
        return;
      }
      setStatus(parsed.data.status);
      onChangedRef.current?.();
    });

    if (socket.connected) {
      setLink('live');
      join();
    }
    refreshChips(false);

    return () => {
      active = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId, session?.accessToken]);

  function jumpToLatest(): void {
    const node = listRef.current;
    stickRef.current = true;
    setShowJump(false);
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }

  function insertChip(chip: ReplyChip): void {
    if (chip.disabled || chip.isAi || chip.text.trim().length === 0) {
      return;
    }
    setActiveId(chip.id);
    setDraft(chip.text.slice(0, MESSAGE_LIMIT));
    inputRef.current?.focus();
  }

  function onDraftChange(value: string): void {
    const next = value.slice(0, MESSAGE_LIMIT);
    setDraft(next);
    setActiveId((current) => {
      if (!current) {
        return null;
      }
      const chip = chips?.find((entry) => entry.id === current);
      return chip && next === chip.text ? current : null;
    });
  }

  async function sendDraft(): Promise<void> {
    const socket = socketRef.current;
    const content = draft.trim();
    if (!socket || content.length === 0) {
      return;
    }
    setDraft('');
    setActiveId(null);
    try {
      const parsed = ActionAckSchema.safeParse(
        await sendOrderChatMessage(socket, orderId, content),
      );
      if (!parsed.success || !parsed.data.success) {
        setDraft(content);
        setToast(
          parsed.success ? (parsed.data.error?.message ?? 'Could not send') : 'Could not send',
        );
        return;
      }
      const token = tokenRef.current;
      if (token) {
        const next = await loadSuggestedReplies(token, orderId, true);
        setChips(next);
      }
    } catch {
      setDraft(content);
      setToast('Could not send');
    }
  }

  async function respond(changeRequestId: string, action: 'ACCEPT' | 'DECLINE'): Promise<void> {
    const socket = socketRef.current;
    if (!socket || lockedRef.current) {
      return;
    }
    setRespondingId(changeRequestId);
    try {
      const parsed = ActionAckSchema.safeParse(
        await respondToOrderChange(socket, changeRequestId, action),
      );
      if (!parsed.success || !parsed.data.success) {
        const code = parsed.success ? parsed.data.error?.code : undefined;
        setToast(
          code === 'ORDER_LOCKED'
            ? 'This order is already confirmed'
            : parsed.success
              ? (parsed.data.error?.message ?? 'Could not update the change')
              : 'Could not update the change',
        );
      }
    } catch {
      setToast('Could not update the change');
    } finally {
      setRespondingId(null);
    }
  }

  async function confirm(): Promise<void> {
    const socket = socketRef.current;
    if (!socket) {
      return;
    }
    if (locked) {
      setConfirmOpen(false);
      setToast('This order is already confirmed');
      return;
    }
    setConfirming(true);
    try {
      const parsed = ActionAckSchema.safeParse(await confirmOrderChat(socket, orderId));
      if (!parsed.success || !parsed.data.success) {
        const code = parsed.success ? parsed.data.error?.code : undefined;
        setToast(
          code === 'ORDER_LOCKED'
            ? 'This order is already confirmed'
            : 'Could not confirm this order',
        );
        if (code === 'ORDER_LOCKED') {
          setLocked(true);
        }
        return;
      }
      setLocked(true);
      setStatus('CONFIRMED');
      setConfirmOpen(false);
    } catch {
      setToast('Could not confirm this order');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <section className="flex h-[min(720px,calc(100vh-8rem))] flex-col rounded-xl border border-line bg-white">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-md font-semibold text-ink">Order chat — #{reference}</h2>
          {link === 'reconnecting' ? (
            <span className="text-xs text-amber">Reconnecting...</span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-ink2">
          {retailerName}
          {retailerCity ? ` · ${retailerCity}` : ''}
        </p>
        {retailerPhone ? (
          <a className="text-sm text-action" href={`tel:${retailerPhone}`}>
            {retailerPhone}
          </a>
        ) : (
          <p className="text-sm text-ink3">No phone</p>
        )}
      </header>

      <div className="border-b border-line">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-2 text-left"
          aria-expanded={summaryOpen}
          onClick={() => setSummaryOpen((open) => !open)}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-ink3">
            Order summary · {statusLabel(status)}
          </span>
          <span className="text-xs text-ink3">{summaryOpen ? 'Hide' : 'Show'}</span>
        </button>
        {summaryOpen ? (
          <div className="px-4 pb-3">
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink">
                    {item.productName} × {item.quantity}
                  </span>
                  <span className="text-ink2">
                    {item.agreedPrice ? formatRupee(item.agreedPrice) : 'On request'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm font-semibold text-ink">
              Total {total ? formatRupee(total) : 'On request'}
            </p>
          </div>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          className="h-full space-y-3 overflow-y-auto px-3 py-3"
          onScroll={() => {
            const node = listRef.current;
            if (!node) {
              return;
            }
            const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
            stickRef.current = atBottom;
            if (atBottom) {
              setShowJump(false);
            }
          }}
        >
          {messages.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              change={changes[message.id]}
              retailerName={retailerName}
              wholesalerOrgId={wholesalerOrgId}
              locked={locked}
              status={status}
              responding={respondingId === changes[message.id]?.id}
              onAccept={(id) => void respond(id, 'ACCEPT')}
              onDecline={(id) => void respond(id, 'DECLINE')}
            />
          ))}
        </div>
        {showJump ? (
          <button
            type="button"
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-line bg-white px-3 py-1 text-xs text-ink"
            onClick={jumpToLatest}
          >
            ↓ New message
          </button>
        ) : null}
      </div>

      {locked ? (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-sm text-teal">
          <Lock className="h-4 w-4" aria-hidden="true" />
          <span>Order confirmed — no further changes possible</span>
        </div>
      ) : (
        <div className="border-t border-line">
          <AssistReplyChips
            chips={chips ?? []}
            loading={chips === null}
            activeId={activeId}
            onInsert={insertChip}
          />
        </div>
      )}

      <form
        className="border-t border-line px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendDraft();
        }}
      >
        <div className="flex items-end gap-2">
          {locked ? (
            <button
              type="button"
              disabled
              className="inline-flex cursor-default items-center gap-1 rounded-lg bg-line px-3 py-2 text-sm text-ink3"
            >
              <Lock className="h-4 w-4" aria-hidden="true" />
              Order locked
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg bg-teal px-3 py-2 text-sm font-medium text-white"
              onClick={() => setConfirmOpen(true)}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              Confirm order
            </button>
          )}
          <div className="min-w-0 flex-1">
            <label className="sr-only" htmlFor="order-chat-draft">
              Message
            </label>
            <textarea
              id="order-chat-draft"
              ref={inputRef}
              rows={1}
              maxLength={MESSAGE_LIMIT}
              value={draft}
              placeholder="Write a message"
              className="max-h-24 min-h-11 w-full resize-none overflow-y-auto rounded-lg border border-line px-3 py-2 text-base text-ink focus:border-action focus:outline-none"
              onChange={(event) => onDraftChange(event.target.value)}
            />
            {draft.length > COUNTER_FROM ? (
              <p
                className={`mt-1 text-right text-sm ${draft.length >= COUNTER_WARN ? 'text-danger' : 'text-ink3'}`}
              >
                {draft.length}/{MESSAGE_LIMIT}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            aria-label="Send"
            disabled={draft.trim().length === 0}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-action text-white disabled:cursor-not-allowed disabled:bg-line disabled:text-ink3"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>

      {confirmOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-order-title"
        >
          <div className="w-full max-w-md rounded-t-xl border border-line bg-white p-4 sm:rounded-xl">
            <h2 id="confirm-order-title" className="text-lg font-semibold text-ink">
              Confirm order #{reference}?
            </h2>
            <p className="mt-1 text-sm text-ink2">
              This will lock the order. Neither party can make changes after confirmation.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="min-h-11 rounded-lg border border-line px-3 text-sm text-ink2"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg bg-teal px-4 text-sm font-medium text-white disabled:opacity-60"
                disabled={confirming}
                onClick={() => void confirm()}
              >
                Confirm order
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <p
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-navy px-4 py-2 text-sm text-white"
          role="status"
        >
          {toast}
        </p>
      ) : null}
    </section>
  );
}

function MessageRow({
  message,
  change,
  retailerName,
  wholesalerOrgId,
  locked,
  status,
  responding,
  onAccept,
  onDecline,
}: {
  message: ChatMessage;
  change: ChangeCard | undefined;
  retailerName: string;
  wholesalerOrgId: string | null;
  locked: boolean;
  status: string;
  responding: boolean;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}): React.ReactElement {
  const time = clock(message.createdAt);
  if (message.messageType === 'SYSTEM') {
    return (
      <SystemPill
        text={message.content.includes('·') ? message.content : `${message.content} · ${time}`}
      />
    );
  }
  if (message.messageType === 'CHANGE_REQUEST') {
    const answerable =
      change?.status === 'PENDING' && (status === 'PENDING' || status === 'CONFIRMED');
    if (
      locked &&
      status !== 'CONFIRMED' &&
      status !== 'PENDING' &&
      (!change || change.status === 'PENDING')
    ) {
      return <SystemPill text={`Order is locked — changes not possible · ${time}`} />;
    }
    if (change?.kind === 'CANCEL_ORDER') {
      return (
        <article className="rounded-xl border border-danger bg-danger-soft p-3">
          <p className="text-xs font-semibold text-danger">Cancellation request</p>
          <p className="mt-2 text-sm text-ink">
            The retailer asked to cancel this confirmed order. Call them to discuss it. Accept only
            if the order should be cancelled. Otherwise keep the order.
          </p>
          {answerable ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={responding}
                onClick={() => onAccept(change.id)}
              >
                Accept cancellation
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-action hover:bg-action-soft disabled:opacity-60"
                disabled={responding}
                onClick={() => onDecline(change.id)}
              >
                Keep this order
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink3">
              {change.status === 'ACCEPTED'
                ? 'Cancelled'
                : change.status === 'DECLINED'
                  ? 'Kept'
                  : 'Waiting'}
            </p>
          )}
        </article>
      );
    }
    if (change) {
      return (
        <article className="rounded-xl border border-amber bg-amber-soft p-3">
          <p className="text-xs font-semibold text-amber">Order amendment</p>
          <ul className="mt-2 space-y-1">
            {change.lines.map((line) => (
              <li key={`${line.productName}-${line.toQuantity}`} className="text-sm text-ink">
                {line.fromQuantity === 0 ? (
                  <>
                    Added {line.productName} × {line.toQuantity}
                  </>
                ) : (
                  <>
                    {line.productName} <span className="text-ink2">{line.fromQuantity}</span>
                    <span className="mx-1 font-semibold text-amber">→</span>
                    <span>{line.toQuantity}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
          {answerable ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-lg bg-teal px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                disabled={responding}
                onClick={() => onAccept(change.id)}
              >
                Accept change
              </button>
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm text-action hover:bg-action-soft disabled:opacity-60"
                disabled={responding}
                onClick={() => onDecline(change.id)}
              >
                Keep current order
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-ink3">
              {change.status === 'ACCEPTED'
                ? 'Accepted'
                : change.status === 'DECLINED'
                  ? 'Kept the current order'
                  : 'Waiting'}
            </p>
          )}
        </article>
      );
    }
  }
  if (message.senderOrgId && wholesalerOrgId && message.senderOrgId === wholesalerOrgId) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%]">
          <div className="rounded-xl bg-action px-3 py-2 text-sm text-white">{message.content}</div>
          <p className="mt-1 text-right text-sm text-ink3">{time}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2">
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-canvas text-xs font-medium text-ink2"
        aria-hidden="true"
      >
        {initials(retailerName)}
      </span>
      <div className="max-w-[75%]">
        <div className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink">
          {message.content}
        </div>
        <p className="mt-1 text-sm text-ink3">{time}</p>
      </div>
    </div>
  );
}

function SystemPill({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex justify-center">
      <p className="rounded-full bg-canvas px-3 py-1 text-center text-sm text-ink3">{text}</p>
    </div>
  );
}

function clock(iso: string): string {
  const date = parseISO(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return format(date, 'h:mm a');
}

function initials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'R'
  );
}

function statusLabel(status: string): string {
  if (status.length === 0) {
    return 'Pending';
  }
  return status[0] + status.slice(1).toLowerCase();
}
