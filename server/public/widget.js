/*
 * Embeddable support chat widget. No dependencies, styles are isolated in a Shadow DOM.
 *
 *   <script src="https://YOUR-API/widget.js" data-api="https://YOUR-API" defer></script>
 *
 * Optional attributes: data-title, data-color
 */
(function () {
  "use strict";
  if (window.__hcSupportWidget) return;
  window.__hcSupportWidget = true;

  var script = document.currentScript;
  var scriptOrigin = script && script.src ? new URL(script.src).origin : "";
  var API = ((script && script.dataset.api) || scriptOrigin || "").replace(/\/$/, "");
  var TITLE = (script && script.dataset.title) || "Support";
  var COLOR = (script && script.dataset.color) || "#5fa387";
  var SESSION_KEY = "hc_support_session";
  var POLL_MS = 5000;

  function sessionId() {
    var id = null;
    try { id = localStorage.getItem(SESSION_KEY); } catch (e) {}
    if (!id || !/^[A-Za-z0-9_-]{16,64}$/.test(id)) {
      var bytes = new Uint8Array(18);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      id = Array.prototype.map.call(bytes, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      try { localStorage.setItem(SESSION_KEY, id); } catch (e) {}
    }
    return id;
  }
  var SID = sessionId();

  var css = "\n" +
    ":host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}\n" +
    ".launcher{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;background:" + COLOR + ";color:#0d0e0d;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.35);display:grid;place-items:center;z-index:2147483000}\n" +
    ".launcher:focus-visible,.send:focus-visible,.chip:focus-visible,.close:focus-visible,input:focus-visible{outline:2px solid #fff;outline-offset:2px}\n" +
    ".launcher svg{width:26px;height:26px}\n" +
    ".panel{position:fixed;right:20px;bottom:88px;width:360px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 110px);background:#1b1b1b;color:#faebd7;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.45);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;border:1px solid #333}\n" +
    ".panel.open{display:flex}\n" +
    "header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#111;border-bottom:1px solid #333}\n" +
    "header h2{margin:0;font-size:15px;font-weight:600}\n" +
    "header small{display:block;color:#a8a090;font-size:12px;font-weight:400;margin-top:2px}\n" +
    ".close{background:transparent;border:0;color:#faebd7;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:6px}\n" +
    ".log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}\n" +
    ".msg{max-width:85%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}\n" +
    ".msg.user{align-self:flex-end;background:" + COLOR + ";color:#0d0e0d;border-bottom-right-radius:4px}\n" +
    ".msg.assistant{align-self:flex-start;background:#2c2c2c;border-bottom-left-radius:4px}\n" +
    ".msg.human{align-self:flex-start;background:#26342e;border:1px solid " + COLOR + ";border-bottom-left-radius:4px}\n" +
    ".who{display:block;font-size:11px;color:" + COLOR + ";margin-bottom:3px;font-weight:600}\n" +
    ".src{display:block;margin-top:6px;font-size:11px;color:#a8a090}\n" +
    ".note{align-self:center;font-size:12px;color:#a8a090;text-align:center;padding:2px 8px}\n" +
    ".chips{display:flex;flex-wrap:wrap;gap:6px}\n" +
    ".chip{background:transparent;border:1px solid #555;color:#faebd7;border-radius:99px;padding:6px 11px;font-size:13px;cursor:pointer}\n" +
    ".chip:hover{border-color:" + COLOR + "}\n" +
    ".typing{align-self:flex-start;color:#a8a090;font-size:13px}\n" +
    "form{display:flex;gap:8px;padding:10px;border-top:1px solid #333;background:#111}\n" +
    "input{flex:1;min-width:0;background:#222;color:#faebd7;border:1px solid #444;border-radius:8px;padding:9px 10px;font-size:14px}\n" +
    ".send{background:" + COLOR + ";color:#0d0e0d;border:0;border-radius:8px;padding:0 14px;font-weight:600;cursor:pointer;font-size:14px}\n" +
    ".send:disabled{opacity:.5;cursor:default}\n" +
    ".emailbox{display:flex;gap:6px;align-self:stretch}\n" +
    ".emailbox input{padding:7px 9px;font-size:13px}\n" +
    ".emailbox button{background:#2c2c2c;color:#faebd7;border:1px solid #555;border-radius:8px;padding:0 10px;cursor:pointer;font-size:13px}\n" +
    "@media (prefers-reduced-motion:no-preference){.msg{animation:in .15s ease-out}@keyframes in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}}\n";

  var host = document.createElement("div");
  host.id = "hc-support-root";
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" + css + "</style>" +
    '<button class="launcher" aria-label="Open support chat" aria-expanded="false">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>' +
    '<section class="panel" role="dialog" aria-label="' + TITLE.replace(/"/g, "") + ' chat">' +
    '<header><h2></h2><button class="close" aria-label="Close chat">&times;</button></header>' +
    '<div class="log" role="log" aria-live="polite"></div>' +
    '<form><input type="text" maxlength="1000" placeholder="Type your question" aria-label="Your message" autocomplete="off"><button class="send" type="submit">Send</button></form>' +
    "</section>";

  var launcher = root.querySelector(".launcher");
  var panel = root.querySelector(".panel");
  var log = root.querySelector(".log");
  var form = root.querySelector("form");
  var input = root.querySelector("input");
  var sendBtn = root.querySelector(".send");
  var header = root.querySelector("h2");
  header.textContent = TITLE;
  var sub = document.createElement("small");
  sub.textContent = "AI assistant. A person can step in if needed.";
  header.appendChild(sub);

  var messages = [];          // [{role, content, sources?}]
  var status = "ai";
  var pollTimer = null;
  var loaded = false;
  var busy = false;
  var showEmailBox = false;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function render() {
    log.innerHTML = "";
    if (!messages.length) {
      log.appendChild(el("div", "msg assistant", "Hi! I can help with orders, shipping, returns, payments and sizing. What do you need?"));
      var chips = el("div", "chips");
      ["Where is my order?", "What is your return policy?", "How long does shipping take?"].forEach(function (q) {
        var c = el("button", "chip", q);
        c.type = "button";
        c.addEventListener("click", function () { send(q); });
        chips.appendChild(c);
      });
      log.appendChild(chips);
    }
    messages.forEach(function (m) {
      var b = el("div", "msg " + m.role);
      if (m.role === "human") b.appendChild(el("span", "who", "Support team"));
      b.appendChild(document.createTextNode(m.content));
      if (m.sources && m.sources.length) {
        var titles = [];
        m.sources.forEach(function (s) { if (titles.indexOf(s.title) < 0) titles.push(s.title); });
        b.appendChild(el("span", "src", "Source: " + titles.join(", ")));
      }
      log.appendChild(b);
    });
    if (busy) log.appendChild(el("div", "typing", "Typing…"));
    if (status === "needs_human" || status === "human") {
      log.appendChild(el("div", "note", status === "human" ? "A team member is in this chat." : "Waiting for a team member. You can keep typing; they will see it."));
    }
    if (showEmailBox) {
      var box = el("div", "emailbox");
      var em = document.createElement("input");
      em.type = "email";
      em.placeholder = "Your email, so we can reply";
      em.setAttribute("aria-label", "Your email");
      var btn = el("button", null, "Save");
      btn.type = "button";
      btn.addEventListener("click", function () { saveEmail(em.value); });
      box.appendChild(em);
      box.appendChild(btn);
      log.appendChild(box);
    }
    log.scrollTop = log.scrollHeight;
  }

  function api(path, opts) {
    return fetch(API + path, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var e = new Error(data.message || "Request failed"); e.data = data; throw e; }
        return data;
      });
    });
  }

  function load() {
    return api("/api/chat/" + SID).then(function (data) {
      var old = messages;
      messages = data.messages.map(function (m, i) {
        return { role: m.role, content: m.content, sources: old[i] && old[i].content === m.content ? old[i].sources : undefined };
      });
      status = data.status;
      loaded = true;
      managePolling();
      render();
    }).catch(function () { loaded = true; render(); });
  }

  function managePolling() {
    var needsPolling = status === "needs_human" || status === "human";
    if (needsPolling && !pollTimer && panel.classList.contains("open")) {
      pollTimer = setInterval(function () { if (!busy) load(); }, POLL_MS);
    } else if ((!needsPolling || !panel.classList.contains("open")) && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    messages.push({ role: "user", content: text });
    input.value = "";
    busy = true;
    sendBtn.disabled = true;
    render();
    api("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: SID, message: text }),
    }).then(function (data) {
      status = data.status || status;
      if (data.reply) messages.push({ role: "assistant", content: data.reply, sources: data.sources });
      showEmailBox = Boolean(data.needsEmail);
    }).catch(function (err) {
      messages.push({ role: "assistant", content: err.message || "Something went wrong. Please try again." });
    }).then(function () {
      busy = false;
      sendBtn.disabled = false;
      managePolling();
      render();
      input.focus();
    });
  }

  function saveEmail(value) {
    api("/api/chat/" + SID + "/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: value }),
    }).then(function () {
      showEmailBox = false;
      messages.push({ role: "assistant", content: "Thanks, we saved your email. The team can reply there if you leave this page." });
      render();
    }).catch(function (err) {
      messages.push({ role: "assistant", content: err.message || "That email did not look right." });
      render();
    });
  }

  function setOpen(open) {
    panel.classList.toggle("open", open);
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", open ? "Close support chat" : "Open support chat");
    if (open) {
      if (!loaded) { render(); load(); } else { load(); }
      setTimeout(function () { input.focus(); }, 0);
    }
    managePolling();
  }

  launcher.addEventListener("click", function () { setOpen(!panel.classList.contains("open")); });
  root.querySelector(".close").addEventListener("click", function () { setOpen(false); launcher.focus(); });
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { setOpen(false); launcher.focus(); } });
  form.addEventListener("submit", function (e) { e.preventDefault(); send(input.value); });

  function mount() { document.body.appendChild(host); render(); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
