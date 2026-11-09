'use client';

import {
  centsToMoney,
  moneyToCents,
  type RetailerOrderDetail,
  type WholesalerCatalog,
} from '@optiworld/shared';
import { format, parseISO } from 'date-fns';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';

import {
  joinOrderChat,
  proposeOrderChange,
  sendOrderChatMessage,
  connectOrderChat,
} from '@/lib/order-chat';

import { RecordTrail } from '@/components/RecordTrail';

import {
  cancelRetailerOrder,
  loadRetailerOrder,
  requestRetailerOrderCancellation,
} from './catalog-api';
import { CatalogPicker } from './CatalogPicker';
import { formatRupee, formatShortDate } from './dashboard-format';
import { OrderLineEditor } from './OrderLineEditor';
import { OrderProgress, orderStatusClass, orderStatusLabel } from './OrderProgress';

type ChatLine = RetailerOrderDetail['messages'][number];

type AddedLine = {
  catalogProductId: string;
  productName: string;
  quantity: number;
  agreedPrice: string | null;
};

export function RetailerOrderDetailView({ orderId }: { orderId: string }): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [order, setOrder] = useState<RetailerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [additions, setAdditions] = useState<AddedLine[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [amendment, setAmendment] = useState<ChatLine | null>(null);
  const [editing, setEditing] = useState(false);
  const [ask, setAsk] = useState<'cancel' | 'request' | null>(null);
  const [busy, setBusy] = useState(false);

  function applyOrder(next: RetailerOrderDetail): void {
    setOrder(next);
    setQuantities(
      Object.fromEntries(next.items.map((item) => [item.id, String(shownQuantity(next, item))])),
    );
    setAdditions([]);
    setError(null);
  }

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#edit') {
      return;
    }
    setEditing(true);
  }, [orderId]);

  useEffect(() => {
    if (!token) {
      return;
    }
    void loadRetailerOrder(token, orderId)
      .then(applyOrder)
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : 'This order could not be loaded');
      });
  }, [orderId, token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const next = connectOrderChat(token);
    setSocket(next);
    const onMessage = (message: ChatLine): void => {
      setOrder((current) =>
        current ? { ...current, messages: appendMessage(current.messages, message) } : current,
      );
    };
    const onConfirmed = (): void => {
      setOrder((current) =>
        current
          ? {
              ...current,
              status: 'CONFIRMED',
              lockedAt: new Date().toISOString(),
              openAmendment: [],
            }
          : current,
      );
    };
    const refresh = (): void => {
      void loadRetailerOrder(token, orderId)
        .then(applyOrder)
        .catch(() => undefined);
    };
    next.on('message_received', onMessage);
    next.on('change_proposed', refresh);
    next.on('change_responded', refresh);
    next.on('order_confirmed', onConfirmed);
    void joinOrderChat(next, orderId).catch(() => undefined);
    return () => {
      next.off('message_received', onMessage);
      next.off('change_proposed', refresh);
      next.off('change_responded', refresh);
      next.off('order_confirmed', onConfirmed);
      next.disconnect();
    };
  }, [orderId, token]);

  const pending = Boolean(order && order.status === 'PENDING' && !order.lockedAt);
  const confirmed = order?.status === 'CONFIRMED';
  const proposal = order ? proposalChanges(order, quantities, additions) : [];

  function addCatalogProduct(
    current: RetailerOrderDetail,
    product: WholesalerCatalog['products'][number],
  ): void {
    if (product.availabilityStatus === 'OUT_OF_STOCK') {
      return;
    }
    const onOrder = current.items.find((item) => item.catalogProductId === product.id);
    if (onOrder) {
      if (!onOrder.agreedPrice) {
        setNotice(`${product.name} is already on this order.`);
        return;
      }
      const now = shownQuantity(current, onOrder);
      const next = readProposedQuantity(quantities[onOrder.id], now);
      setQuantities((draft) => ({ ...draft, [onOrder.id]: String(Math.min(10_000, next + 1)) }));
      return;
    }
    const agreedPrice =
      product.listedPrice && !product.isPriceOnRequest ? product.listedPrice : null;
    setAdditions((lines) => {
      const existing = lines.find((line) => line.catalogProductId === product.id);
      if (existing) {
        return lines.map((line) =>
          line.catalogProductId === product.id
            ? { ...line, quantity: Math.min(10_000, line.quantity + 1) }
            : line,
        );
      }
      return [
        ...lines,
        { catalogProductId: product.id, productName: product.name, quantity: 1, agreedPrice },
      ];
    });
  }

  const showEditor = Boolean(editing && pending && token && order);

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-line bg-white p-4">
        {order ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-ink">Order #{order.reference}</h1>
              <p className="text-sm text-ink2">
                {order.wholesaler.name}
                {order.wholesaler.phone ? ` · ${order.wholesaler.phone}` : ''}
              </p>
              <p className="text-xs text-ink3">{formatShortDate(order.createdAt)}</p>
              <div className="mt-2">
                <RecordTrail activity={order.activity} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${orderStatusClass(order.status)}`}
              >
                {orderStatusLabel(order.status)}
              </span>
              {pending && !showEditor ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="min-h-11 rounded-lg bg-action px-3 text-sm font-medium text-white"
                >
                  Edit order
                </button>
              ) : null}
              {pending ? (
                <button
                  type="button"
                  onClick={() => setAsk('cancel')}
                  className="min-h-11 rounded-lg border border-danger px-3 text-sm font-medium text-danger"
                >
                  Cancel order
                </button>
              ) : null}
              {confirmed ? (
                <button
                  type="button"
                  onClick={() => setAsk('request')}
                  className="min-h-11 rounded-lg border border-danger px-3 text-sm font-medium text-danger"
                >
                  Request cancellation
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="h-16 animate-pulse rounded-lg bg-canvas" />
        )}
        {confirmed ? (
          <p className="mt-3 rounded-lg border border-line bg-amber-soft px-3 py-2 text-sm text-ink">
            This order is confirmed. A change or a cancellation waits for the wholesaler. They can
            accept it or keep the current order.
          </p>
        ) : null}
        {notice ? <p className="mt-3 text-sm text-ink2">{notice}</p> : null}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </section>
      {confirmed && order && token ? (
        <section className="rounded-xl border border-line bg-white p-4">
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!socket || proposal.length === 0) {
                setNotice('Change a quantity or add an item before proposing.');
                return;
              }
              void proposeOrderChange(socket, orderId, proposal)
                .then(() => {
                  setNotice(
                    'Order amendment sent. The order stays as it is until the wholesaler accepts.',
                  );
                  void loadRetailerOrder(token, orderId)
                    .then(applyOrder)
                    .catch(() => undefined);
                })
                .catch(() => setNotice('The change could not be proposed'));
            }}
          >
            <div>
              <h2 id="propose" className="text-md font-semibold text-ink">
                Propose a change
              </h2>
              <p className="mt-1 text-sm text-ink2">
                Adjust a quantity or add an item, then send the proposal. Nothing on this order
                changes until the wholesaler accepts.
              </p>
            </div>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {order.items.map((item) => {
                if (!item.catalogProductId || !item.agreedPrice) {
                  return null;
                }
                const current = shownQuantity(order, item);
                const next = readProposedQuantity(quantities[item.id], current);
                const changed = next !== current;
                return (
                  <li
                    key={item.id}
                    className="grid gap-2 rounded-lg border border-line bg-canvas p-3"
                  >
                    <span className="text-sm font-medium text-ink">{item.productName}</span>
                    <p className="text-xs text-ink3">On this order now: {current}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        aria-label={`Decrease ${item.productName}`}
                        disabled={next <= 1}
                        onClick={() =>
                          setQuantities((draft) => ({ ...draft, [item.id]: String(next - 1) }))
                        }
                        className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-line bg-white text-ink disabled:text-ink3"
                      >
                        −
                      </button>
                      <input
                        aria-label={`Proposed quantity for ${item.productName}`}
                        inputMode="numeric"
                        value={quantities[item.id] ?? String(current)}
                        onChange={(event) =>
                          setQuantities((draft) => ({
                            ...draft,
                            [item.id]: event.target.value.replace(/\D/g, ''),
                          }))
                        }
                        className="w-16 min-h-[44px] rounded-lg border border-line bg-white px-2 text-center text-sm text-ink outline-none focus:border-action"
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${item.productName}`}
                        disabled={next >= 10_000}
                        onClick={() =>
                          setQuantities((draft) => ({
                            ...draft,
                            [item.id]: String(Math.min(10_000, next + 1)),
                          }))
                        }
                        className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-line bg-white text-ink disabled:text-ink3"
                      >
                        +
                      </button>
                    </div>
                    <p className={`text-sm ${changed ? 'text-amber' : 'text-ink3'}`}>
                      {changed
                        ? describeAmendment(
                            {
                              productName: item.productName,
                              fromQuantity: current,
                              toQuantity: next,
                            },
                            item.agreedPrice,
                          )
                        : `This line stays at ${current}.`}
                    </p>
                  </li>
                );
              })}
              {additions.map((line) => (
                <li
                  key={line.catalogProductId}
                  className="grid gap-2 rounded-lg border border-amber bg-amber-soft p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm font-medium text-ink">{line.productName}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAdditions((current) =>
                          current.filter(
                            (entry) => entry.catalogProductId !== line.catalogProductId,
                          ),
                        )
                      }
                      className="shrink-0 text-sm font-medium text-danger"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-xs text-amber">
                    New item. Added only if the wholesaler accepts.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Decrease ${line.productName}`}
                      disabled={line.quantity <= 1}
                      onClick={() =>
                        setAdditions((current) =>
                          current.map((entry) =>
                            entry.catalogProductId === line.catalogProductId
                              ? { ...entry, quantity: entry.quantity - 1 }
                              : entry,
                          ),
                        )
                      }
                      className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-line bg-white text-ink disabled:text-ink3"
                    >
                      −
                    </button>
                    <span className="w-16 text-center text-sm text-ink">{line.quantity}</span>
                    <button
                      type="button"
                      aria-label={`Increase ${line.productName}`}
                      disabled={line.quantity >= 10_000}
                      onClick={() =>
                        setAdditions((current) =>
                          current.map((entry) =>
                            entry.catalogProductId === line.catalogProductId
                              ? { ...entry, quantity: Math.min(10_000, entry.quantity + 1) }
                              : entry,
                          ),
                        )
                      }
                      className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-line bg-white text-ink disabled:text-ink3"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-sm text-ink2">
                    {line.agreedPrice ? formatRupee(line.agreedPrice) : 'Price on request'}
                  </p>
                </li>
              ))}
            </ul>
            {order.items.some((item) => !item.agreedPrice) ? (
              <p className="text-sm text-ink2">
                A price-on-request line stays as it is. The wholesaler quotes that line.
              </p>
            ) : null}
            <CatalogPicker
              token={token}
              wholesalerId={order.wholesaler.id}
              chosenIds={
                new Set([
                  ...order.items.flatMap((item) =>
                    item.catalogProductId ? [item.catalogProductId] : [],
                  ),
                  ...additions.map((line) => line.catalogProductId),
                ])
              }
              onPick={(product) => addCatalogProduct(order, product)}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <p className="min-w-0 flex-1 text-sm text-ink2">
                {proposal.length === 0
                  ? 'Change a quantity or add an item. The proposal is sent only for what differs from the current order.'
                  : 'Send this proposal. The wholesaler accepts it or keeps the current order.'}
              </p>
              <button
                type="submit"
                disabled={proposal.length === 0}
                className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
              >
                Propose change
              </button>
            </div>
          </form>
        </section>
      ) : null}
      {showEditor && token && order ? (
        <section className="rounded-xl border border-line bg-white p-4">
          <OrderLineEditor
            token={token}
            order={order}
            onClose={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              setNotice('The order was updated.');
              void loadRetailerOrder(token, orderId)
                .then(applyOrder)
                .catch(() => undefined);
            }}
          />
        </section>
      ) : null}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="grid gap-3 rounded-xl border border-line bg-white p-4">
          {order ? (
            <>
              <h2 className="text-md font-semibold text-ink">Order slip</h2>
              <OrderProgress status={order.status} />
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-navy text-left">
                      {['Product', 'Qty', 'Price', 'Amount'].map((heading) => (
                        <th
                          key={heading}
                          className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-white"
                        >
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => {
                      const line = openLine(order, item.catalogProductId);
                      const quantity = line?.toQuantity ?? item.quantity;
                      return (
                        <tr key={item.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2 text-sm font-medium text-ink">
                            {item.productName}
                          </td>
                          <td className="px-3 py-2 text-sm text-ink">
                            {quantity}
                            {line && line.fromQuantity !== quantity ? (
                              <span className="mt-0.5 block text-xs text-amber">
                                was {line.fromQuantity}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {item.agreedPrice ? (
                              <span className="text-ink">{formatRupee(item.agreedPrice)}</span>
                            ) : (
                              <span className="inline-flex rounded-full bg-amber-soft px-2 py-0.5 text-xs font-medium text-amber">
                                Price on request
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm font-medium text-ink">
                            {item.agreedPrice
                              ? formatRupee(centsToMoney(moneyToCents(item.agreedPrice) * quantity))
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(order.openAmendment ?? []).length > 0 && pending ? (
                <p className="text-xs text-amber">Quantities include the open order amendment.</p>
              ) : null}
              <ProposedAdditions lines={order.openAmendment ?? []} />
              {receiptTotal(order) ? (
                <p className="text-sm font-semibold text-ink">
                  Total {formatRupee(receiptTotal(order) ?? '0.00')}
                </p>
              ) : (
                <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber">
                  {order.pricesVisible
                    ? 'A line is price on request, so this order has no total until the wholesaler quotes it.'
                    : 'Prices are on request for this wholesaler.'}
                </p>
              )}
              {order.notes ? <p className="text-sm text-ink2">{order.notes}</p> : null}
            </>
          ) : (
            <div className="h-32 animate-pulse rounded-lg bg-canvas" />
          )}
        </section>
        <section className="grid content-start gap-3 rounded-xl border border-line bg-white p-4">
          <h2 className="text-md font-semibold text-ink">Chat</h2>
          <ul className="grid max-h-80 gap-2 overflow-y-auto rounded-lg border border-line bg-canvas p-3">
            {order?.messages.map((message) => (
              <li key={message.id} className="rounded-lg bg-white px-3 py-2 text-sm text-ink">
                {message.amendment ? (
                  <button type="button" onClick={() => setAmendment(message)} className="text-left">
                    <span className="text-ink3">{message.senderName}: </span>
                    <span className="font-medium text-action">Order amendment</span>
                    <span className="mt-0.5 block">
                      {amendmentSummary(message.amendment.lines)}
                    </span>
                  </button>
                ) : (
                  <>
                    <span className="text-ink3">{message.senderName}: </span>
                    {message.content}
                  </>
                )}
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!socket || draft.trim().length === 0) {
                return;
              }
              const content = draft.trim();
              setDraft('');
              void sendOrderChatMessage(socket, orderId, content).catch(() => {
                setNotice('The message could not be sent');
              });
            }}
          >
            <input
              aria-label="Message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="min-h-[44px] flex-1 rounded-lg border border-line px-3 text-sm text-ink outline-none focus:border-action"
            />
            <button
              type="submit"
              className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white"
            >
              Send
            </button>
          </form>
          {ask && token && order ? (
            <div
              className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
              role="presentation"
            >
              <div
                role="dialog"
                aria-modal="true"
                className="grid w-full max-w-md gap-3 rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
              >
                <h2 className="text-lg font-semibold text-ink">
                  {ask === 'cancel' ? 'Cancel this order?' : 'Ask the wholesaler to cancel?'}
                </h2>
                <p className="text-sm text-ink2">
                  {ask === 'cancel'
                    ? 'This pending order is cancelled now. The wholesaler sees that in the order chat.'
                    : 'A confirmed order stays in place until the wholesaler accepts. They are asked on WhatsApp to call you and discuss it. They can also keep the current order.'}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setAsk(null)}
                    className="min-h-11 flex-1 rounded-lg border border-line text-sm text-ink2"
                  >
                    Keep order
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      const action =
                        ask === 'cancel'
                          ? cancelRetailerOrder(token, order.id)
                          : requestRetailerOrderCancellation(token, order.id);
                      void action
                        .then((message) => {
                          setAsk(null);
                          setNotice(
                            typeof message === 'string' ? message : 'The order was cancelled.',
                          );
                          return loadRetailerOrder(token, orderId).then(applyOrder);
                        })
                        .catch((caught: unknown) => {
                          setNotice(
                            caught instanceof Error
                              ? caught.message
                              : 'The order could not be updated',
                          );
                        })
                        .finally(() => setBusy(false));
                    }}
                    className="min-h-11 flex-1 rounded-lg bg-danger text-sm font-medium text-white disabled:opacity-60"
                  >
                    {busy ? 'Saving…' : ask === 'cancel' ? 'Cancel order' : 'Request cancellation'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {amendment?.amendment && order ? (
            <div
              className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 sm:items-center"
              role="presentation"
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="amendment-title"
                className="grid max-h-[92vh] w-full max-w-md gap-3 overflow-y-auto rounded-t-xl border border-line bg-white p-4 sm:rounded-xl"
              >
                <h2 id="amendment-title" className="text-lg font-semibold text-ink">
                  Order amendment
                </h2>
                <p className="text-sm text-ink2">
                  Proposed by {amendment.senderName} on {proposedWhen(amendment.createdAt)}.
                </p>
                <ul className="grid gap-3">
                  {amendment.amendment.lines.map((line) => (
                    <li
                      key={`${line.productName}-${line.fromQuantity}-${line.toQuantity}`}
                      className="text-sm text-ink"
                    >
                      {describeAmendment(line, unitPrice(order, line.productName))}
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-ink2">{amendmentStatus(amendment.amendment.status)}</p>
                <button
                  type="button"
                  onClick={() => setAmendment(null)}
                  className="min-h-11 rounded-lg border border-line text-sm text-ink2"
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function readProposedQuantity(raw: string | undefined, current: number): number {
  if (raw === undefined || raw.trim() === '') {
    return current;
  }
  const quantity = Number(raw);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return current;
  }
  return Math.min(10_000, quantity);
}

function proposalChanges(
  order: RetailerOrderDetail,
  quantities: Record<string, string>,
  additions: readonly AddedLine[],
): Array<{ catalogProductId: string; quantity: number; agreedPrice: string | null }> {
  const changed = order.items.flatMap((item) => {
    if (!item.catalogProductId || !item.agreedPrice) {
      return [];
    }
    const current = shownQuantity(order, item);
    const quantity = readProposedQuantity(quantities[item.id], current);
    if (quantity === current) {
      return [];
    }
    return [{ catalogProductId: item.catalogProductId, quantity, agreedPrice: item.agreedPrice }];
  });
  return [
    ...changed,
    ...additions.map((line) => ({
      catalogProductId: line.catalogProductId,
      quantity: line.quantity,
      agreedPrice: line.agreedPrice,
    })),
  ];
}

function shownQuantity(
  order: RetailerOrderDetail,
  item: RetailerOrderDetail['items'][number],
): number {
  return openLine(order, item.catalogProductId)?.toQuantity ?? item.quantity;
}

function openLine(
  order: RetailerOrderDetail,
  catalogProductId: string | null,
): NonNullable<RetailerOrderDetail['openAmendment']>[number] | undefined {
  if (order.lockedAt || order.status !== 'PENDING' || !catalogProductId) {
    return undefined;
  }
  return (order.openAmendment ?? []).find((line) => line.catalogProductId === catalogProductId);
}

function receiptTotal(order: RetailerOrderDetail): string | null {
  if (order.items.some((item) => !item.agreedPrice)) {
    return order.totalValue;
  }
  const cents = order.items.reduce((sum, item) => {
    const quantity = shownQuantity(order, item);
    return sum + moneyToCents(item.agreedPrice ?? '0.00') * quantity;
  }, 0);
  return centsToMoney(cents);
}

function proposedWhen(iso: string): string {
  const date = parseISO(iso);
  if (Number.isNaN(date.getTime())) {
    return 'an unknown time';
  }
  return format(date, 'd MMM yyyy, h:mm a');
}

function unitPrice(order: RetailerOrderDetail, productName: string): string | null {
  return order.items.find((item) => item.productName === productName)?.agreedPrice ?? null;
}

function describeAmendment(
  line: { productName: string; fromQuantity: number; toQuantity: number },
  price: string | null,
): string {
  if (line.fromQuantity === 0) {
    const amount = price
      ? ` The line amount is ${formatRupee(centsToMoney(moneyToCents(price) * line.toQuantity))}.`
      : '';
    return `Added ${line.productName}, quantity ${line.toQuantity}.${amount} This line is added only if the wholesaler accepts.`;
  }
  const quantity =
    line.toQuantity > line.fromQuantity
      ? `The quantity of ${line.productName} increased from ${line.fromQuantity} to ${line.toQuantity}.`
      : line.toQuantity < line.fromQuantity
        ? `The quantity of ${line.productName} decreased from ${line.fromQuantity} to ${line.toQuantity}.`
        : `The quantity of ${line.productName} stays at ${line.toQuantity}.`;
  if (!price) {
    return `${quantity} This line is price on request, so the wholesaler quotes the amount.`;
  }
  const fromAmount = moneyToCents(price) * line.fromQuantity;
  const toAmount = moneyToCents(price) * line.toQuantity;
  const change = Math.abs(toAmount - fromAmount);
  if (change === 0) {
    return `${quantity} The line amount stays ${formatRupee(centsToMoney(toAmount))}.`;
  }
  const direction = toAmount > fromAmount ? 'increases' : 'decreases';
  return `${quantity} The line amount ${direction} by ${formatRupee(centsToMoney(change))}, from ${formatRupee(centsToMoney(fromAmount))} to ${formatRupee(centsToMoney(toAmount))}.`;
}

function amendmentStatus(status: 'PENDING' | 'ACCEPTED' | 'DECLINED'): string {
  if (status === 'ACCEPTED') {
    return 'The wholesaler accepted this amendment.';
  }
  if (status === 'DECLINED') {
    return 'The wholesaler declined this amendment.';
  }
  return 'This amendment is waiting for the wholesaler.';
}

function amendmentSummary(
  lines: ReadonlyArray<{ productName: string; fromQuantity: number; toQuantity: number }>,
): string {
  return lines
    .map((line) =>
      line.fromQuantity === 0
        ? `Added ${line.productName} × ${line.toQuantity}`
        : line.fromQuantity === line.toQuantity
          ? `${line.productName} quantity ${line.toQuantity}`
          : `${line.productName} ${line.fromQuantity} → ${line.toQuantity}`,
    )
    .join('; ');
}

function ProposedAdditions({
  lines,
}: {
  lines: ReadonlyArray<{ productName: string; fromQuantity: number; toQuantity: number }>;
}): React.ReactElement | null {
  const added = lines.filter((line) => line.fromQuantity === 0);
  if (added.length === 0) {
    return null;
  }
  return (
    <p className="text-sm text-amber">
      Waiting for the wholesaler:{' '}
      {added.map((line) => `${line.productName} × ${line.toQuantity}`).join(', ')}.
    </p>
  );
}

function appendMessage(messages: readonly ChatLine[], message: ChatLine): ChatLine[] {
  if (messages.some((current) => current.id === message.id)) {
    return [...messages];
  }
  return [...messages, message];
}
