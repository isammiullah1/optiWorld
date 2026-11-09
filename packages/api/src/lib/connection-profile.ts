import type { ConnectionStatus, RetailerSearchHit } from '@optiworld/shared';

export const orgCardSelect = {
  id: true,
  name: true,
  username: true,
  city: true,
  phone: true,
  address: true,
  listingProfileNotes: true,
} as const;

export type OrgCard = {
  id: string;
  name: string;
  username: string | null;
  city: string | null;
  phone: string | null;
  address: string | null;
  listingProfileNotes: string | null;
};

export function retailerSearchHit(
  org: OrgCard,
  link: { status: ConnectionStatus; connectedAt: Date | null } | null,
): RetailerSearchHit {
  return {
    id: org.id,
    name: org.name,
    username: org.username,
    city: org.city,
    phone: org.phone,
    address: org.address,
    about: org.listingProfileNotes,
    connectedAt:
      link?.status === 'APPROVED' && link.connectedAt ? link.connectedAt.toISOString() : null,
    connectionStatus: link?.status ?? null,
  };
}
