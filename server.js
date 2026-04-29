import express from "express";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { triage } from "./lib/triage.js";
import { generatePrForm } from "./lib/pr-form.js";
import { findSimilar } from "./lib/similar.js";
import { draftReply } from "./lib/reply.js";
import { generateWalkthrough } from "./lib/walkthrough.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "data", "tickets.json");

const getGraphToken = async () => {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AZURE_CLIENT_ID,
      client_secret: process.env.AZURE_CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || "failed to get Graph token");
  return data.access_token;
};

const sendViaGraph = async ({ to, cc, subject, text }) => {
  const token = await getGraphToken();
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${process.env.SMTP_USER}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "Text", content: text },
        toRecipients: [{ emailAddress: { address: to } }],
        ccRecipients: [{ emailAddress: { address: cc } }],
      },
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Graph API error ${res.status}`);
  }
};

const toReporterEmail = (reporter = "") => {
  const parts = reporter.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return `${parts[0]}@elemica.com`;
  return `${parts[0]}.${parts[parts.length - 1]}@elemica.com`;
};

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(join(__dirname, "public")));

const loadTickets = async () => JSON.parse(await readFile(DATA_PATH, "utf8"));
const saveTickets = async (t) => writeFile(DATA_PATH, JSON.stringify(t, null, 2));

// ─── REST: tickets ─────────────────────────────────────────────────────────
app.get("/api/tickets", async (_req, res) => {
  const tickets = await loadTickets();
  res.json(tickets);
});

app.get("/api/tickets/:id", async (req, res) => {
  const tickets = await loadTickets();
  const t = tickets.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: "ticket not found" });
  res.json(t);
});

app.post("/api/tickets", async (req, res) => {
  const { subject, body, category = "unknown", severity = "medium", reporter = "self" } = req.body ?? {};
  if (!subject || !body) return res.status(400).json({ error: "subject and body are required" });
  const tickets = await loadTickets();
  const id = `TKT-${String(Date.now()).slice(-6)}`;
  const ticket = { id, subject, body, category, severity, reporter, status: "open", created: new Date().toISOString() };
  tickets.unshift(ticket);
  await saveTickets(tickets);
  res.status(201).json(ticket);
});

// ─── TODO endpoints — wired during the workshop ────────────────────────────
app.post("/api/tickets/:id/triage", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const result = await triage(ticket);
  res.json(result);
});

app.post("/api/tickets/:id/pr-form", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const result = await generatePrForm(ticket);
  res.json(result);
});

app.post("/api/tickets/:id/similar", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const result = await findSimilar(ticket, tickets);
  res.json(result);
});

app.post("/api/tickets/:id/reply", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const result = await draftReply(ticket);
  res.json(result);
});

app.post("/api/tickets/:id/walkthrough", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  try {
    const result = await generateWalkthrough(ticket);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "walkthrough failed", detail: err.message });
  }
});

app.post("/api/tickets/:id/send-reply", async (req, res) => {
  const tickets = await loadTickets();
  const ticket = tickets.find((x) => x.id === req.params.id);
  if (!ticket) return res.status(404).json({ error: "ticket not found" });
  const { reply } = req.body ?? {};
  if (!reply) return res.status(400).json({ error: "reply text is required" });
  const to = toReporterEmail(ticket.reporter);
  try {
    await sendViaGraph({
      to,
      cc: "chad.hughes@elemica.com",
      subject: `Re: [${ticket.id}] ${ticket.subject}`,
      text: reply,
    });
  } catch (err) {
    return res.status(502).json({ error: "email failed", detail: err.message });
  }
  ticket.sentReply = reply;
  ticket.status = "replied";
  ticket.repliedAt = new Date().toISOString();
  await saveTickets(tickets);
  res.json({ ok: true, ticket_id: ticket.id, to, status: ticket.status, repliedAt: ticket.repliedAt });
});

// ─── boot ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`elemica-ticket-tool · http://localhost:${PORT}`);
});
