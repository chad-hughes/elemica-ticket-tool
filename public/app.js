// ─── shared helpers ──────────────────────────────────────────────────────────
const fmtDate = (iso) => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const escapeHtml = (s = "") =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const sectionHTML = (label, text) =>
  `<div class="ticket-section">
    <div class="section-label">${label}</div>
    <div class="ticket-body">${escapeHtml(text.trim())}</div>
  </div>`;

const bodyHTML = (body) => {
  const resMatch = body.match(/\nResolution:\n/i);
  const noteMatch = body.match(/\nNote:\n/i);
  if (!resMatch && !noteMatch) return sectionHTML("Description", body);

  const splitAt = (str, match) => match ? [str.slice(0, match.index), str.slice(match.index + match[0].length)] : [str, null];

  const [desc, rest] = splitAt(body, resMatch);
  if (!rest) return sectionHTML("Description", desc) + sectionHTML("Note", body.slice(noteMatch.index + noteMatch[0].length));

  const [resolution, note] = splitAt(rest, rest.match(/\nNote:\n/i));
  return sectionHTML("Description", desc)
    + sectionHTML("Resolution", resolution)
    + (note ? sectionHTML("Note", note) : "");
};

const reporterEmail = (reporter = "") => {
  const parts = reporter.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return reporter ? `${parts[0]}@elemica.com` : "—";
  return `${parts[0]}.${parts[parts.length - 1]}@elemica.com`;
};

const extractResolution = (body) => {
  const resMatch = body.match(/\nResolution:\n/i);
  if (!resMatch) return null;
  const after = body.slice(resMatch.index + resMatch[0].length);
  const noteMatch = after.match(/\nNote:\n/i);
  return noteMatch ? after.slice(0, noteMatch.index).trim() : after.trim();
};

const suggestedReplyHTML = (ticket) => {
  const resolution = extractResolution(ticket.body);
  if (!resolution) return "";
  const firstName = (ticket.reporter || "").split(/[\s,]+/)[0] || "there";
  const reply = `Hi ${firstName},\n\nThank you for your request. Here is an update on ticket ${ticket.id}:\n\n${resolution}\n\nPlease let us know if you have any questions or need further assistance.\n\nBest regards,\nElemica IT Support`;
  return `
    <div class="ticket-section">
      <div class="section-label">Suggested Reply</div>
      <div class="reply-panel">
        <pre class="reply-text">${escapeHtml(reply)}</pre>
        <div class="reply-actions">
          <button class="copy-btn" onclick="navigator.clipboard.writeText(this.closest('.reply-panel').querySelector('.reply-text').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})">Copy</button>
          <button class="send-btn" data-ticket-id="${ticket.id}">Send Reply</button>
        </div>
      </div>
    </div>`;
};

// ─── /  inbox ────────────────────────────────────────────────────────────────
async function renderInbox() {
  const list = document.getElementById("list");
  const count = document.getElementById("count");
  const q = document.getElementById("q");
  const chips = [...document.querySelectorAll(".chip")];
  let activeFilter = "all";

  const tickets = await fetch("/api/tickets").then((r) => r.json());

  const draw = () => {
    const term = (q.value || "").toLowerCase();
    const filtered = tickets.filter((t) => {
      if (activeFilter === "urgent" && t.severity !== "urgent") return false;
      if (activeFilter !== "all" && activeFilter !== "urgent" && t.category !== activeFilter) return false;
      if (term && !`${t.subject} ${t.body}`.toLowerCase().includes(term)) return false;
      return true;
    });
    count.textContent = filtered.length;
    list.innerHTML = filtered.map(rowHTML).join("") || `<div style="color:var(--muted);text-align:center;padding:40px;font-size:.9rem">no tickets match.</div>`;
  };

  chips.forEach((c) => c.addEventListener("click", () => {
    chips.forEach((x) => x.classList.remove("on"));
    c.classList.add("on");
    activeFilter = c.dataset.filter;
    draw();
  }));
  q.addEventListener("input", draw);
  draw();
}

const rowHTML = (t) => `
  <div class="ticket-row">
    <div class="id">${t.id}</div>
    <div class="subject"><a href="/ticket.html?id=${encodeURIComponent(t.id)}">${escapeHtml(t.subject)}</a></div>
    <div><span class="tag cat-${t.category}">${t.category.replace("-", " ")}</span></div>
    <div><span class="sev sev-${t.severity}"><span class="sev-dot"></span>${t.severity}</span></div>
    <div class="reporter">${escapeHtml(t.reporter || "—")}</div>
  </div>
`;

// ─── /ticket.html ────────────────────────────────────────────────────────────
async function renderTicket() {
  const root = document.getElementById("ticket-root");
  const id = new URLSearchParams(location.search).get("id");
  if (!id) { root.innerHTML = `<p style="color:var(--muted)">missing ?id= param</p>`; return; }

  const t = await fetch(`/api/tickets/${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : null);
  if (!t) { root.innerHTML = `<p style="color:var(--muted)">ticket not found.</p>`; return; }

  root.innerHTML = `
    <div class="ticket-page">
      <div>
        <div class="ticket-header">
          <div class="id">${t.id}</div>
          <h1 class="${t.severity === 'urgent' ? 'urgent-title' : ''}">${escapeHtml(t.subject)}</h1>
          <div class="meta">
            <span class="tag cat-${t.category}">${t.category.replace("-", " ")}</span>
            <span class="sev sev-${t.severity}"><span class="sev-dot"></span>${t.severity}</span>
            <span class="reporter">${escapeHtml(t.reporter || "—")}</span>
            <span>· ${fmtDate(t.created)}</span>
          </div>
        </div>

        ${bodyHTML(t.body)}

        <div class="ticket-section" id="walkthrough-section">
          <div class="section-label">Technical Walkthrough</div>
          <div class="walkthrough-loading">Generating walkthrough…</div>
        </div>

        ${suggestedReplyHTML(t)}

        <h3 style="font-size:.72rem;color:#005EB8;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;margin-bottom:12px">AI Actions</h3>

        <div class="todo-grid">
          <button class="todo-btn" data-action="triage">
            <div class="ic">🤖</div>
            <div class="name">AI Triage</div>
            <div class="desc">Block 3 · classify + route + flag assumptions</div>
          </button>
          <button class="todo-btn" data-action="pr-form">
            <div class="ic">📋</div>
            <div class="name">Generate PR Form</div>
            <div class="desc">Lokesh / Vaibhav · bottom-up estimate</div>
          </button>
          <button class="todo-btn" data-action="similar">
            <div class="ic">🔍</div>
            <div class="name">Find Similar</div>
            <div class="desc">Aman / Jeya / Trenton · semantic match</div>
          </button>
          <button class="todo-btn" data-action="reply">
            <div class="ic">💬</div>
            <div class="name">Draft Reply</div>
            <div class="desc">Sloan's rule · verify gate baked in</div>
          </button>
        </div>

        <div class="result-panel" id="result"></div>
      </div>

      <aside>
        <div class="side-card">
          <h3>Sun Temperature</h3>
          <div class="row"><span class="k">Surface</span><span class="v">5,778 K</span></div>
          <div class="row"><span class="k"></span><span class="v">5,505 °C</span></div>
          <div class="row"><span class="k"></span><span class="v">9,941 °F</span></div>
          <div class="row"><span class="k">Core</span><span class="v">15,000,000 K</span></div>
          <div class="row"><span class="k">Corona</span><span class="v">1,000,000–3M K</span></div>
        </div>
        <div class="side-card">
          <h3>Email Address</h3>
          <div class="row"><span class="k">reporter</span><span class="v">${reporterEmail(t.reporter)}</span></div>
        </div>
        <div class="side-card" id="similar-card">
          <h3>Similar Tickets</h3>
          <div style="color:var(--muted);font-size:.82rem;font-style:italic">Loading…</div>
        </div>
        <div class="side-card">
          <h3>Ticket meta</h3>
          <div class="row"><span class="k">id</span><span class="v">${t.id}</span></div>
          <div class="row"><span class="k">status</span><span class="v">${t.status || "open"}</span></div>
          <div class="row"><span class="k">created</span><span class="v">${fmtDate(t.created)}</span></div>
          <div class="row"><span class="k">category</span><span class="v">${t.category}</span></div>
          <div class="row"><span class="k">severity</span><span class="v">${t.severity}</span></div>
        </div>
      </aside>
    </div>
  `;

  document.querySelectorAll(".todo-btn").forEach((btn) => {
    btn.addEventListener("click", () => runAction(btn, t.id, btn.dataset.action));
  });

  fetch(`/api/tickets/${encodeURIComponent(t.id)}/similar`, { method: "POST" })
    .then((r) => r.json())
    .then((data) => {
      const card = document.getElementById("similar-card");
      if (!card) return;
      const matches = data.matches || [];
      card.innerHTML = `<h3>Similar Tickets</h3>` + (matches.length
        ? matches.map((m) => `
            <div class="row" style="flex-direction:column;align-items:flex-start;gap:2px;padding:8px 0">
              <a href="/ticket.html?id=${encodeURIComponent(m.id)}" class="sim-id">${escapeHtml(m.id)}</a>
              <span class="sim-reason">${escapeHtml(m.reason)}</span>
            </div>`).join("")
        : `<div style="color:var(--muted);font-size:.82rem">No similar tickets found.</div>`);
    })
    .catch(() => { document.getElementById("similar-card")?.remove(); });

  fetch(`/api/tickets/${encodeURIComponent(t.id)}/walkthrough`, { method: "POST" })
    .then((r) => r.json())
    .then((data) => {
      const section = document.getElementById("walkthrough-section");
      if (!section) return;
      if (!data.steps?.length) { section.remove(); return; }
      section.innerHTML = `
        <div class="section-label">Technical Walkthrough</div>
        <div class="walkthrough-steps">
          ${data.steps.map((s) => `
            <div class="wt-step">
              <div class="wt-num">${s.step}</div>
              <div class="wt-body">
                <div class="wt-action">${escapeHtml(s.action)}</div>
                <div class="wt-detail">${escapeHtml(s.detail)}</div>
                <div class="wt-tip"><span class="wt-tip-label">Coaching tip</span>${escapeHtml(s.coaching_tip)}</div>
              </div>
            </div>
          `).join("")}
        </div>`;
    })
    .catch(() => { document.getElementById("walkthrough-section")?.remove(); });

  const sendBtn = document.querySelector(".send-btn");
  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      const replyText = sendBtn.closest(".reply-panel").querySelector(".reply-text").textContent;
      sendBtn.disabled = true;
      sendBtn.textContent = "Sending…";
      try {
        const res = await fetch(`/api/tickets/${encodeURIComponent(t.id)}/send-reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reply: replyText }),
        });
        const data = await res.json();
        if (data.ok) {
          sendBtn.textContent = "Sent!";
          sendBtn.classList.add("sent");
        } else {
          sendBtn.textContent = "Error";
          sendBtn.disabled = false;
        }
      } catch {
        sendBtn.textContent = "Error";
        sendBtn.disabled = false;
      }
    });
  }
}

async function runAction(btn, id, action) {
  const result = document.getElementById("result");
  btn.classList.add("loading");
  result.classList.add("on");
  result.innerHTML = `<h3>${labelForAction(action)} <span class="pill">running…</span></h3>`;
  try {
    const data = await fetch(`/api/tickets/${encodeURIComponent(id)}/${action}`, { method: "POST" }).then((r) => r.json());
    const isStub = data.todo === true;
    result.innerHTML = `
      <h3>${labelForAction(action)} <span class="pill ${isStub ? '' : 'done'}">${isStub ? "stub" : "live"}</span></h3>
      ${isStub ? `<div class="stub-note">⚠ ${escapeHtml(data.note || "Stub — wire this up during the workshop.")}</div>` : ""}
      <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    `;
  } catch (err) {
    result.innerHTML = `<h3>${labelForAction(action)} <span class="pill" style="background:var(--red-soft);color:var(--red);border-color:var(--red-border)">error</span></h3><pre>${escapeHtml(String(err))}</pre>`;
  } finally {
    btn.classList.remove("loading");
  }
}

const labelForAction = (a) => ({
  "triage": "🤖 AI Triage",
  "pr-form": "📋 Generate PR Form",
  "similar": "🔍 Find Similar",
  "reply": "💬 Draft Reply",
}[a] || a);

// ─── /submit.html ────────────────────────────────────────────────────────────
function wireSubmit() {
  const form = document.getElementById("submit-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const t = await res.json();
      location.href = `/ticket.html?id=${encodeURIComponent(t.id)}`;
    } else {
      alert("could not save ticket — see server logs");
    }
  });
}
