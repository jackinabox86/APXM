import { useMemo, useState } from 'react';
import { Card } from '../shared';
import { useBalancesStore } from '../../stores/entities/balances';

function formatAmount(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}

export function CashBalancePane() {
  const [expanded, setExpanded] = useState(false);
  const fetched = useBalancesStore((s) => s.fetched);
  const entities = useBalancesStore((s) => s.entities);
  const balances = useMemo(
    () => Array.from(entities.values())
      .filter((b) => b.currency !== 'ECD')
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    [entities]
  );

  const highest = useMemo(
    () => balances.length > 0
      ? balances.reduce((max, b) => b.amount > max.amount ? b : max, balances[0])
      : null,
    [balances]
  );

  return (
    <Card>
      {!fetched ? (
        <p className="text-xs text-apxm-muted animate-pulse">Loading balances...</p>
      ) : (
        <div>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-full flex items-center justify-between text-xs text-apxm-text cursor-pointer"
          >
            <span className="font-medium">
              CASH{highest ? ` (${highest.currency})` : ''} <span className="text-apxm-muted">…</span>
            </span>
            {highest && (
              <span className="tabular-nums">{formatAmount(highest.amount)}</span>
            )}
          </button>
          {expanded && (
            <div className="mt-1 space-y-0.5">
              {balances.map((bal) => (
                <div key={bal.currency} className="flex items-center justify-between">
                  <span className="text-xs text-apxm-muted">{bal.currency}</span>
                  <span className="text-xs text-apxm-text tabular-nums">
                    {formatAmount(bal.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
