'use client';

import type { RetailerAlert } from '@optiworld/shared';
import { Bell, FlaskConical } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { formatRelativeTime } from '@/components/retailer/dashboard-format';

import {
  loadLabNotifications,
  markAllLabNotificationsRead,
  markLabNotificationRead,
} from './lab-notifications-api';

export function LabNotifications(): React.ReactElement {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const router = useRouter();
  const [rows, setRows] = useState<RetailerAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    let active = true;
    void loadLabNotifications(token)
      .then((next) => {
        if (active) {
          setRows(next);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Notifications could not be loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [token]);

  const unread = rows?.some((row) => !row.isRead) ?? false;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">Notifications</h2>
          <p className="text-sm text-ink2">
            A notice appears here when a shop assigns a job to this laboratory.
          </p>
        </div>
        <button
          type="button"
          disabled={!token || !unread}
          className="min-h-11 rounded-lg border border-line bg-white px-4 text-sm text-ink2 disabled:opacity-50"
          onClick={() => {
            if (!token) {
              return;
            }
            void markAllLabNotificationsRead(token)
              .then(() => loadLabNotifications(token))
              .then((next) => {
                setRows(next);
                setError(null);
              })
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'Notifications could not be updated',
                );
              });
          }}
        >
          Mark all read
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {rows === null && !error ? <div className="h-24 animate-pulse rounded-xl bg-white" /> : null}
      {rows?.length === 0 ? (
        <div className="rounded-xl border border-line bg-white p-6 text-center">
          <Bell className="mx-auto text-ink3" size={20} aria-hidden="true" />
          <h3 className="mt-2 text-md font-semibold text-ink">No notifications</h3>
          <p className="text-sm text-ink2">Assigned jobs will show up here.</p>
        </div>
      ) : null}
      <ul className="grid gap-3">
        {rows?.map((row) => (
          <li
            key={row.id}
            className={`rounded-xl border border-line border-l-4 border-l-action bg-white p-4 ${row.isRead ? 'opacity-70' : ''}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-action-soft text-action">
                  <FlaskConical size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{row.title}</p>
                  <p className="text-sm text-ink2">{row.body}</p>
                  <p className="mt-1 text-xs text-ink3">
                    {formatRelativeTime(row.createdAt)} · {row.isRead ? 'Read' : 'Unread'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {row.relatedEntityType === 'LabJob' && row.relatedEntityId ? (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg bg-action px-3 text-sm font-medium text-white"
                    onClick={() => {
                      const jobId = row.relatedEntityId;
                      if (!token || !jobId) {
                        return;
                      }
                      const open = (): void => {
                        router.push(`/laboratory/jobs?job=${jobId}`);
                      };
                      if (row.isRead) {
                        open();
                        return;
                      }
                      void markLabNotificationRead(token, row.id)
                        .then(open)
                        .catch((caught: unknown) => {
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : 'This notification could not be opened',
                          );
                        });
                    }}
                  >
                    Open job
                  </button>
                ) : null}
                {row.isRead ? null : (
                  <button
                    type="button"
                    className="min-h-11 rounded-lg border border-line bg-white px-3 text-sm text-ink2"
                    onClick={() => {
                      if (!token) {
                        return;
                      }
                      void markLabNotificationRead(token, row.id).then((next) => {
                        setRows(
                          (current) =>
                            current?.map((item) => (item.id === next.id ? next : item)) ?? null,
                        );
                      });
                    }}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
