// Suivi: shortages, appointments, pharmacy trips, appointments to book,
// expiring boxes and ended prescriptions — the same rules as the app.
import { useState, useEffect } from "https://esm.sh/preact@10.24.3/hooks";
import { html, supabase, T, clean, parseDay, dayText, longDay, startOfToday, addDays, timeOf, message } from "./lib.js";
import { shortageTitle } from "./meds.js";

// Pharmacy days chosen in the app (default Monday, Wednesday, Friday; 2 days before the last pill)
const ALLOWED = new Set([1, 3, 5]);   // JS: 0 = Sunday
const LEAD = 2;

/// When to go to the pharmacy for this medicine (null = no trip needed).
function pharmacyDay(m) {
  const today = startOfToday();
  const start = parseDay(m.start_date);
  // Nothing collected yet on this prescription (even with pills left): go and collect it
  if (Number(m.units_dispensed_total) === 0 && start) return addDays(start, 1);
  const perDay = Number(m.dosage_per_day || 0);
  let last;
  if (Number(m.units_dispensed_total) > 0 && perDay > 0 && start) {
    last = addDays(start, Math.floor(Number(m.units_dispensed_total) / perDay) - 1);
  } else {
    const left = m.days_of_stock_left;
    if (left == null) return today;
    if (left <= 0) return addDays(today, 1);
    last = addDays(today, left - 1);
  }
  const end = parseDay(m.prescription_end_date);
  if (end && last >= end) return null;
  const base = addDays(last, -LEAD);
  const candidates = [base, addDays(base, -1)];
  for (let n = 1; n <= 7; n++) if (addDays(base, n) <= last) candidates.push(addDays(base, n));
  for (let n = 2; n <= 7; n++) candidates.push(addDays(base, -n));
  return candidates.find((d) => ALLOWED.has(d.getDay())) || base;
}

function pharmacyVisits(meds) {
  const byPharmacy = {};
  for (const m of meds) {
    // New or renewed prescription, nothing collected yet (even with pills left)
    const firstPickup = !m.pharmacy_owes && !m.as_needed && Number(m.units_dispensed_total) === 0 && Number(m.units_outstanding) > 0;
    if (!(m.pharmacy_owes || firstPickup)) continue;
    const day = pharmacyDay(m);
    if (!day) continue;
    const key = m.pharmacy_name || "";
    (byPharmacy[key] ||= []).push({ day, line: firstPickup
      ? T(`${m.display_name} : ${clean(m.units_outstanding)} à récupérer (1re délivrance)`, `${m.display_name}: ${clean(m.units_outstanding)} to collect (first pickup)`)
      : T(`${m.display_name} : ${clean(m.units_outstanding)} à récupérer`, `${m.display_name}: ${clean(m.units_outstanding)} to collect`) });
  }
  return Object.entries(byPharmacy).map(([name, items]) => ({
    name, date: new Date(Math.max(startOfToday(), Math.min(...items.map((i) => i.day)))), lines: items.map((i) => i.line),
  }));
}

function doctorVisits(meds, appointments) {
  const today = startOfToday();
  const byDoctor = {};
  for (const m of meds) {
    const end = parseDay(m.prescription_end_date);
    if (!end || end < today) continue;
    const key = m.doctor_name || "";
    (byDoctor[key] ||= []).push({ end, rdv: addDays(end, -(m.rdv_lead_days ?? 14)),
      line: T(`${m.display_name} : jusqu'au ${dayText(end)}`, `${m.display_name}: until ${dayText(end)}`) });
  }
  const fold = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^dr\.?\s+/, "");
  return Object.entries(byDoctor)
    // Booked only counts when the appointment is before the prescription ends
    .filter(([name, items]) => !appointments.some((a) => new Date(a.starts_at) > new Date() && name && fold(a.doctor_name) === fold(name)
      && new Date(a.starts_at) < addDays(new Date(Math.min(...items.map((i) => i.end))), 1)))
    .map(([name, items]) => ({
      name, deadline: new Date(Math.min(...items.map((i) => i.end))),
      date: new Date(Math.max(today, Math.min(...items.map((i) => i.rdv)))), lines: items.map((i) => i.line),
    }));
}

export function FollowUp({ meds, shortages, onSummary }) {
  const [appointments, setAppointments] = useState(null);
  const [lots, setLots] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const since = addDays(new Date(), -365).toISOString();
      const [a, l] = await Promise.all([
        supabase.from("appointment_list").select().gte("starts_at", since),
        supabase.from("inventory_lot_list").select().gt("quantity", 0),
      ]);
      if (a.error || l.error) setError(message(a.error || l.error));
      setAppointments(a.data || []);
      setLots(l.data || []);
    })();
  }, []);

  const ready = meds && appointments;
  const today = startOfToday();
  const recent = new Date(Date.now() - 30 * 60 * 1000);   // done 30 min after the start
  const upcoming = ready ? appointments.filter((a) => new Date(a.starts_at) >= recent) : [];
  const past = ready ? appointments.filter((a) => new Date(a.starts_at) < recent).sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)) : [];
  const pharmacy = ready ? pharmacyVisits(meds) : [];
  const doctors = ready ? doctorVisits(meds, appointments) : [];
  const expiring = lots.filter((l) => l.expiry_date && parseDay(l.expiry_date) <= addDays(today, 30));
  const ended = ready ? meds.filter((m) => m.prescription_end_date && parseDay(m.prescription_end_date) < today) : [];
  const shortageMeds = ready ? meds.filter((m) => shortages[m.id]) : [];

  // Summary line under the title
  const part = (n, fr1, frN, en1, enN) => (n ? `${n} ${n === 1 ? T(fr1, en1) : T(frN, enN)}` : null);
  const summary = !ready ? "" : [
    part(shortageMeds.length, "rupture", "ruptures", "shortage", "shortages"),
    part(upcoming.length, "RDV", "RDV", "appointment", "appointments"),
    part(pharmacy.length, "passage en pharmacie", "passages en pharmacie", "pharmacy visit", "pharmacy visits"),
    part(doctors.length, "RDV à prendre", "RDV à prendre", "to book", "to book"),
    part(expiring.length, "péremption", "péremptions", "expiry", "expiries"),
  ].filter(Boolean).join(" · ") || T("Tout est en ordre", "All clear");
  useEffect(() => { onSummary(summary); }, [summary]);
  if (!ready) return html`<div class="empty">…</div>`;

  // Blocks in date order (shortages first), like the app
  const blocks = [];
  if (shortageMeds.length) blocks.push([new Date(0), html`<div>
    <div class="section-title red">⚠︎ ${T("Ruptures", "Shortages")}</div>
    <div class="card">${shortageMeds.map((m) => { const x = shortages[m.id]; return html`<div class="row"><div class="main">
      <div class="name">${m.display_name}</div>
      <div class="sub orange">${shortageTitle(x)}</div>
      ${x.availability_since && html`<div class="sub">${T("Depuis le", "Since")} ${dayText(parseDay(x.availability_since))}</div>`}
      ${x.availability_link && html`<a class="link small" href=${x.availability_link} target="_blank" rel="noopener">${T("Voir l'avis de l'ANSM", "See the ANSM notice")}</a>`}
    </div></div>`; })}</div>
    <p class="note">${T("Parlez-en à votre pharmacien avant d'en manquer : il peut commander à l'avance ou proposer un équivalent.",
                        "Talk to your pharmacist before you run out: they can order ahead or suggest an equivalent.")}</p></div>`]);
  if (upcoming.length) blocks.push([new Date(upcoming[0].starts_at), html`<div>
    <div class="section-title blue">${T("Rendez-vous", "Appointments")}</div>
    <div class="card">${upcoming.map((a) => html`<div class="row"><div class="main">
      <div class="name">${longDay(a.starts_at)} · ${timeOf(a.starts_at)}</div>
      <div>${a.doctor_name || T("Médecin", "Doctor")}</div>
      ${a.location && html`<div class="sub">${a.location}</div>`}
      ${a.phone && html`<a class="link small" href=${"tel:" + a.phone.replace(/[^\d+]/g, "")}>${T("Appeler", "Call")} ${a.phone}</a>`}
    </div></div>`)}</div></div>`]);
  if (expiring.length) blocks.push([parseDay(expiring[0].expiry_date), html`<div>
    <div class="section-title red">${T("Inventaire : péremption", "Inventory: expiry")}</div>
    <div class="card">${expiring.map((l) => html`<div class="row"><div class="main">
      <div class="name">${l.item_name}</div>
      <div class="sub">${clean(l.quantity)} · <span class=${parseDay(l.expiry_date) < today ? "expired" : "soon"}>${parseDay(l.expiry_date) < today ? T("Périmé le", "Expired") : T("Expire le", "Expires")} ${dayText(parseDay(l.expiry_date))}</span></div>
    </div></div>`)}</div></div>`]);
  for (const v of pharmacy) blocks.push([v.date, html`<div>
    <div class="section-title orange">${v.name || T("Passage en pharmacie", "Pharmacy visit")}</div>
    <p class="sub indent">${T("Prévu le", "Plan for")} ${longDay(v.date)}</p>
    <div class="card">${v.lines.map((line) => html`<div class="row"><div class="main">${line}</div></div>`)}</div></div>`]);
  for (const v of doctors) blocks.push([v.date, html`<div>
    <div class="section-title blue">${T(`Prendre RDV avant le ${dayText(v.deadline)}`, `Book before ${dayText(v.deadline)}`)}${v.name ? ` : ${v.name}` : ""}</div>
    <div class="card">${v.lines.map((line) => html`<div class="row"><div class="main">${line}</div></div>`)}</div></div>`]);
  if (ended.length) blocks.push([today, html`<div>
    <div class="section-title">${T("Ordonnances terminées", "Ended prescriptions")}</div>
    <div class="card">${ended.map((m) => html`<div class="row"><div class="main">
      <div class="name">${m.display_name}</div>
      <div class="sub">${T("Renouvelez ou arrêtez-le dans l'app iPhone.", "Renew or stop it in the iPhone app.")}</div>
    </div></div>`)}</div></div>`]);

  blocks.sort((a, b) => a[0] - b[0]);
  return html`${error && html`<div class="error">${error}</div>`}
    ${blocks.length ? blocks.map((b) => b[1]) : html`<div class="empty">${T("Tout est en ordre. Rien à suivre pour le moment.", "All good. Nothing to follow up right now.")}</div>`}
    ${past.length > 0 && html`<details class="past"><summary class="section-title">${T(`Rendez-vous passés (${past.length})`, `Past appointments (${past.length})`)}</summary>
      <div class="card">${past.map((a) => html`<div class="row"><div class="main">
        <div class="name">${longDay(a.starts_at)} · ${timeOf(a.starts_at)}</div>
        <div class="sub">${a.doctor_name || T("Médecin", "Doctor")}</div></div></div>`)}</div></details>`}`;
}
