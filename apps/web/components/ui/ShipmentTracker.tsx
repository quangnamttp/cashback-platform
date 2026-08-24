'use client';

type StageDef = {
  key: string;
  icon: string;
  labelKey: string;
};

const STAGES: StageDef[] = [
  { key: 'ordered', icon: '🛒', labelKey: 'ship_stage_ordered' },
  { key: 'preparing', icon: '🏪', labelKey: 'ship_stage_preparing' },
  { key: 'shipping', icon: '🚚', labelKey: 'ship_stage_shipping' },
  { key: 'delivered', icon: '📬', labelKey: 'ship_stage_delivered' },
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
