// Historique: month calendar coloured by doses taken, percentage per
// medicine, and one day's doses (same as the iPhone; view dose_history,
// update 023). A forgotten tick can be fixed from the day's list.
import { useState, useEffect } from "https://esm.sh/preact@10.24.3/hooks";
import { html, supabase, T, locale, timeOf, message } from "./lib.js";
import { Sheet, ErrorBox } from "./components.js";

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const counts = (d, now) => !d.as_needed && new Date(d.scheduled_for) <= now;
const isLate = (d) => d.status === "taken" && !d.as_needed && d.taken_at && new Date(d.taken_at) - new Date(d.scheduled_for) > 3600e3;

function summary(list, now) {
  const due = list.filter((d) => counts(d, now));
  if (!due.length) return null;
  const taken = due.filter((d) => d.status === "taken").length;
  return { taken, total: due.length, percent: Math.round((100 * taken) / due.length),
           late: due.filter(isLate).length, missed: due.length - taken };
}

export function History({ onClose, onChanged }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState(today);
  const [doses, setDoses] = useState(null);
  const [filter, setFilter] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 1);
    const { data, error } = await supabase.from("dose_history").select()
      .gte("scheduled_for", month.toISOString()).lt("scheduled_for", end.toISOString()).order("scheduled_for");
    if (error) setError(message(error)); else setDoses(data);
  }
  useEffect(() => { setDoses(null); load(); }, [month.getTime()]);

  function move(n) {
    const next = new Date(month.getFullYear(), month.getMonth() + n, 1);
    setMonth(next);
    setDay(next.getMonth() === today.getMonth() && next.getFullYear() === today.getFullYear()
      ? today : new Date(next.getFullYear(), next.getMonth() + 1, 0));
  }

  async function toggle(d) {
    const change = d.status === "taken" ? { status: "pending" } : { status: "taken", taken_at: d.scheduled_for };
    const { error } = await supabase.from("dose_logs").update(change).eq("id", d.id);
    if (error) setError(message(error));
    await load();
    onChanged && onChanged();
  }

  const now = new Date();
  const list = (doses || []).filter((d) => !filter || d.prescription_item_id === filter);
  const firstWeekday = (month.getDay() + 6) % 7;                   // Monday first
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: "narrow" }));

  function state(date) {
    const items = list.filter((d) => !d.as_needed && sameDay(new Date(d.scheduled_for), date));
    if (!items.length) return date > now ? "future" : "";
    const due = items.filter((d) => counts(d, now));
    if (!due.length) return "pending";
    const taken = due.filter((d) => d.status === "taken").length;
    if (taken === due.length) return items.length === due.length ? "all" : "pending";
    return taken ? "some" : "none";
  }

  const month_ = summary(list, now);
  const byMed = {};
  for (const d of doses || []) (byMed[d.prescription_item_id] ||= []).push(d);
  const perMed = Object.entries(byMed).map(([id, l]) => ({ id, name: l[0].display_name, s: summary(l, now),
    asNeeded: l.filter((d) => d.as_needed && d.status === "taken").length })).sort((a, b) => a.name.localeCompare(b.name));
  const dayList = list.filter((d) => sameDay(new Date(d.scheduled_for), day))
    .sort((a, b) => new Date(a.taken_at && a.as_needed ? a.taken_at : a.scheduled_for) - new Date(b.taken_at && b.as_needed ? b.taken_at : b.scheduled_for));

  function detail(d) {
    const planned = timeOf(d.scheduled_for);
    if (d.as_needed) return T(`Si besoin · pris à ${timeOf(d.taken_at || d.scheduled_for)}`, `As needed · taken at ${timeOf(d.taken_at || d.scheduled_for)}`);
    if (d.status === "taken") {
      if (d.logging_mode === "automatic") return T(`${planned} · enregistrée automatiquement`, `${planned} · logged automatically`);
      const text = d.taken_at ? T(`${planned} · pris à ${timeOf(d.taken_at)}`, `${planned} · taken at ${timeOf(d.taken_at)}`) : T(`${planned} · pris`, `${planned} · taken`);
      return isLate(d) ? text + T(" (en retard)", " (late)") : text;
    }
    return new Date(d.scheduled_for) <= now ? T(`${planned} · non pris`, `${planned} · not taken`) : T(`${planned} · à venir`, `${planned} · to come`);
  }
  const icon = (d) => d.as_needed ? "✋" : d.status === "taken" ? "✓" : new Date(d.scheduled_for) <= now ? "✕" : "○";
  const iconClass = (d) => d.as_needed ? "" : d.status === "taken" ? (isLate(d) ? "orange" : "green") : new Date(d.scheduled_for) <= now ? "red" : "";
  const isThisMonth = month.getMonth() === today.getMonth() && month.getFullYear() === today.getFullYear();

  return html`<${Sheet} title=${T("Historique", "History")} onClose=${onClose}>
    <${ErrorBox} error=${error} />
    <div class="card cal">
      <div class="cal-bar">
        <button class="plainbtn chev" onClick=${() => move(-1)} aria-label=${T("Mois précédent", "Previous month")}>‹</button>
        <strong>${month.toLocaleDateString(locale, { month: "long", year: "numeric" })}</strong>
        <button class="plainbtn chev" disabled=${isThisMonth} onClick=${() => move(1)} aria-label=${T("Mois suivant", "Next month")}>›</button>
      </div>
      <div class="cal-grid">
        ${weekdays.map((w) => html`<div class="cal-wd">${w}</div>`)}
        ${cells.map((c) => c ? html`<button class=${"cal-day " + state(c) + (sameDay(c, day) ? " sel" : "") + (sameDay(c, today) ? " today" : "")}
            onClick=${() => setDay(c)}>${c.getDate()}${list.some((d) => d.as_needed && sameDay(new Date(d.scheduled_for), c)) ? html`<i></i>` : ""}</button>` : html`<span></span>`)}
      </div>
      <div class="cal-legend sub"><span class="dot all"></span>${T("Tout pris", "All taken")}<span class="dot some"></span>${T("En partie", "Some")}<span class="dot none"></span>${T("Rien", "None")}<span class="dot asn"></span>${T("Si besoin", "As needed")}</div>
    </div>
    <p class="note">${T("L'historique commence le 13 novembre 2026. Les jours où l'app n'est pas ouverte sont complétés à la prochaine ouverture (7 jours au plus).",
                       "History starts on 13 November 2026. Days the app isn't opened are filled in the next time it is (up to 7 days).")}</p>

    ${doses === null ? html`<div class="empty">…</div>` : html`
      ${month_ && html`<div class="section-title">${T("Sur le mois", "For the month")}</div>
        <div class="card">
          <div class="row"><div class="main">${T("Prises faites", "Doses taken")}</div><div class="sub">${month_.taken}/${month_.total} · ${month_.percent} %</div></div>
          ${month_.late ? html`<div class="row"><div class="main">${T("En retard (+1 h)", "Late (+1 h)")}</div><div class="sub">${month_.late}</div></div>` : ""}
          ${month_.missed ? html`<div class="row"><div class="main red">${T("Non prises", "Missed")}</div><div class="sub red">${month_.missed}</div></div>` : ""}
        </div>`}
      ${perMed.length ? html`<div class="section-title">${T("Par médicament", "Per medicine")}</div>
        <div class="card">${perMed.map((m) => html`<button class="rowbtn row" onClick=${() => setFilter(filter === m.id ? null : m.id)}>
          <div class="main left">
            <div class="name">${filter === m.id ? "▸ " : ""}${m.name}</div>
            ${m.s ? html`<div class="progress" style="margin-top:6px"><div class=${m.s.percent >= 90 ? "" : m.s.percent >= 70 ? "warn" : "bad"} style=${`width:${m.s.percent}%`}></div></div>`
                  : m.asNeeded ? html`<div class="sub">${T(`Si besoin : ${m.asNeeded} prise(s) ce mois-ci`, `As needed: ${m.asNeeded} dose(s) this month`)}</div>` : ""}
          </div>
          ${m.s ? html`<div class="sub">${m.s.percent} %</div>` : ""}
        </button>`)}</div>
        <p class="note">${filter ? T("Touchez-le à nouveau pour tout revoir.", "Tap it again to show all.") : T("Touchez un médicament pour ne voir que lui dans le calendrier.", "Tap a medicine to show only it in the calendar.")}</p>` : ""}
      <div class="section-title">${day.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}</div>
      <div class="card">
        ${dayList.length ? dayList.map((d) => html`<div class="row">
          <span class=${"hist-icon " + iconClass(d)}>${icon(d)}</span>
          <div class="main"><div class="name">${d.display_name}</div>
            <div class=${"sub" + (isLate(d) || (!d.as_needed && d.status !== "taken" && new Date(d.scheduled_for) <= now) ? " orange" : "")}>${detail(d)}</div></div>
          ${!d.as_needed && d.logging_mode !== "automatic" && new Date(d.scheduled_for) <= now
            ? html`<button class="link small" onClick=${() => toggle(d)}>${d.status === "taken" ? T("Non pris", "Not taken") : T("Pris", "Taken")}</button>` : ""}
        </div>`) : html`<div class="row sub">${T("Aucune prise enregistrée ce jour-là.", "No doses recorded that day.")}</div>`}
      </div>`}
  <//>`;
}
