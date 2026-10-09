import { useState } from "react";
import { api } from "../api.js";
import { timeAgo, usePolling } from "../usePolling.js";

const STATUSES = [["", "All"], ["open", "Open"], ["in_progress", "In progress"], ["closed", "Closed"]];

export default function Tickets() {
  const [status, setStatus] = useState("");
  const { data: tickets, error, reload } = usePolling(() => api(`/tickets${status ? `?status=${status}` : ""}`), 8000, [status]);
  const [err, setErr] = useState("");

  const change = async (id, value) => {
    try {
      await api(`/tickets/${id}`, { method: "PATCH", body: { status: value } });
      setErr("");
      reload();
    } catch (e) {
      setErr(e.message);
    }
  };

  return (
    <>
      <h1>Tickets</h1>
      <div className="filters">
        {STATUSES.map(([value, label]) => (
          <button key={value} className={status === value ? "chip active" : "chip"} onClick={() => setStatus(value)}>{label}</button>
        ))}
      </div>
      {(error || err) && <p className="error">{error || err}</p>}
      {tickets?.length === 0 && <p className="muted">No tickets yet. They appear when the AI opens one or hands a chat to a person.</p>}
      {tickets?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Ticket</th><th>Subject</th><th>Customer</th><th>Priority</th><th>Created by</th><th>Created</th><th>Status</th></tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t._id}>
                  <td className="mono">{t.number}</td>
                  <td>{t.subject}{t.description && <div className="muted small clamp">{t.description}</div>}</td>
                  <td>{t.customerEmail || <span className="muted">unknown</span>}</td>
                  <td><span className={`prio ${t.priority}`}>{t.priority}</span></td>
                  <td>{t.createdBy === "handoff" ? "Handoff" : "AI agent"}</td>
                  <td>{timeAgo(t.createdAt)}</td>
                  <td>
                    <select value={t.status} onChange={(e) => change(t._id, e.target.value)} aria-label={`Status of ${t.number}`}>
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="closed">Closed</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
