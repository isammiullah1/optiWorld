import type { ReplyChip } from '@optiworld/shared';
import { format, parseISO } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Socket } from 'socket.io-client';

import { getAccessToken } from '../../services/auth-service';
import {
  confirmOrderChat,
  connectOrderChat,
  joinOrderChat,
  respondToOrderChange,
  sendOrderChatMessage,
} from '../../services/order-chat';
import { colors } from '../../theme/colors';
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

type OrderChatScreenProps = {
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

export function OrderChatScreen(props: OrderChatScreenProps): React.ReactElement {
  const {
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
  } = props;
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
  const [toast, setToast] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const listRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const stickRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);
  const lockedRef = useRef(locked);
  const itemsRef = useRef(items);
  const onChangedRef = useRef(onOrderChanged);
  lockedRef.current = locked;
  itemsRef.current = items;
  onChangedRef.current = onOrderChanged;

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = setTimeout(() => setToast(null), 2_500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (stickRef.current) {
      listRef.current?.scrollToEnd({ animated: false });
      setShowJump(false);
      return;
    }
    setShowJump(true);
  }, [messages]);

  useEffect(() => {
    let active = true;
    let socket: Socket | null = null;

    const append = (message: ChatMessage): void => {
      setMessages((current) =>
        current.some((entry) => entry.id === message.id) ? current : [...current, message],
      );
    };

    const refreshChips = (bypassCache: boolean): void => {
      void getAccessToken()
        .then((token) => (token ? loadSuggestedReplies(token, orderId, bypassCache) : []))
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

    const join = (current: Socket): void => {
      void joinOrderChat(current, orderId)
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

    void connectOrderChat()
      .then((current) => {
        if (!active) {
          current.disconnect();
          return;
        }
        socket = current;
        socketRef.current = current;
        current.on('connect', () => {
          if (!active) {
            return;
          }
          setLink('live');
          join(current);
        });
        current.on('disconnect', () => {
          if (active) {
            setLink('reconnecting');
          }
        });
        current.on('message_received', (payload: unknown) => {
          const parsed = ChatMessageSchema.safeParse(payload);
          if (!parsed.success) {
            return;
          }
          append(parsed.data);
          refreshChips(false);
        });
        current.on('change_proposed', (payload: unknown) => {
          const parsed = ChangeProposedSchema.safeParse(payload);
          if (!parsed.success) {
            return;
          }
          if (lockedRef.current) {
            append(localSystemMessage('Order is locked — changes not possible'));
            return;
          }
          setChanges((existing) => ({
            ...existing,
            [parsed.data.chatMessageId]: cardFromProposal(parsed.data, itemsRef.current),
          }));
        });
        current.on('change_responded', (payload: unknown) => {
          const parsed = ChangeRespondedSchema.safeParse(payload);
          if (!parsed.success) {
            return;
          }
          setChanges((existing) => {
            const next = { ...existing };
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
        current.on('order_confirmed', () => {
          setLocked(true);
          setStatus('CONFIRMED');
          onChangedRef.current?.();
        });
        current.on('order_status_updated', (payload: unknown) => {
          const parsed = StatusUpdatedSchema.safeParse(payload);
          if (!parsed.success) {
            return;
          }
          setStatus(parsed.data.status);
          onChangedRef.current?.();
        });
        if (current.connected) {
          setLink('live');
          join(current);
        }
        refreshChips(false);
      })
      .catch(() => {
        if (active) {
          setToast('Could not open this chat');
        }
      });

    return () => {
      active = false;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [orderId]);

  function insertChip(chip: ReplyChip): void {
    if (chip.isAi) {
      setToast('Planned for Version 2');
      return;
    }
    if (chip.disabled) {
      return;
    }
    if (chip.text.trim().length === 0) {
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
        setToast('Could not send');
        return;
      }
      const token = await getAccessToken();
      if (token) {
        setChips(await loadSuggestedReplies(token, orderId, true));
      }
    } catch {
      setDraft(content);
      setToast('Could not send');
    }
  }

  function askConfirm(): void {
    if (locked) {
      setToast('This order is already confirmed');
      return;
    }
    Alert.alert(
      `Confirm order #${reference}?`,
      'This will lock the order. Neither party can make changes after confirmation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm order',
          onPress: () => {
            const socket = socketRef.current;
            if (!socket) {
              return;
            }
            void confirmOrderChat(socket, orderId)
              .then((raw) => {
                const parsed = ActionAckSchema.safeParse(raw);
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
              })
              .catch(() => setToast('Could not confirm this order'));
          },
        },
      ],
    );
  }

  async function respond(changeRequestId: string, action: 'ACCEPT' | 'DECLINE'): Promise<void> {
    const socket = socketRef.current;
    if (!socket || lockedRef.current) {
      return;
    }
    try {
      const parsed = ActionAckSchema.safeParse(
        await respondToOrderChange(socket, changeRequestId, action),
      );
      if (!parsed.success || !parsed.data.success) {
        setToast(
          parsed.success && parsed.data.error?.code === 'ORDER_LOCKED'
            ? 'This order is already confirmed'
            : 'Could not update the change',
        );
      }
    } catch {
      setToast('Could not update the change');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Order chat — #{reference}</Text>
          {link === 'reconnecting' ? <Text style={styles.reconnect}>Reconnecting...</Text> : null}
        </View>
        <Text style={styles.meta}>
          {retailerName}
          {retailerCity ? ` · ${retailerCity}` : ''}
        </Text>
        {retailerPhone ? (
          <Text
            style={styles.phone}
            onPress={() => void Linking.openURL(`tel:${retailerPhone}`)}
            accessibilityRole="link"
          >
            {retailerPhone}
          </Text>
        ) : (
          <Text style={styles.meta}>No phone</Text>
        )}
      </View>
      <Pressable style={styles.summaryToggle} onPress={() => setSummaryOpen((open) => !open)}>
        <Text style={styles.summaryLabel}>Order summary · {statusLabel(status)}</Text>
        <Text style={styles.meta}>{summaryOpen ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {summaryOpen ? (
        <View style={styles.summary}>
          {items.map((item) => (
            <Text key={item.id} style={styles.body}>
              {item.productName} × {item.quantity}
              {item.agreedPrice ? ` · ₨ ${item.agreedPrice}` : ' · On request'}
            </Text>
          ))}
          <Text style={styles.total}>{total ? `Total ₨ ${total}` : 'Total on request'}</Text>
        </View>
      ) : null}
      <View style={styles.thread}>
        <ScrollView
          ref={listRef}
          contentContainerStyle={styles.threadContent}
          onContentSizeChange={() => {
            if (stickRef.current) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          }}
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            const atBottom = contentSize.height - contentOffset.y - layoutMeasurement.height < 48;
            stickRef.current = atBottom;
            if (atBottom) {
              setShowJump(false);
            }
          }}
          scrollEventThrottle={16}
        >
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              change={changes[message.id]}
              retailerName={retailerName}
              wholesalerOrgId={wholesalerOrgId}
              locked={locked}
              onAccept={(id) => void respond(id, 'ACCEPT')}
              onDecline={(id) => void respond(id, 'DECLINE')}
              onCopy={(content) => {
                void Clipboard.setStringAsync(content).then(() => setToast('Copied'));
              }}
            />
          ))}
        </ScrollView>
        {showJump ? (
          <Pressable
            style={styles.jump}
            onPress={() => {
              stickRef.current = true;
              setShowJump(false);
              listRef.current?.scrollToEnd({ animated: true });
            }}
          >
            <Text style={styles.jumpText}>↓ New message</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.composerSlot}>
        {locked ? (
          <View style={styles.confirmed}>
            <Text style={styles.confirmedText}>🔒 Order confirmed</Text>
          </View>
        ) : (
          <Pressable style={styles.confirm} onPress={askConfirm}>
            <Text style={styles.confirmText}>✓ Confirm order</Text>
          </Pressable>
        )}
        {locked ? null : (
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={chips ?? []}
            keyExtractor={(chip) => chip.id}
            style={styles.chips}
            contentContainerStyle={styles.chipRow}
            ListHeaderComponent={<Text style={styles.chipLabel}>Quick reply</Text>}
            ListEmptyComponent={
              chips === null ? (
                <View style={styles.chipRow}>
                  {[0, 1, 2].map((slot) => (
                    <View key={slot} style={styles.skeleton} />
                  ))}
                </View>
              ) : null
            }
            renderItem={({ item: chip }) => (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={chip.isAi ? false : Boolean(chip.disabled)}
                onPress={() => insertChip(chip)}
                style={[
                  styles.chip,
                  chip.isAi ? styles.chipAi : activeId === chip.id ? styles.chipActive : null,
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    chip.isAi
                      ? styles.chipAiText
                      : activeId === chip.id
                        ? styles.chipActiveText
                        : null,
                  ]}
                >
                  {chip.isAi
                    ? chip.label.startsWith('✦')
                      ? chip.label
                      : `✦ ${chip.label}`
                    : chip.label}
                </Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          multiline
          maxLength={MESSAGE_LIMIT}
          value={draft}
          onChangeText={onDraftChange}
          placeholder="Write a message"
          placeholderTextColor={colors.ink3}
          style={styles.input}
        />
        <Pressable
          accessibilityLabel="Send"
          disabled={draft.trim().length === 0}
          onPress={() => void sendDraft()}
          style={[styles.send, draft.trim().length === 0 ? styles.sendDisabled : null]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
      {draft.length > 400 ? (
        <Text style={[styles.counter, draft.length >= 490 ? styles.counterWarn : null]}>
          {draft.length}/{MESSAGE_LIMIT}
        </Text>
      ) : null}
      {toast ? <Text style={styles.toast}>{toast}</Text> : null}
    </KeyboardAvoidingView>
  );
}

function MessageBubble({
  message,
  change,
  retailerName,
  wholesalerOrgId,
  locked,
  onAccept,
  onDecline,
  onCopy,
}: {
  message: ChatMessage;
  change: ChangeCard | undefined;
  retailerName: string;
  wholesalerOrgId: string | null;
  locked: boolean;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCopy: (content: string) => void;
}): React.ReactElement {
  const time = clock(message.createdAt);
  if (message.messageType === 'SYSTEM') {
    return (
      <Text style={styles.system}>
        {message.content.includes('·') ? message.content : `${message.content} · ${time}`}
      </Text>
    );
  }
  if (message.messageType === 'CHANGE_REQUEST') {
    if (locked && (!change || change.status === 'PENDING')) {
      return <Text style={styles.system}>Order is locked — changes not possible · {time}</Text>;
    }
    if (change) {
      return (
        <View style={styles.change}>
          <Text style={styles.changeLabel}>Change request</Text>
          {change.lines.map((line) => (
            <Text key={`${line.productName}-${line.toQuantity}`} style={styles.body}>
              {line.fromQuantity === 0
                ? `Added ${line.productName} × ${line.toQuantity}`
                : `${line.productName} ${line.fromQuantity} → ${line.toQuantity}`}
            </Text>
          ))}
          {change.status === 'PENDING' && !locked ? (
            <View style={styles.changeActions}>
              <Pressable style={styles.accept} onPress={() => onAccept(change.id)}>
                <Text style={styles.confirmText}>Accept change</Text>
              </Pressable>
              <Pressable onPress={() => onDecline(change.id)}>
                <Text style={styles.decline}>Decline</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.meta}>
              {change.status === 'ACCEPTED' ? 'Accepted' : 'Declined'}
            </Text>
          )}
        </View>
      );
    }
  }
  const mine = Boolean(wholesalerOrgId && message.senderOrgId === wholesalerOrgId);
  return (
    <Pressable
      onLongPress={() => {
        Alert.alert('Message', undefined, [
          { text: 'Close', style: 'cancel' },
          { text: 'Copy', onPress: () => onCopy(message.content) },
        ]);
      }}
      style={mine ? styles.mineWrap : styles.theirsWrap}
    >
      {mine ? null : <Text style={styles.avatar}>{initials(retailerName)}</Text>}
      <View style={mine ? styles.mine : styles.theirs}>
        <Text style={mine ? styles.mineText : styles.body}>{message.content}</Text>
        <Text style={mine ? styles.mineTime : styles.time}>{time}</Text>
      </View>
    </Pressable>
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
  return (
    name
      .trim()
      .split(/\s+/)
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: '600', flexShrink: 1 },
  reconnect: { color: colors.amber, fontSize: 14 },
  meta: { color: colors.ink3, fontSize: 14, marginTop: 2 },
  phone: { color: colors.blue, fontSize: 15, marginTop: 2 },
  summaryToggle: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: { color: colors.ink3, fontSize: 13, fontWeight: '500' },
  summary: { paddingHorizontal: 16, paddingBottom: 8 },
  body: { color: colors.ink, fontSize: 15, marginTop: 2 },
  total: { color: colors.ink, fontSize: 16, fontWeight: '600', marginTop: 6 },
  thread: { flex: 1 },
  threadContent: { padding: 12, gap: 10 },
  jump: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  jumpText: { color: colors.ink, fontSize: 14 },
  system: {
    alignSelf: 'center',
    backgroundColor: colors.canvas,
    color: colors.ink3,
    fontSize: 13,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  theirsWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%' },
  mineWrap: { alignSelf: 'flex-end', maxWidth: '85%' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.canvas,
    color: colors.ink2,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 28,
  },
  theirs: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mine: {
    backgroundColor: colors.blue,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mineText: { color: colors.white, fontSize: 15 },
  time: { color: colors.ink3, fontSize: 13, marginTop: 4 },
  mineTime: { color: colors.blueSoft, fontSize: 13, marginTop: 4 },
  change: {
    backgroundColor: colors.amberSoft,
    borderWidth: 1,
    borderColor: colors.amber,
    borderRadius: 12,
    padding: 12,
  },
  changeLabel: { color: colors.amber, fontSize: 14, fontWeight: '700' },
  changeActions: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center' },
  accept: {
    backgroundColor: colors.teal,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  decline: { color: colors.blue, fontSize: 16 },
  chips: { maxHeight: 52, borderTopWidth: 1, borderTopColor: colors.line },
  chipRow: { alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  chipLabel: { color: colors.ink3, fontSize: 12 },
  skeleton: { width: 96, height: 28, borderRadius: 999, backgroundColor: colors.canvas },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  chipAi: { borderColor: colors.purp, backgroundColor: colors.purpSoft, opacity: 0.7 },
  chipText: { color: colors.ink2, fontSize: 12 },
  chipActiveText: { color: colors.blue },
  chipAiText: { color: colors.purp },
  composerSlot: { backgroundColor: colors.white },
  confirmed: {
    marginHorizontal: 12,
    marginBottom: 8,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmedText: { color: colors.teal, fontSize: 16, fontWeight: '600' },
  confirm: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 8,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 96,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: colors.ink,
    fontSize: 16,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { backgroundColor: colors.line },
  sendText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  counter: {
    textAlign: 'right',
    color: colors.ink3,
    fontSize: 13,
    paddingRight: 16,
    paddingBottom: 8,
  },
  counterWarn: { color: colors.red },
  toast: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: colors.navy,
    color: colors.white,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 15,
  },
});
