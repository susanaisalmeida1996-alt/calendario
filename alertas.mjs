// Corre no GitHub a cada 5 minutos: vê que alertas já chegaram à hora e envia-os como notificação
// para todos os aparelhos onde as notificações foram ativadas. Cada alerta só é enviado uma vez.
import admin from "firebase-admin";

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SA)) });
const db = admin.firestore();

const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

function occursOn(ev, d) {
  const k = ymd(d);
  if (Array.isArray(ev.skip) && ev.skip.includes(k)) return false;
  if (ev.until && k > ev.until) return false;
  if (!ev.date) return false;
  const base = parse(ev.date);
  if (d < base) return false;
  switch (ev.repeat) {
    case "weekly": return d.getDay() === base.getDay();
    case "monthly": return d.getDate() === base.getDate();
    case "yearly": return d.getDate() === base.getDate() && d.getMonth() === base.getMonth();
    default: return k === ev.date;
  }
}
function startOf(ev, k) {
  const d = parse(k);
  if (ev.allDay || !ev.time) d.setHours(9, 0); else { const [h, m] = ev.time.split(":").map(Number); d.setHours(h, m); }
  return d;
}
const EMO = { desporto: "🏅", creche: "🧸", aniversario: "🎂", saude: "🩺", trabalho: "💼", lazer: "🎒", feriado: "🏖️", casa: "🏠", cherry: "🐶" };
const SPORT = { natacao: "🏊‍♀️", pilates: "🧘‍♀️", tenis: "🎾", futebol: "⚽", basquete: "🏀", danca: "🩰", ginasio: "🏋️", corrida: "🏃", ciclismo: "🚴", equitacao: "🏇" };
const emojiOf = ev => {
  const t = ev.type === "pilates" ? "desporto" : ev.type;
  if (t === "desporto") return SPORT[ev.sport || (ev.type === "pilates" ? "pilates" : "")] || EMO.desporto;
  return EMO[t] || "";
};

const now = new Date();
const [evSnap, famSnap, tokSnap, sentSnap] = await Promise.all([
  db.collection("events").get(),
  db.collection("settings").doc("family").get(),
  db.collection("tokens").get(),
  db.collection("enviados").get()
]);
const names = { familia: "Família" };
for (const m of (famSnap.data()?.members || [])) names[m.id] = m.name;
const sent = new Set(sentSnap.docs.map(d => d.id));
let tokens = tokSnap.docs.map(d => d.id);

const fWd = new Intl.DateTimeFormat("pt-PT", { weekday: "long" });
const due = [];
for (const doc of evSnap.docs) {
  const ev = { id: doc.id, ...doc.data() };
  if (ev.alert == null || ev.alert < 0) continue;
  for (let d = addDays(now, -1); d <= addDays(now, 3); d = addDays(d, 1)) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (!occursOn(ev, day)) continue;
    const k = ymd(day), start = startOf(ev, k), at = new Date(start - ev.alert * 60000);
    const lastChance = new Date(Math.max(+start, +at + 20 * 60000));
    const id = `${ev.id}@${k}@${ev.alert}`;
    if (now >= at && now <= lastChance && !sent.has(id)) due.push({ ev, k, id });
  }
}

const today = ymd(now), tomorrow = ymd(addDays(now, 1));
for (const { ev, k, id } of due) {
  const dayTxt = k === today ? "Hoje" : k === tomorrow ? "Amanhã" : fWd.format(parse(k)).replace(/^./, c => c.toUpperCase());
  const timeTxt = ev.allDay || !ev.time ? "dia todo" : "às " + ev.time;
  const body = `${dayTxt} ${timeTxt} · ${names[ev.member || "familia"] || "Família"}`;
  const title = [emojiOf(ev), ev.title].filter(Boolean).join(" ");
  if (tokens.length) {
    const res = await admin.messaging().sendEachForMulticast({
      tokens,
      data: { title, body, tag: id, url: "./" },
      webpush: { headers: { Urgency: "high", TTL: "3600" } }
    });
    // Aparelhos que já não existem (app desinstalada, notificações desligadas): retira da lista.
    const dead = new Set();
    res.responses.forEach((r, i) => {
      const code = r.error?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument")) { dead.add(tokens[i]); db.collection("tokens").doc(tokens[i]).delete().catch(() => {}); }
    });
    console.log(`Enviado "${title}" (${body}) para ${res.successCount}/${tokens.length} aparelhos`);
    tokens = tokens.filter(t => !dead.has(t));
  }
  await db.collection("enviados").doc(id).set({ at: Date.now() });
}
if (!due.length) console.log("Nenhum alerta para enviar agora.");

// Limpeza: esquece alertas enviados há mais de 7 dias.
const old = sentSnap.docs.filter(d => (d.data().at || 0) < Date.now() - 7 * 864e5);
await Promise.all(old.map(d => d.ref.delete()));
