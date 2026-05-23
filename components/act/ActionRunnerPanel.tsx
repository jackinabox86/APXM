import { useEffect, useRef } from 'react';
import type { LogTag, LogContent, LogPart } from '../../lib/act/runner/logger';

export interface LogEntry {
  id: number;
  tag: LogTag;
  content: LogContent;
}

interface Props {
  entries: LogEntry[];
  status: string;
  isRunning: boolean;
}

const TAG_STYLES: Record<NonNullable<LogTag>, string> = {
  INFO:    'text-apxm-muted',
  ACTION:  'text-blue-400',
  SUCCESS: 'text-green-400',
  ERROR:   'text-red-400',
  SKIP:    'text-prun-yellow',
  WARNING: 'text-orange-400',
  CANCEL:  'text-apxm-muted',
};

function renderContent(content: LogContent): React.ReactNode {
  if (typeof content === 'string') return content;
  return (content as LogPart[]).map((part, i) => (
    <span key={i} className={part.yellow ? 'text-prun-yellow' : undefined}>
      {part.text}
    </span>
  ));
}

export function ActionRunnerPanel({ entries, status, isRunning }: Props) {
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest entry
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className="flex flex-col gap-2">
      {/* Log area */}
      <div
        ref={logRef}
        className="h-48 overflow-y-auto bg-apxm-bg border border-apxm-accent rounded p-2 font-mono text-xs space-y-0.5"
      >
        {entries.length === 0 ? (
          <p className="text-apxm-muted italic">No output yet.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex gap-2 leading-5">
              {entry.tag !== null && (
                <span className={`shrink-0 ${TAG_STYLES[entry.tag]}`}>
                  [{entry.tag}]
                </span>
              )}
              <span className="break-all text-apxm-text">
                {renderContent(entry.content)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Status row */}
      {(isRunning || status) && (
        <p className="text-xs text-apxm-muted truncate">{status}</p>
      )}

    </div>
  );
}
