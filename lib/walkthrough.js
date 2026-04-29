import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateWalkthrough(ticket) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are a senior IT support engineer and coach at Elemica, a B2B supply chain network company. Given a resolved support ticket, produce a technical walkthrough of the resolution as a numbered step-by-step guide. Each step should include a coaching tip that explains WHY the step matters or what to watch out for.

Format your response as a JSON array — no markdown, no explanation — where each element is:
{
  "step": number,
  "action": "what was done (concise, imperative)",
  "detail": "fuller explanation of how to do it",
  "coaching_tip": "why this matters, what to watch for, or how to do it better next time"
}

Ticket:
ID: ${ticket.id}
Subject: ${ticket.subject}
Category: ${ticket.category}
Body:
${ticket.body}`,
      },
    ],
  });

  const raw = message.content[0].text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  return { ticket_id: ticket.id, steps: JSON.parse(raw) };
}
