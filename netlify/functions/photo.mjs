// Fotos das tarefas da Obra Liberdade, guardadas no Netlify Blobs.
// POST   /api/photo?task=ID&by=NOME   (corpo = JPEG)  -> salva a foto e anota na tarefa
// GET    /api/photo/ID/FOTO            -> devolve a imagem
// DELETE /api/photo/ID/FOTO            -> apaga a imagem e a anotação

const STORE = "site:obra-liberdade";
const TASKS_KEY = "tasks";
const MAX_BYTES = 2 * 1024 * 1024;

function ctx() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) throw new Error("NETLIFY_BLOBS_CONTEXT ausente");
  const c = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  const base = (c.uncachedEdgeURL || c.edgeURL || "").replace(/\/$/, "");
  if (!base || !c.siteID || !c.token) throw new Error("Contexto do Blobs incompleto");
  return { base: `${base}/${c.siteID}/${STORE}`, token: c.token };
}
const auth = (t) => ({ authorization: `Bearer ${t}` });

async function blobGet(key) {
  const { base, token } = ctx();
  const r = await fetch(`${base}/${key}`, { headers: auth(token) });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Blobs GET ${r.status}`);
  return r;
}
async function blobPut(key, body, type) {
  const { base, token } = ctx();
  const r = await fetch(`${base}/${key}`, {
    method: "PUT",
    headers: { ...auth(token), "content-type": type, "cache-control": "max-age=0, stale-while-revalidate=60" },
    body
  });
  if (!r.ok) throw new Error(`Blobs PUT ${r.status}`);
}
async function blobDelete(key) {
  const { base, token } = ctx();
  const r = await fetch(`${base}/${key}`, { method: "DELETE", headers: auth(token) });
  if (!r.ok && r.status !== 404) throw new Error(`Blobs DELETE ${r.status}`);
}

const json = (b, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

const safe = (s, n) => (typeof s === "string" ? s.replace(/[^\w\-.: ~@+À-ÿ]/g, "").slice(0, n) : "");
const idOk = (s) => /^[A-Za-z0-9_-]{1,40}$/.test(s || "");

export default async (req) => {
  try {
    const url = new URL(req.url);
    const parts = url.pathname.replace(/^\/api\/photo\/?/, "").split("/").filter(Boolean);

    if (req.method === "POST") {
      const task = url.searchParams.get("task");
      const by = safe(url.searchParams.get("by") || "", 40) || null;
      if (!idOk(task)) return json({ error: "tarefa inválida" }, 400);
      const bytes = await req.arrayBuffer();
      if (!bytes.byteLength) return json({ error: "foto vazia" }, 400);
      if (bytes.byteLength > MAX_BYTES) return json({ error: "foto grande demais" }, 413);

      const photoId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await blobPut(`photos/${task}/${photoId}`, bytes, "image/jpeg");

      const listRes = await blobGet(TASKS_KEY);
      const data = listRes ? await listRes.json() : { tasks: [] };
      const t = (data.tasks || []).find((x) => x.id === task);
      if (!t) return json({ error: "tarefa não encontrada" }, 404);
      t.photos = Array.isArray(t.photos) ? t.photos : [];
      t.photos.push({ id: photoId, at: new Date().toISOString(), by });
      data.updatedAt = new Date().toISOString();
      await blobPut(TASKS_KEY, JSON.stringify(data), "application/json");
      return json(data);
    }

    if (req.method === "GET") {
      const [task, photoId] = parts;
      if (!idOk(task) || !idOk(photoId)) return json({ error: "caminho inválido" }, 400);
      const r = await blobGet(`photos/${task}/${photoId}`);
      if (!r) return new Response("não encontrada", { status: 404 });
      return new Response(r.body, {
        status: 200,
        headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=31536000, immutable" }
      });
    }

    if (req.method === "DELETE") {
      const [task, photoId] = parts;
      if (!idOk(task) || !idOk(photoId)) return json({ error: "caminho inválido" }, 400);
      await blobDelete(`photos/${task}/${photoId}`);
      const listRes = await blobGet(TASKS_KEY);
      const data = listRes ? await listRes.json() : { tasks: [] };
      const t = (data.tasks || []).find((x) => x.id === task);
      if (t && Array.isArray(t.photos)) t.photos = t.photos.filter((p) => p.id !== photoId);
      data.updatedAt = new Date().toISOString();
      await blobPut(TASKS_KEY, JSON.stringify(data), "application/json");
      return json(data);
    }

    return json({ error: "método não suportado" }, 405);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
};

export const config = { path: ["/api/photo", "/api/photo/*"] };
