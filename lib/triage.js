import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function triage(ticket) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are an IT support ticket triager for Elemica, a B2B supply chain network company.

Analyze this ticket and return ONLY a valid JSON object — no markdown, no explanation — with these fields:
- ticket_id: string
- category: one of "edi-mapping" | "access-request" | "integration" | "incident" | "service-request" | "other"
- severity: one of "urgent" | "high" | "medium" | "low"
- target_systems: string[] of systems/platforms involved
- summary: 1-2 sentence plain-language summary
- assumptions: string[] of assumptions made during triage
- unverified: string[] of things that still need verification

Ticket:
ID: ${ticket.id}
Subject: ${ticket.subject}
Reporter: ${ticket.reporter || "unknown"}
Body:
${ticket.body}`,
      },
    ],
  });

  const raw = message.content[0].text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  return JSON.parse(raw);
}
