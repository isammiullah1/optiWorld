import { AI_REPLY_CHIP, type ReplyChip } from '@optiworld/shared';
import { z } from 'zod';

const CHIP_CACHE_MS = 10_000;

const chipCache = new Map<string, { at: number; chips: ReplyChip[] }>();

const ChangeLineSchema = z.object({
  productName: z.string(),
  fromQuantity: z.number(),
  toQuantity: z.number(),
});

export const ChangeCardSchema = z.object({
  id: z.string(),
  status: z.enum(['PENDING', 'ACCEPTED', 'DECLINED']),
  lines: z.array(ChangeLineSchema),
});

export type ChangeCard = z.infer<typeof ChangeCardSchema>;

const _ChatItemSchema = z.object({
  id: z.string(),
  catalogProductId: z.string().optional(),
  productName: z.string(),
  quantity: z.number(),
  agreedPrice: z.string().nullable(),
});

export type ChatItem = z.infer<typeof _ChatItemSchema>;

export const ChatMessageSchema = z.object({
  id: z.string(),
  senderOrgId: z.string().optional(),
  senderName: z.string().optional(),
  content: z.string(),
  messageType: z.string(),
  createdAt: z.string(),
  changeRequest: ChangeCardSchema.optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const OrderSnapshotSchema = z.object({
  id: z.string(),
  status: z.string(),
  lockedAt: z.string().nullable(),
  totalValue: z.string(),
  retailerOrgId: z.string(),
  wholesalerOrgId: z.string(),
  items: z.array(
    z.object({
      id: z.string(),
      catalogProductId: z.string(),
      productName: z.string(),
      quantity: z.number(),
      agreedPrice: z.string(),
    }),
  ),
});

export const JoinAckSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      order: OrderSnapshotSchema,
      messages: z.array(ChatMessageSchema),
    })
    .optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export const ActionAckSchema = z.object({
  success: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

const ProposedChangeSchema = z.object({
  catalogProductId: z.string(),
  quantity: z.number(),
  agreedPrice: z.string().nullable(),
  productName: z.string().optional(),
  fromQuantity: z.number().optional(),
});

export const ChangeProposedSchema = z.object({
  id: z.string(),
  chatMessageId: z.string(),
  proposedChanges: z.array(ProposedChangeSchema),
});

export const ChangeRespondedSchema = z.object({
  changeRequestId: z.string(),
  action: z.enum(['ACCEPT', 'DECLINE']),
  updatedOrder: OrderSnapshotSchema,
});

export const StatusUpdatedSchema = z.object({
  orderId: z.string(),
  status: z.string(),
});

const ReplyPayloadSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      chips: z.array(
        z.object({
          id: z.string(),
          label: z.string(),
          text: z.string(),
          disabled: z.boolean().optional(),
          tooltip: z.string().optional(),
          isAi: z.boolean().optional(),
        }),
      ),
    })
    .optional(),
});

export function cardFromProposal(
  proposal: z.infer<typeof ChangeProposedSchema>,
  items: readonly ChatItem[],
): ChangeCard {
  return {
    id: proposal.id,
    status: 'PENDING',
    lines: proposal.proposedChanges.map((change) => {
      const item = items.find((entry) => entry.catalogProductId === change.catalogProductId);
      return {
        productName: change.productName ?? item?.productName ?? 'Item',
        fromQuantity: change.fromQuantity ?? item?.quantity ?? change.quantity,
        toQuantity: change.quantity,
      };
    }),
  };
}

export function ensureAiChip(chips: readonly ReplyChip[]): ReplyChip[] {
  const quick = chips.filter((chip) => !chip.isAi && chip.id !== AI_REPLY_CHIP.id);
  const ai = chips.find((chip) => chip.isAi || chip.id === AI_REPLY_CHIP.id) ?? AI_REPLY_CHIP;
  return [...quick, ai];
}

export function localSystemMessage(content: string): ChatMessage {
  return {
    id: `local-${Date.now()}`,
    content,
    messageType: 'SYSTEM',
    createdAt: new Date().toISOString(),
  };
}

export async function loadSuggestedReplies(
  accessToken: string,
  orderId: string,
  bypassCache: boolean,
): Promise<ReplyChip[]> {
  const cached = chipCache.get(orderId);
  if (!bypassCache && cached && Date.now() - cached.at < CHIP_CACHE_MS) {
    return cached.chips;
  }
  const response = await fetch(
    `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/orders/${orderId}/chat/suggested-replies`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    return ensureAiChip([]);
  }
  const parsed = ReplyPayloadSchema.safeParse(await response.json());
  const chips = ensureAiChip(parsed.success ? (parsed.data.data?.chips ?? []) : []);
  chipCache.set(orderId, { at: Date.now(), chips });
  return chips;
}
