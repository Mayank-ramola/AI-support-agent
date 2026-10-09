import { useState } from "react";
import { api } from "../api.js";
import { usePolling } from "../usePolling.js";

export default function Knowledge() {
  const { data, error, reload } = usePolling(() => api("/documents"), 15000);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ type: "", text: "" });

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg({ type: "", text: "" });
    try {
      const r = await api("/documents", { method: "POST", body: { title, text } });
      setMsg({ type: "ok", text: `Indexed "${title}" as ${r.chunks} chunks${r.embedded ? " with embeddings" : ""}. The agent can use it right away.` });
      setTitle("");
      setText("");
      reload();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc) => {
    if (!confirm(`Delete "${doc.title}" from the knowledge base?`)) return;
    try {
      await api(`/documents/${doc.docId}`, { method: "DELETE" });
      reload();
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    }
  };

  return (
    <>
      <h1>Knowledge base</h1>
      {error && <p className="error">{error}</p>}
      {data && (
        <p className="muted">
          Search mode: <strong>{data.mode === "semantic" ? "semantic (embeddings)" : "keyword"}</strong>
          {data.mode === "keyword" && " · add a GEMINI_API_KEY on the server and re-ingest for semantic search"}
        </p>
      )}
      {data?.documents.length === 0 && <p className="callout">The knowledge base is empty. Run <code>npm run ingest</code> on the server or add a document below.</p>}
      {data?.documents.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Document</th><th>Chunks</th><th>Embedded</th><th></th></tr></thead>
            <tbody>
              {data.documents.map((d) => (
                <tr key={d.docId}>
                  <td>{d.title}</td>
                  <td>{d.chunks}</td>
                  <td>{d.embedded === d.chunks ? "yes" : d.embedded ? `${d.embedded}/${d.chunks}` : "no"}</td>
                  <td className="right"><button className="btn ghost danger" onClick={() => remove(d)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Add or replace a document</h2>
      <p className="muted small">Using the same title replaces the earlier version. Use "## Heading" lines to split a long document into sections.</p>
      <form className="doc-form" onSubmit={add}>
        <input placeholder="Title, e.g. Gift cards" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
        <textarea placeholder="Paste the help article text here" rows={8} value={text} onChange={(e) => setText(e.target.value)} required />
        {msg.text && <p className={msg.type === "error" ? "error" : "ok"}>{msg.text}</p>}
        <button className="btn primary" disabled={busy}>{busy ? "Indexing…" : "Add to knowledge base"}</button>
      </form>
    </>
  );
}
