'use client';

import { useEffect, useState } from 'react';
import Markdown from './Markdown';

/**
 * Shows an answer as it is typed out, like Claude / ChatGPT. Text arriving from the stream
 * is revealed smoothly frame by frame: steady when tokens trickle in, catching up quickly
 * when a large piece arrives at once. Answers loaded from history render instantly.
 */
export default function TypedAnswer({
  text,
  streaming,
  animate,
  onDone,
}: {
  text: string;
  /** More text may still arrive. */
  streaming: boolean;
  /** Type this answer out (false for answers loaded from history). */
  animate: boolean;
  /** Called once everything received has been shown and the stream has ended. */
  onDone?: () => void;
}) {
  const [shown, setShown] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (shown >= text.length) return;
    const id = requestAnimationFrame(() => {
      const behind = text.length - shown;
      // About 2-3 characters per frame normally; far behind -> close the gap in ~10 frames.
      setShown((n) => Math.min(text.length, n + Math.max(2, Math.ceil(behind / 10))));
    });
    return () => cancelAnimationFrame(id);
  }, [shown, text]);

  const caughtUp = shown >= text.length;
  useEffect(() => {
    if (caughtUp && !streaming) onDone?.();
  }, [caughtUp, streaming, onDone]);

  const typing = streaming || !caughtUp;
  return (
    <div className={`answer${typing ? ' typing' : ''}`}>
      {text.length === 0 && streaming ? (
        <span className="cursor-only" aria-hidden="true" />
      ) : (
        <Markdown text={typing ? text.slice(0, shown) : text} />
      )}
    </div>
  );
}
