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
const STAGES: StageDef[] = [
  { key: 'recorded', icon: '🛒', labelKey: 'ship_stage_ordered' },
  { key: 'pending', icon: '⏳', labelKey: 'ship_stage_preparing' },
  { key: 'confirmed', icon: '✅', labelKey: 'ship_stage_shipping' },
  { key: 'released', icon: '💰', labelKey: 'ship_stage_delivered' },
];

export function ShipmentTracker({ stage, t }: { stage: number; t: (key: any) => string }) {
  return (
    <div className="ship-tracker">
      {STAGES.map((s, index) => {
        const isDone = index <= stage;
        const isCurrent = index === stage;
        return (
          <div key={s.key} className="ship-tracker-step">
            <div className="ship-tracker-node-wrap">
              <div className={`ship-tracker-node${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}>
                {s.icon}
              </div>
              {index < STAGES.length - 1 && (
                <div className={`ship-tracker-line${index < stage ? ' done' : ''}`} />
              )}
            </div>
            <span className={isDone ? 'ship-tracker-label done' : 'ship-tracker-label'}>{t(s.labelKey)}</span>
          </div>
        );
      })}
    </div>
  );
}
