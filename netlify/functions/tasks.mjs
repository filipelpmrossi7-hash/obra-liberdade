// Lista de tarefas da Obra Liberdade, guardada no Netlify Blobs.
// Sem dependências: fala direto com o endpoint que o runtime do Netlify expõe
// via NETLIFY_BLOBS_CONTEXT (mesmo protocolo que o pacote @netlify/blobs usa).

const STORE = "site:obra-liberdade";
const KEY = "tasks";

const SEED = {
  updatedAt: "2026-10-20T14:44:00-03:00",
  tasks: [
    { id: "t01", title: "Banco da área externa", group: "Área externa", owner: "", due: null, dep: null, note: null, done: false, doneAt: null, by: null },
    { id: "t02", title: "Rejunte do piso da área externa", group: "Área externa", owner: "", due: null, dep: null, note: null, done: false, doneAt: null, by: null },
    { id: "t03", title: "Telha da marquise da frente", group: "Área externa", owner: "", due: null, dep: "chegada da calha", note: null, done: false, doneAt: null, by: null },
    { id: "t04", title: "Ralo linear na entrada da Misoya", group: "Área externa", owner: "André", due: null, dep: null, note: "Pedir 2m. Ponto mais baixo fica 50 cm à esquerda da porta de entrada.", done: false, doneAt: null, by: null },
    { id: "t05", title: "Porcelanato da clausura (refazer)", group: "Interno / acabamento", owner: "", due: null, dep: null, note: null, done: false, doneAt: null, by: null },
    { id: "t06", title: "Passar máquina para encerar o piso", group: "Interno / acabamento", owner: "", due: null, dep: null, note: null, done: false, doneAt: null, by: null },
    { id: "t07", title: "Torneiras dos banheiros", group: "Hidráulica", owner: "", due: null, dep: null, note: null, done: false, doneAt: null, by: null },
    { id: "t08", title: "Acionador do mictório", group: "Hidráulica", owner: "", due: null, dep: null, note: null, done: false, doneAt: null, by: null },
    { id: "t09", title: "Monta-carga (alvenarias)", group: "Equipamentos", owner: "", due: null, dep: null, note: null, done: false, doneAt: null, by: null },
    { id: "t10", title: "Plataforma elevatória do 6º andar", group: "Equipamentos", owner: "", due: null, dep: null, note: "Verificar pendências.", done: false, doneAt: null, by: null }
  ]
};

function blobsContext() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) throw new Error("NETLIFY_BLOBS_CONTEXT ausente: a função não está rodando no Netlify.");
  const ctx = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const base = ctx.uncachedEdgeURL || ctx.edgeURL;
  if (!base || !ctx.siteID || !ctx.token) throw new Error("Contexto do Blobs incompleto.");
  return { url: `${base.replace(/\/$/, "")}/${ctx.siteID}/${STORE}/${KEY}`, token: ctx.token };
}

async function readList() {
  const { url, token } = blobsContext();
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Blobs GET ${res.status}`);
  return res.json();
}

async function writeList(data) {
  const { url, token } = blobsContext();
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "cache-control": "max-age=0, stale-while-revalidate=60"
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Blobs PUT ${res.status}`);
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });

function sanitize(t) {
  const s = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  return {
    id: s(t.id, 40) || "t" + Math.random().toString(36).slice(2, 10),
    title: s(t.title, 140),
    group: s(t.group, 40) || "Outros",
    owner: s(t.owner, 40),
    due: /^\d{4}-\d{2}-\d{2}$/.test(t.due || "") ? t.due : null,
    dep: s(t.dep, 80) || null,
    note: s(t.note, 400) || null,
    done: !!t.done,
    doneAt: /^\d{4}-\d{2}-\d{2}$/.test(t.doneAt || "") ? t.doneAt : null,
    by: s(t.by, 40) || null
  };
}

export default async (req) => {
  try {
    if (req.method === "GET") {
      const data = (await readList()) || SEED;
      return json(data);
    }
    if (req.method === "PUT") {
      const body = await req.json();
      if (!Array.isArray(body.tasks) || body.tasks.length > 300) return json({ error: "lista inválida" }, 400);
      const tasks = body.tasks.map(sanitize).filter((t) => t.title);
      const data = { updatedAt: new Date().toISOString(), tasks };
      await writeList(data);
      return json(data);
    }
    return json({ error: "método não suportado" }, 405);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

export const config = { path: "/api/tasks" };
