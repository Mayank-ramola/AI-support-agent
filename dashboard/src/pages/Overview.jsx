import { api } from "../api.js";
import { usePolling } from "../usePolling.js";

export default function Overview({ goTo }) {
  const { data: s, error } = usePolling(() => api("/stats"), 10000);

  const cards = s && [
    ["Conversations", s.conversations],
    ["Waiting for a person", s.waitingForHuman, s.waitingForHuman > 0 ? "warn" : ""],
    ["Open tickets", s.openTickets],
    ["Handled by the AI", s.handledByAI == null ? "–" : `${s.handledByAI}%`],
    ["Average confidence", s.avgConfidence == null ? "–" : s.avgConfidence.toFixed(2)],
    ["AI replies", s.assistantReplies],
  ];

  return (
    <>
      <h1>Overview</h1>
      {error && <p className="error">{error}</p>}
      {!s && !error && <p className="muted">Loading…</p>}
      <div className="stats">
        {cards?.map(([label, value, tone]) => (
          <div className={`stat ${tone || ""}`} key={label}>
            <div className="stat-value">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>
      {s && s.waitingForHuman > 0 && (
        <p className="callout">
          {s.waitingForHuman} chat{s.waitingForHuman > 1 ? "s are" : " is"} waiting for a person.{" "}
          <button className="link" onClick={() => goTo("conversations")}>Open conversations</button>
        </p>
      )}
      {s && s.conversations === 0 && <p className="muted">No chats yet. Open the demo store and talk to the chat widget.</p>}
    </>
  );
}
