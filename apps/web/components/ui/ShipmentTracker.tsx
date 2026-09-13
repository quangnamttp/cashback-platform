'use client';

type StageDef = {
  key: string;
  icon: string;
  labelKey: string;
};

// Tracks the CASHBACK approval pipeline (order.status + cashbackLedger's own
// status — see cashback/page.tsx's deriveCashbackStage), not real shipping —
// this site has no logistics API integration, so it must never claim to
// know the courier's real status (renamed 2026-09-13, was ordered/preparing/
// shipping/delivered with truck/mailbox icons implying real tracking).
// pending's 🕐 and confirmed's 👍 (2026-09-13, was ⏳/✅) — the checkmark
// shape ✅ looked identical to isPast's own '✓' glyph below (the "already
// done" steps), reading as a confusing repeat instead of a distinct
// current-step icon.
const STAGES: StageDef[] = [
  { key: 'recorded', icon: '🛒', labelKey: 'ship_stage_ordered' },
  { key: 'pending', icon: '🕐', labelKey: 'ship_stage_preparing' },
  { key: 'confirmed', icon: '👍', labelKey: 'ship_stage_shipping' },
  { key: 'released', icon: '💰', labelKey: 'ship_stage_delivered' },
];

export function ShipmentTracker({ stage, t }: { stage: number; t: (key: any) => string }) {
  return (
    <div className="ship-tracker">
      {STAGES.map((s, index) => {
        const isDone = index <= stage;
        const isCurrent = index === stage;
        // A completed PAST step (done but no longer current) shows a plain
        // checkmark instead of repeating its own icon — the common
        // "checked off" convention, and it reads more clearly than e.g. an
        // hourglass ⏳ still showing once that step is actually finished.
        const isPast = isDone && !isCurrent;
        const labelClass = isCurrent ? 'ship-tracker-label current' : isDone ? 'ship-tracker-label done' : 'ship-tracker-label';
        return (
          <div key={s.key} className="ship-tracker-step">
            {index < STAGES.length - 1 && (
              <div className={`ship-tracker-line${index < stage ? ' done' : ''}`} />
            )}
            <div className="ship-tracker-node-wrap">
              <div className={`ship-tracker-node${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
                {isPast ? '✓' : s.icon}
              </div>
            </div>
            <span className={labelClass}>{t(s.labelKey)}</span>
          </div>
        );
      })}
    </div>
  );
}
