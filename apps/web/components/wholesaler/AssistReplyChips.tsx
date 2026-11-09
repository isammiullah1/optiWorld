'use client';

export type AssistChip = {
  id: string;
  label: string;
  text: string;
  disabled?: boolean;
  isAi?: boolean;
  tooltip?: string;
};

type AssistReplyChipsProps = {
  chips: readonly AssistChip[];
  loading: boolean;
  activeId: string | null;
  onInsert: (chip: AssistChip) => void;
};

export function AssistReplyChips({
  chips,
  loading,
  activeId,
  onInsert,
}: AssistReplyChipsProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 overflow-x-auto px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <span className="shrink-0 text-xs text-ink3">Quick reply</span>
      {loading
        ? [0, 1, 2].map((slot) => (
            <span key={slot} className="h-7 w-24 shrink-0 animate-pulse rounded-full bg-canvas" />
          ))
        : chips.map((chip) =>
            chip.isAi ? (
              <span
                key={chip.id}
                title={chip.tooltip ?? 'Planned for Version 2'}
                className="shrink-0 cursor-default rounded-full border border-purp bg-purp-soft px-3 py-1 text-xs text-purp"
              >
                {chip.label.startsWith('✦') ? chip.label : `✦ ${chip.label}`}
              </span>
            ) : (
              <button
                key={chip.id}
                type="button"
                disabled={chip.disabled}
                title={chip.tooltip}
                aria-pressed={activeId === chip.id}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs ${
                  activeId === chip.id
                    ? 'border-action bg-action-soft text-action'
                    : 'border-line text-ink2 hover:border-action hover:bg-action-soft hover:text-action'
                } disabled:cursor-default`}
                onClick={() => onInsert(chip)}
              >
                {chip.label}
              </button>
            ),
          )}
    </div>
  );
}
