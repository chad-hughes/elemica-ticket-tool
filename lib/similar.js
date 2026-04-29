import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function findSimilar(ticket, allTickets) {
  const candidates = allTickets
    .filter((t) => t.id !== ticket.id)
    .slice(0, 20)
    .map((t) => `ID: ${t.id}\nSubject: ${t.subject}\nCategory: ${t.category}\nBody (excerpt): ${t.body.slice(0, 300)}`)
    .join("\n\n---\n\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are an IT support analyst at Elemica. Given a target ticket and a list of candidate tickets, return the up to 5 most similar candidates ordered by relevance.

Respond with ONLY a valid JSON array — no markdown, no explanation — where each element is:
{ "id": string, "subject": string, "reason": string }

"reason" should be one sentence explaining the similarity (shared system, issue type, pattern, resolution approach, etc.).

Target ticket:
ID: ${ticket.id}
Subject: ${ticket.subject}
Category: ${ticket.category}
Body: ${ticket.body.slice(0, 500)}

Candidates:
${candidates}`,
      },
    ],
  });

  const raw = message.content[0].text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  const matches = JSON.parse(raw);

  return {
    ticket_id: ticket.id,
    matches,
  };
}
