import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VERIFY_GATE = [
  "Customer name and contact correct",
  "No internal system names or jargon",
  "Owners and dates are real (not placeholders)",
  "No commitment we can't keep",
  "Workaround tested or labelled untested",
  "No PII or other-customer references",
];

export async function draftReply(ticket) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are an IT support agent at Elemica. Draft a reply for the following ticket.

Return ONLY valid JSON — no markdown, no explanation — with two fields:
- "customer_facing": professional, concise, jargon-free reply to send to the reporter. Use "Hi [Name]," as the greeting and "Best regards,\\nElemica IT Support" as the sign-off. Replace [Name] with the reporter's first name if available.
- "internal_notes": brief notes for the assignee covering root cause, actions taken, open items, and any caveats.

Ticket:
ID: ${ticket.id}
Subject: ${ticket.subject}
Reporter: ${ticket.reporter || "unknown"}
Category: ${ticket.category}
Status: ${ticket.status}

Body:
${ticket.body}`,
      },
    ],
  });

  const raw = message.content[0].text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  const { customer_facing, internal_notes } = JSON.parse(raw);

  return {
    ticket_id: ticket.id,
    customer_facing,
    internal_notes,
    verify_gate: VERIFY_GATE,
  };
}
