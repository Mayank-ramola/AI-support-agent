# AI Customer Support Agent

An AI support agent for an online store. It answers questions from the store's own documents (RAG), looks up orders, opens support tickets, and hands the chat to a person when it is not confident. It comes with an embeddable chat widget and a React admin dashboard.

**Stack:** Node.js, Express, MongoDB (Mongoose), React (Vite), Groq LLM API with tool calling, Gemini embeddings.

```
 Store website  --(widget.js)-->  Express API  --->  Groq LLM (tool calling)
                                      |  \
                                      |   +--> Retriever (embeddings or BM25) over knowledge chunks
                                      |   +--> Tools: lookup_order, create_ticket, search_knowledge_base
                                      v
                                   MongoDB  <---  React admin dashboard
        (chunks + embeddings, conversations, tickets, orders)
```

## What it does

- **Answers from your documents (RAG).** Help articles are split into chunks and embedded. For each question the top chunks go into the prompt, and the model must cite them as `S1`, `S2`...
- **Tool calling.**
  - `lookup_order`: needs the order number **and** the matching email. A wrong email and an unknown order give the same message, so it cannot be used to probe for orders.
  - `create_ticket`: needs a valid customer email.
  - `search_knowledge_base`: a second search with a better query.
  - `reply_to_customer`: the model ends every turn with this structured reply (answer, answer type, confidence, cited sources, needs_human).
- **Human handoff when confidence is low.** Confidence combines the model's own score with how well the answer is grounded:
  - knowledge answers are capped by how relevant the retrieved chunks were, and an answer with no cited source is capped at 0.3
  - order and ticket answers are trusted only if the tool call really succeeded
  - below `CONFIDENCE_THRESHOLD` (default 0.6), or when the model says it cannot answer or the customer asks for a person, the agent does **not** send its draft. It opens a ticket, marks the chat "needs a person", and tells the customer. The withheld draft is shown to staff in the dashboard.
- **Chat widget.** One `<script>` tag. Shadow DOM keeps its styles separate from the host page. It remembers the visitor's session, shows sources, shows replies from staff, and asks for an email after a handoff.
- **Admin dashboard.** Overview stats, conversation review with confidence and tool usage, replying as a human (the AI stops answering that chat), tickets, knowledge-base upload, and a list of sample orders.
- **Works without an embedding key.** Without `GEMINI_API_KEY` it falls back to BM25 keyword search.

## Project structure

```
demo-store/   Static "Hannes & Co." storefront with the widget added (third-party template, see its README)
server/       Express API
  src/agent/    supportAgent.js (loop), tools.js, confidence.js, prompts.js, llm.js
  src/rag/      chunker, embeddings (Gemini), bm25, retriever, ingest
  src/routes/   chat.js (public), admin.js (JWT)
  public/       widget.js (served at /widget.js)
  knowledge/    Sample help articles (Markdown)
  eval/         questions.json + run-eval.js
  test/         Unit and HTTP tests (no keys or database needed)
dashboard/    React admin app
```

## Run it locally

You need Node.js 18+ (20 or 22 recommended), a MongoDB database (free MongoDB Atlas cluster is fine), and two free API keys: [Groq](https://console.groq.com) and [Google AI Studio](https://aistudio.google.com) (Gemini, optional).

```bash
# 1. API
cd server
copy .env.example .env        # macOS/Linux: cp .env.example .env  -> fill in the values
npm install
npm run seed                  # sample orders
npm run ingest                # chunk + embed the knowledge base
npm run dev                   # http://localhost:5000

# 2. Dashboard (new terminal)
cd dashboard
copy .env.example .env
npm install
npm run dev                   # http://localhost:5173  (log in with ADMIN_EMAIL / ADMIN_PASSWORD)

# 3. Store (new terminal)
cd demo-store
npx serve .                   # open the printed URL, click the chat bubble
```

If the store runs on another port than 5173, add its origin to `DASHBOARD_ORIGIN` only for the dashboard. The chat endpoints accept any origin because the widget is meant to be embedded anywhere.

Groq retires models often (`llama-3.3-70b-versatile` was shut down in August 2026). If you get a model error, set `GROQ_MODEL` to a current tool-calling model from console.groq.com/docs/models.

### Try these chats

| Message | Expected |
| --- | --- |
| "How long does standard shipping take?" | Answer with source "Shipping and Delivery" |
| "Where is my order ORD-1001? alex@example.com" | Order status and tracking |
| "Where is ORD-1001? wrong@example.com" | "No order found", no details |
| "My hoodie arrived damaged, open a ticket, alex@example.com" | Ticket created |
| "Can I get 200 jackets with my team logo?" | Handoff, ticket opened, chat shows in the dashboard |

Sample orders: `ORD-1001 alex@example.com`, `ORD-1002 priya@example.com`, `ORD-1003 sam@example.com`, `ORD-1004 maria@example.com`, `ORD-1005 jordan@example.com`.

## Tests and evaluation

```bash
cd server
npm test        # 32 tests: chunking, BM25, embeddings client, retrieval, confidence, tools, agent loop, HTTP auth
npm run eval    # runs 32 sample customer questions against the real model and prints accuracy
```

`npm run eval` needs the database, `npm run seed`, `npm run ingest` and a `GROQ_API_KEY`. It checks, for each question: the right answer text, the right tool call, and whether the agent handed off when it should (or did not when it should not). Categories: knowledge, order, ticket, security (wrong email, prompt injection), handoff, small talk and out of scope. Results are saved to `server/eval/results.json`.

Record your results here:

| Date | Model | Retrieval | Score |
| --- | --- | --- | --- |
| | | | /32 |

### Tuning confidence

The eval prints the average retrieval relevance for questions the knowledge base can answer and for questions that should be handed off. If they are close, adjust `RELEVANCE_LOW` and `RELEVANCE_HIGH` (the cosine scores mapped to 0 and 1) and `CONFIDENCE_THRESHOLD`, then run the eval again. A higher threshold hands off more often. In keyword mode (no embedding key), relevance is the share of the question's rare words found in the best chunk, scaled so that 0.5 counts as fully relevant; semantic mode is more reliable, so add the Gemini key if you can.

## Embed the widget on any site

```html
<script src="https://YOUR-API/widget.js" data-api="https://YOUR-API" data-title="Support" data-color="#5fa387" defer></script>
```

## API

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/chat` | `{ sessionId, message }` -> reply, status, sources, ticket |
| GET | `/api/chat/:sessionId` | Messages and status (the widget polls this for staff replies) |
| POST | `/api/chat/:sessionId/email` | Save the customer's email |
| POST | `/api/admin/login` | Dashboard login, returns a JWT |
| GET | `/api/admin/stats` | Overview numbers |
| GET, PATCH | `/api/admin/conversations[/:id]` | List, read, resolve or reopen |
| POST | `/api/admin/conversations/:id/reply` | Reply as a person |
| GET, PATCH | `/api/admin/tickets[/:id]` | List, change status |
| GET, POST, DELETE | `/api/admin/documents[/:docId]` | Manage the knowledge base |
| GET | `/api/admin/orders` | Sample orders |

## Security notes

- Order details are returned only when the order number and email both match; the email is never echoed back.
- Customer messages are treated as untrusted in the system prompt, and the tools validate their own inputs, so prompt injection cannot make a tool return another customer's data.
- Admin routes need a JWT; login is rate limited and compares credentials in constant time. Chat is rate limited per IP.
- Message length, request size and session id format are validated.
- The admin login is a single account from environment variables, which is fine for a demo. A production system would use per-user accounts.

## Deploy

- **API:** Render web service, root directory `server`, build `npm install`, start `npm start`. Add all variables from `.env.example`. Set `DASHBOARD_ORIGIN` to the dashboard URL. After the first deploy, run `npm run seed` and `npm run ingest` once (Render shell, or locally with the production `MONGODB_URI`).
- **Dashboard:** Vercel, root directory `dashboard`, framework Vite, environment variable `VITE_API_URL=https://<api>.onrender.com/api`.
- **Store:** Netlify, Vercel or GitHub Pages from the `demo-store` folder. Set `API` in `demo-store/src/js/chat-loader.js` to your API URL.
- Render's free tier sleeps when idle, so the first chat after a pause can take about 30 seconds.

## Limitations

- The sample policies in `server/knowledge` are made up for the demo store. Replace them with real documents.
- Answers depend on the model and on retrieval quality. The confidence gate reduces wrong answers but cannot remove them.
- Replies from staff reach the widget by polling every 5 seconds, not WebSockets.
- Tickets are stored in MongoDB only; there is no email delivery to customers yet.

## Credits

The storefront in `demo-store/` is the MIT-licensed "ecommerce-store" template by Aditya Chakravorty (see `demo-store/LICENSE`).
