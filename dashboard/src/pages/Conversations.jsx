import { useState } from "react";
import { api } from "../api.js";
import { timeAgo, usePolling } from "../usePolling.js";

const FILTERS = [
  ["", "All"],
  ["needs_human", "Needs a person"],
  ["human", "With a person"],
  ["ai", "AI"],
  ["resolved", "Resolved"],
];
const LABEL = { ai: "AI", needs_human: "Needs a person", human: "With a person", resolved: "Resolved" };

function Detail({ id, onChanged }) {
  const { data: conv, error, reload } = usePolling(() => api(`/conversations/${id}`), 5000, [id]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  if (error) return <p className="error">{error}</p>;
  if (!conv) return <p className="muted">Loading…</p>;

  const reply = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await api(`/conversations/${id}/reply`, { method: "POST", body: { text } });
      setText("");
      setErr("");
      await reload();
      onChanged();
    } catch (e2) {
      setErr(e2.message);
    }
  };
  const setStatus = async (status) => {
    await api(`/conversations/${id}`, { method: "PATCH", body: { status } });
    await reload();
    onChanged();
  };

  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <span className={`pill ${conv.status}`}>{LABEL[conv.status]}</span>{" "}
          <span className="muted">{conv.customerEmail || "no email yet"}</span>
          {conv.ticket && <span className="muted"> · ticket {conv.ticket.number}</span>}
          {conv.handoffReason && <span className="muted"> · reason: {conv.handoffReason.replaceAll("_", " ")}</span>}
        </div>
        {conv.status === "resolved" ? (
          <button className="btn" onClick={() => setStatus("ai")}>Reopen</button>
        ) : (
          <button className="btn" onClick={() => setStatus("resolved")}>Mark resolved</button>
        )}
      </div>

      <div className="thread">
        {conv.messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            <div className="bubble-meta">
              {m.role === "user" ? "Customer" : m.role === "human" ? "Support agent" : "AI assistant"} · {timeAgo(m.createdAt)}
              {typeof m.confidence === "number" && (
                <span className={`conf ${m.confidence < 0.6 ? "low" : ""}`}> · confidence {m.confidence.toFixed(2)}</span>
              )}
            </div>
            <div>{m.content}</div>
            {m.draft && (
              <div className="draft">
                <strong>AI draft (not sent to the customer):</strong> {m.draft}
              </div>
            )}
            {m.sources?.length > 0 && <div className="meta-line">Sources: {[...new Set(m.sources.map((s) => s.title))].join(", ")}</div>}
            {m.toolsUsed?.length > 0 && <div className="meta-line">Tools: {m.toolsUsed.join(", ")}</div>}
          </div>
        ))}
      </div>

      <form className="reply" onSubmit={reply}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply to the customer. The AI stops answering this chat once you reply." rows={3} />
        <div className="reply-actions">
          {err && <span className="error">{err}</span>}
          <button className="btn primary" disabled={!text.trim()}>Send reply</button>
        </div>
      </form>
    </div>
  );
}

export default function Conversations() {
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const { data: list, error, reload } = usePolling(() => api(`/conversations${status ? `?status=${status}` : ""}`), 5000, [status]);

  return (
    <>
      <h1>Conversations</h1>
      <div className="filters">
        {FILTERS.map(([value, label]) => (
          <button key={value} className={status === value ? "chip active" : "chip"} onClick={() => setStatus(value)}>{label}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="split">
        <ul className="conv-list">
          {list?.length === 0 && <li className="muted pad">No conversations here.</li>}
          {list?.map((c) => (
            <li key={c.id}>
              <button className={selected === c.id ? "conv active" : "conv"} onClick={() => setSelected(c.id)}>
                <span className="conv-top">
                  <span className={`pill ${c.status}`}>{LABEL[c.status]}</span>
                  <span className="muted">{timeAgo(c.lastActivity)}</span>
                </span>
                <span className="conv-preview">{c.preview || "(empty)"}</span>
                <span className="muted small">
                  {c.customerEmail || "no email"} · {c.messageCount} msgs
                  {c.lowestConfidence != null && ` · lowest confidence ${c.lowestConfidence.toFixed(2)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <section className="detail-wrap">
          {selected ? <Detail key={selected} id={selected} onChanged={reload} /> : <p className="muted pad">Select a conversation to read it.</p>}
        </section>
      </div>
    </>
  );
}
