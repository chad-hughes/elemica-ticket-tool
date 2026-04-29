import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generatePrForm(ticket) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a project coordinator at Elemica, a B2B supply chain network company. Given a support ticket, produce a filled PR-to-SOW form in markdown.

Use exactly this structure:

# PR Form — {ticket_id}

## Summary
One sentence describing the request.

## Scope
**In scope:** bullet list
**Out of scope:** bullet list

## Effort Estimate
| Phase | Hours | Notes |
|-------|-------|-------|
| Discovery | N | ... |
| Build | N | ... |
| Test | N | ... |
| Deploy | N | ... |
| Support (30 days) | N | ... |
| **Total** | **N** | |

## Assumptions & Risks
- bullet list

## Acceptance Criteria
- [ ] checklist items

---
Ticket:
ID: ${ticket.id}
Subject: ${ticket.subject}
Reporter: ${ticket.reporter || "unknown"}
Category: ${ticket.category}
Severity: ${ticket.severity}

Body:
${ticket.body}`,
      },
    ],
  });

  return {
    ticket_id: ticket.id,
    markdown: message.content[0].text,
  };
}
