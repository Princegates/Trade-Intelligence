"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** A timestamp in the viewer's own timezone. The server doesn't know it, so
 * the first render (server and hydration) shows UTC, labelled as such, and
 * the browser swaps in local time straight after. */
export function LocalTime({ iso }: { iso: string }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  const date = new Date(iso);

  return (
    <time dateTime={iso} title={date.toISOString()} className="whitespace-nowrap">
      {isClient
        ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" })
        : `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`}
    </time>
  );
}
