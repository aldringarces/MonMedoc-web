// Médicaments: Traitements (current treatments) | Inventaire (boxes at home).
import { useState, useEffect } from "https://esm.sh/preact@10.24.3/hooks";
import { html, supabase, T, shortTime, clean, parseDay, dayText, startOfToday, addDays, boxes, message } from "./lib.js";
import { Sheet, ErrorBox } from "./components.js";
import { loadIndications, purposeOf, Purpose, MedicineDescription } from "./info.js";

/// "08:00 · 20:00", or "Si besoin · max 3 par jour · 4 h entre 2 prises" (update 023)
function whenText(m) {
  if (!m.as_needed) return (m.dose_times || []).map(shortTime).join(" · ");
  let text = T("Si besoin", "As needed");
  if (m.max_doses_per_day) text += T(` · max ${m.max_doses_per_day} par jour`, ` · max ${m.max_doses_per_day} a day`);
  if (m.min_hours_between) text += T(` · ${clean(m.min_hours_between)} h entre 2 prises`, ` · ${clean(m.min_hours_between)} h apart`);
  return text;
}

/// "24 restant(s) · 24 j · réserve 168" (loose pills, then unopened boxes; update 032)
function stockText(m) {
  const boxes = Number(m.inventory_units || 0);
  return T(`${clean(m.current_stock)} restant(s)`, `${clean(m.current_stock)} left`)
    + (m.days_of_stock_left != null ? ` · ${m.days_of_stock_left} ${T("j", "d")}` : "")
    + (boxes > 0 ? T(` · réserve ${clean(boxes)}`, ` · reserve ${clean(boxes)}`) : "");
}

// ---------- Traitements ----------
export function Treatments({ meds, shortages, indications }) {
  const [open, setOpen] = useState(null);
  if (!meds) return html`<div class="empty">…</div>`;
  if (!meds.length) return html`<div class="empty">${T("Aucun traitement en cours.", "No current treatment.")}</div>`;
  return html`<div class="card" style="margin-top:12px">${meds.map((m) => {
    const shortage = shortages[m.id];
    return html`<button class="row rowbtn" onClick=${() => setOpen(m)}><div class="main">
      <div class="name">${m.display_name}</div>
      <${Purpose} text=${purposeOf(m.purpose, m.cis_code, indications)} />
      <div class="sub">${clean(m.units_per_dose)} × ${whenText(m)}</div>
      <div class="sub">${stockText(m)}${m.prescription_end_date ? ` · ${T("jusqu'au", "until")} ${dayText(parseDay(m.prescription_end_date))}` : ""}</div>
      <div class="badges">
        ${m.low_stock && html`<span class="badge low">${Number(m.inventory_units || 0) > 0 ? T("Boîte à ouvrir", "Open a box") : T("Stock bas", "Low stock")}</span>`}
        ${shortage && html`<span class="badge rdv">${shortageBadge(shortage)}</span>`}
        ${m.pharmacy_owes && html`<span class="badge owes">${T(`La pharmacie doit ${clean(m.units_outstanding)}`, `Pharmacy owes ${clean(m.units_outstanding)}`)}</span>`}
        ${!m.pharmacy_owes && !m.as_needed && Number(m.units_dispensed_total) === 0 && Number(m.units_outstanding) > 0
          && html`<span class="badge owes">${T(`À récupérer : ${clean(m.units_outstanding)}`, `To collect: ${clean(m.units_outstanding)}`)}</span>`}
        ${m.rdv_due && html`<span class="badge rdv">${T("RDV à prendre", "Book appointment")}</span>`}
      </div>
    </div><span class="chev">›</span></button>`;
  })}</div>
  ${open && html`<${TreatmentSheet} med=${open} onClose=${() => setOpen(null)} />`}`;
}

function TreatmentSheet({ med: m, onClose }) {
  return html`<${Sheet} title=${m.display_name} onClose=${onClose}>
    <div class="section-title">${T("Traitement", "Treatment")}</div>
    <div class="card">
      ${m.purpose && html`<div class="row"><div class="sub label">${T("Pour", "For")}</div><div class="main right">${m.purpose}</div></div>`}
      <div class="row"><div class="sub label">${T("Prise", "Dose")}</div><div class="main right">${clean(m.units_per_dose)} × ${whenText(m)}${m.logging_mode === "automatic" ? T(" (auto)", " (auto)") : ""}</div></div>
      <div class="row"><div class="sub label">${T("Stock", "Supply")}</div><div class="main right">${stockText(m)}</div></div>
      ${m.start_date && html`<div class="row"><div class="sub label">${T("Ordonnance", "Prescription")}</div><div class="main right">${T("depuis le", "since")} ${dayText(parseDay(m.start_date))}${m.prescription_end_date ? html`<br />${T("jusqu'au", "until")} ${dayText(parseDay(m.prescription_end_date))}` : ""}</div></div>`}
      ${Number(m.units_outstanding) > 0 && html`<div class="row"><div class="sub label">${T("Pharmacie", "Pharmacy")}</div><div class="main right">${T(`doit encore ${clean(m.units_outstanding)}`, `still owes ${clean(m.units_outstanding)}`)}${m.pharmacy_name ? html`<br />${m.pharmacy_name}` : ""}</div></div>`}
      ${m.doctor_name && html`<div class="row"><div class="sub label">${T("Médecin", "Doctor")}</div><div class="main right">${m.doctor_name}</div></div>`}
    </div>
    <${PrescriptionFiles} prescriptionId=${m.prescription_id} />
    <${MedicineDescription} cis=${m.cis_code} cip13=${m.cip13} />
  </${Sheet}>`;
}

/// The prescription itself (photo or PDF saved from the iPhone, update 025).
/// Opened through a link valid for 5 minutes (the files are private).
export function PrescriptionFiles({ prescriptionId, all }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let q = supabase.from("prescription_file_list").select();
    if (!all) q = q.eq("prescription_id", prescriptionId);
    q.then(({ data }) => setFiles(data || []));
  }, [prescriptionId]);
  async function open(f) {
    const tab = window.open("", "_blank");   // opened now, or the browser blocks it
    const { data, error } = await supabase.storage.from("prescriptions").createSignedUrl(f.path, 300);
    if (error || !data) { if (tab) tab.close(); setError(message(error || T("Introuvable", "Not found"))); return; }
    if (tab) tab.location = data.signedUrl; else location.href = data.signedUrl;
  }
  if (!files || (!files.length && !all)) return null;
  const date = (f) => dayText(f.prescribed_on ? parseDay(f.prescribed_on) : new Date(f.created_at));
  return html`
    ${!all && html`<div class="section-title">${T("Ordonnance", "Prescription")}</div>`}
    <${ErrorBox} error=${error} />
    <div class="card">${files.length ? files.map((f) => html`<button class="rowbtn row" onClick=${() => open(f)}>
      <span class="hist-icon">📄</span>
      <div class="main left"><div class="name">${T(`Ordonnance du ${date(f)}`, `Prescription of ${date(f)}`)}</div>
        ${[f.doctor_name, f.title].filter(Boolean).length ? html`<div class="sub">${[f.doctor_name, f.title].filter(Boolean).join(" · ")}</div>` : ""}</div>
      <span class="chev">›</span></button>`)
      : html`<div class="row sub">${T("Aucune ordonnance gardée. Ajoutez-les depuis l'app iPhone (scan, import ou page du traitement).",
                                       "No prescriptions kept. Add them from the iPhone app (scan, import or the treatment's page).")}</div>`}</div>`;
}

export function shortageTitle(x) {
  return { 1: T("Rupture de stock", "Out of stock"), 2: T("Tension d'approvisionnement", "Supply shortage"),
           3: T("Arrêt de commercialisation", "Discontinued") }[x.availability_code] || x.availability_label || T("Disponibilité limitée", "Limited availability");
}
const shortageBadge = (x) => ({ 1: T("Rupture", "Out of stock"), 2: T("Tension", "Supply issue"), 3: T("Arrêté", "Discontinued") }[x.availability_code] || T("Disponibilité", "Availability"));

/// Shortage info per treatment (ANSM data, codes 1–3), like the app.
export async function loadShortages(meds) {
  const codes = [...new Set(meds.map((m) => m.cis_code).filter(Boolean))];
  if (!codes.length) return {};
  const { data } = await supabase.from("medication_extras").select().in("cis_code", codes).in("availability_code", [1, 2, 3]);
  const byCis = Object.fromEntries((data || []).map((x) => [x.cis_code, x]));
  const result = {};
  for (const m of meds) {
    const x = byCis[m.cis_code];
    if (x && (!x.availability_cips || !x.availability_cips.length || !m.cip13 || x.availability_cips.includes(m.cip13))) result[m.id] = x;
  }
  return result;
}

// ---------- Inventaire ----------
const expiryClass = (d) => {
  if (!d) return "";
  const date = parseDay(d);
  if (date < startOfToday()) return "expired";
  return date <= addDays(startOfToday(), 30) ? "soon" : "";
};

export function Inventory({ search }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);

  const [indications, setIndications] = useState({});
  async function load() {
    const { data, error } = await supabase.from("inventory_summary").select();
    if (error) { setError(message(error)); return; }
    setItems(data);
    setIndications(await loadIndications(data.map((i) => i.cis_code)));
  }
  useEffect(() => { load(); }, []);

  if (!items) return html`<${ErrorBox} error=${error} /><div class="empty">…</div>`;
  const q = search.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const fold = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const archived = items.filter((i) => i.archived_at);
  const shown = items.filter((i) => !i.archived_at && (Number(i.total_units) > 0 || i.lot_count > 0))
    .filter((i) => !q || fold(i.name).includes(q) || (i.active_substances || []).some((s) => fold(s).includes(q)) || (i.cip13 || "").includes(q));

  return html`
    <${ErrorBox} error=${error} />
    ${!shown.length ? html`<div class="empty">${items.length ? T("Aucun résultat.", "No results.") : T("Inventaire vide.", "Inventory is empty.")}</div>` :
      html`<div class="card" style="margin-top:12px">${shown.map((i) => html`
        <button class="row rowbtn" onClick=${() => setOpen(i)}>
          <div class="main">
            <div class="name">${i.name}</div>
            <${Purpose} text=${purposeOf(null, i.cis_code, indications)} />
            ${(i.presentation || i.form) && html`<div class="sub">${i.presentation || i.form}</div>`}
            <div class="sub">${boxes(i.total_units, i.units_per_box)}${i.next_expiry ? html` · <span class=${expiryClass(i.next_expiry)}>${T("Exp.", "Exp.")} ${dayText(parseDay(i.next_expiry))}</span>` : ""}</div>
          </div>
          <span class="chev">›</span>
        </button>`)}</div>`}
    ${archived.length && !q ? html`<details class="archived"><summary class="section-title">${T(`Archivés (${archived.length})`, `Archived (${archived.length})`)}</summary>
      <div class="card">${archived.map((i) => html`<button class="row rowbtn" onClick=${() => setOpen(i)}>
        <div class="main sub">${i.name}</div><span class="chev">›</span></button>`)}</div>
      <p class="note indent">${T("Plus à la maison, mais toujours comptés dans Mes dépenses en pharmacie.", "No longer at home, but still counted in My pharmacy spending.")}</p></details>` : ""}
    ${open && html`<${InventoryItem} item=${open} onClose=${() => { setOpen(null); load(); }} />`}`;
}

const reasons = () => [
  ["given", T("Donné", "Given away")], ["pharmacy", T("Rapporté en pharmacie", "Returned to a pharmacy")],
  ["thrown", T("Jeté", "Thrown away")], ["other", T("Autre", "Other")],
];

function InventoryItem({ item, onClose }) {
  const [lots, setLots] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);
  const [ald, setAld] = useState(!!item.ald);
  const perBox = Math.max(item.units_per_box || 1, 1);

  // Archive (update 028): off the list and alerts, still in Mes dépenses
  async function setArchived(on) {
    const { error } = await supabase.from("inventory_items").update({ archived_at: on ? new Date().toISOString() : null }).eq("id", item.id);
    if (error) setError(message(error)); else onClose();
  }

  // ALD switch (update 027): counts at 100 % in Mes dépenses
  async function toggleAld() {
    const on = !ald;
    setAld(on);
    const { error } = await supabase.from("inventory_items").update({ ald: on }).eq("id", item.id);
    if (error) { setAld(!on); setError(message(error)); }
  }

  async function load() {
    const { data, error } = await supabase.from("inventory_lot_list").select().eq("item_id", item.id).gt("quantity", 0);
    if (error) setError(message(error)); else setLots(data);
  }
  useEffect(() => { load(); }, []);

  async function addBox(lot) {
    if (!confirm(T(`Ajouter une boîte (${perBox}) à ce lot ?`, `Add a box (${perBox}) to this batch?`))) return;
    const { error } = await supabase.from("inventory_lots").update({ quantity: Number(lot.quantity) + perBox, updated_at: new Date().toISOString() }).eq("id", lot.id);
    if (error) setError(message(error)); else load();
  }

  return html`<${Sheet} title=${item.name} onClose=${onClose}>
    <${ErrorBox} error=${error} />
    ${(item.active_substances || []).length ? html`<p class="sub">${item.active_substances.join(" + ").toLowerCase()}</p>` : ""}
    <div class="section-title">${T("Lots", "Batches")}</div>
    <div class="card">${!lots ? html`<div class="row">…</div>` : !lots.length ? html`<div class="row sub">${T("Plus rien en stock.", "Nothing left.")}</div>` :
      lots.map((l) => html`<div class="row"><div class="main">
        <div class="name">${boxes(l.quantity, l.units_per_box || perBox)}</div>
        <div class="sub">${l.expiry_date ? html`<span class=${expiryClass(l.expiry_date)}>${T("Expire le", "Expires")} ${dayText(parseDay(l.expiry_date))}</span>` : T("Sans date", "No date")}${l.lot_number ? ` · ${T("Lot", "Batch")} ${l.lot_number}` : ""}${l.location ? ` · ${l.location}` : ""}</div>
      </div>
      <div class="stepper">
        <button onClick=${() => setRemoving(l)} aria-label=${T("Retirer", "Remove")}>−</button>
        <button onClick=${() => addBox(l)} aria-label=${T("Ajouter une boîte", "Add a box")}>+</button>
      </div></div>`)}</div>
    <div class="section-title">${T("Dépenses", "Spending")}</div>
    <div class="card form"><div class="row"><div class="main">${T("ALD (pris en charge à 100 %)", "ALD (covered at 100%)")}</div>
      ${item.ald_via_treatment
        ? html`<div class="sub">${T("Oui, par le traitement", "Yes, via the treatment")}</div>`
        : html`<input type="checkbox" checked=${ald} onChange=${toggleAld} style="width:22px;height:22px;accent-color:var(--accent)" />`}</div></div>
    <p class="note indent">${item.ald_via_treatment ? T("Un de vos traitements en ALD utilise ce médicament.", "One of your ALD treatments uses this medicine.")
      : T("Sert à estimer vos dépenses en pharmacie (sauf médicaments remboursés à 15 %).", "Used to estimate your pharmacy spending (except medicines reimbursed at 15%).")}</p>
    <${MedicineDescription} cis=${item.cis_code} cip13=${item.cip13} />
    <div class="card" style="margin-top:18px">
      <button class="row rowbtn" onClick=${() => setArchived(!item.archived_at)}><div class="main left name" style="color:var(--accent)">
        ${item.archived_at ? T("Remettre dans l'inventaire", "Put back in the inventory") : T("Archiver (plus à la maison)", "Archive (no longer at home)")}</div></button>
    </div>
    <p class="note indent">${item.archived_at
      ? T("Archivé : hors de la liste et des alertes, mais toujours compté dans Mes dépenses. Une nouvelle boîte le remet dans l'inventaire.", "Archived: off the list and alerts, but still counted in My spending. A new box puts it back in the inventory.")
      : T("Archiver : le médicament quitte la liste et les alertes de péremption, mais reste compté dans Mes dépenses.", "Archive: the medicine leaves the list and expiry alerts, but stays counted in My spending.")}</p>
    ${removing && html`<${RemoveLot} lot=${removing} perBox=${perBox} onClose=${() => { setRemoving(null); load(); }} />`}
  </${Sheet}>`;
}

function RemoveLot({ lot, perBox, onClose }) {
  const [quantity, setQuantity] = useState(Math.min(perBox, Number(lot.quantity)));
  const [reason, setReason] = useState("given");
  const [note, setNote] = useState("");
  const [error, setError] = useState(null);
  async function save() {
    const { error } = await supabase.rpc("remove_from_inventory", { p_lot_id: lot.id, p_quantity: quantity, p_reason: reason, p_note: note || null });
    if (error) setError(message(error)); else onClose();
  }
  return html`<${Sheet} title=${T("Retirer de l'inventaire", "Remove from inventory")} onClose=${onClose}
      actions=${html`<button class="link strong" onClick=${save} disabled=${!(quantity > 0 && quantity <= lot.quantity)}>${T("Retirer", "Remove")}</button>`}>
    <${ErrorBox} error=${error} />
    <div class="card form">
      <label class="row"><span class="main">${T("Quantité", "Quantity")}</span>
        <input type="number" min="1" max=${lot.quantity} value=${quantity} onInput=${(e) => setQuantity(Number(e.target.value))} /></label>
      <label class="row"><span class="main">${T("Raison", "Reason")}</span>
        <select value=${reason} onChange=${(e) => setReason(e.target.value)}>${reasons().map(([v, t]) => html`<option value=${v}>${t}</option>`)}</select></label>
      <label class="row"><input class="plain" placeholder=${T("Note (facultatif)", "Note (optional)")} value=${note} onInput=${(e) => setNote(e.target.value)} /></label>
    </div>
    <p class="note">${T(`Disponible dans ce lot : ${clean(lot.quantity)}.`, `Available in this batch: ${clean(lot.quantity)}.`)}</p>
  </${Sheet}>`;
}
