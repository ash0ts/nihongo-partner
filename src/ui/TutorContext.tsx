import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import type { DisplayMode } from "../content/schema";
import type { InteractionEvent } from "../engine/events";
import { fetchTutorStatus } from "../engine/tutor-client";
import type { TutorStatus } from "../engine/tutor-types";

/**
 * Makes the Sensei agent's availability and the learner's identity available to any
 * drill surface without prop drilling. `status` is null on static hosts (no server).
 */
export interface TutorContextValue {
  status: TutorStatus | null;
  sessionId: string;
  mode: DisplayMode;
  /** Tail of the interaction log, sent with each request so the agent sees recent misses. */
  recentEvents: () => InteractionEvent[];
}

const TutorCtx = createContext<TutorContextValue>({
  status: null,
  sessionId: "anonymous",
  mode: "bridge",
  recentEvents: () => [],
});

export function TutorProvider({
  sessionId,
  mode,
  events,
  children,
}: {
  sessionId: string;
  mode: DisplayMode;
  events: InteractionEvent[];
  children: ReactNode;
}) {
  const [status, setStatus] = useState<TutorStatus | null>(null);
  useEffect(() => {
    let live = true;
    fetchTutorStatus().then((s) => {
      if (live) setStatus(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <TutorCtx.Provider value={{ status, sessionId, mode, recentEvents: () => events.slice(-60) }}>
      {children}
    </TutorCtx.Provider>
  );
}

export function useTutor(): TutorContextValue {
  return useContext(TutorCtx);
}
