import { useEffect, useState } from "react";
import { getToken, setToken, setUnauthorizedHandler } from "./api.js";
import Login from "./pages/Login.jsx";
import Overview from "./pages/Overview.jsx";
import Conversations from "./pages/Conversations.jsx";
import Tickets from "./pages/Tickets.jsx";
import Knowledge from "./pages/Knowledge.jsx";
import Orders from "./pages/Orders.jsx";

const TABS = [
  ["overview", "Overview", Overview],
  ["conversations", "Conversations", Conversations],
  ["tickets", "Tickets", Tickets],
  ["knowledge", "Knowledge base", Knowledge],
  ["orders", "Sample orders", Orders],
];

export default function App() {
  const [authed, setAuthed] = useState(Boolean(getToken()));
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setAuthed(false);
    });
  }, []);

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;
  const Page = TABS.find(([id]) => id === tab)[2];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="logo">Support desk</div>
        <nav>
          {TABS.map(([id, label]) => (
            <button key={id} className={id === tab ? "nav active" : "nav"} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <button
          className="nav logout"
          onClick={() => {
            setToken(null);
            setAuthed(false);
          }}
        >
          Log out
        </button>
      </aside>
      <main className="content">
        <Page goTo={setTab} />
      </main>
    </div>
  );
}
