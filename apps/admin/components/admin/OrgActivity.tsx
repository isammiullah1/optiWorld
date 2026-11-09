import type { AdminOrgDetail } from '@optiworld/shared';

import { formatWhen } from './format';

export function OrgActivity({ org }: { org: AdminOrgDetail }): React.ReactElement {
  if (org.activity.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink2">
        No audit entries yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {['When', 'Action', 'By'].map((heading) => (
              <th
                key={heading}
                className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink3"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {org.activity.map((entry) => (
            <tr key={entry.id}>
              <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                {formatWhen(entry.createdAt)}
              </td>
              <td className="border-t border-line px-3 py-2 text-sm text-ink">{entry.label}</td>
              <td className="border-t border-line px-3 py-2 text-sm text-ink2">
                {entry.actorName ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
