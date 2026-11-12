// Medicine details shared by Traitements, Inventaire and Today:
// "Pour :" labels and the description panel (same content as the app).
import { useState, useEffect } from "https://esm.sh/preact@10.24.3/hooks";
import { html, supabase, T, english, parseDay, dayText } from "./lib.js";
import { purposeFrom } from "./purpose.js";

/// Official indications per CIS code (saved by the iPhone app, update 022).
export async function loadIndications(cisCodes) {
  const codes = [...new Set(cisCodes.filter(Boolean))];
  if (!codes.length) return {};
  const { data } = await supabase.from("medicine_indications").select("cis_code,indications").in("cis_code", codes);
  return Object.fromEntries((data || []).map((r) => [r.cis_code, r.indications]));
}

/// Your own "Pour :" text first, otherwise the label from the indications.
export const purposeOf = (own, cis, indications) => (own && own.trim()) || purposeFrom(indications[cis]);

export const Purpose = ({ text }) => (text ? html`<div class="purpose">⚕︎ ${text}</div>` : null);

/// "· traitement de la goutte ," → bullet items
function bullets(text) {
  return text.split(/\n+/).map((raw) => {
    let line = raw.trim();
    if (!line) return null;
    const bullet = "·•-–—*".includes(line[0]);
    if (bullet) line = line.slice(1).trim();
    line = line.replace(/[,;]+$/, "").trim();
    if (!line) return null;
    line = line[0].toUpperCase() + line.slice(1);
    return { bullet, line };
  }).filter(Boolean);
}

const statusText = (raw) => {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (s.includes("arr")) return T("Plus commercialisé", "No longer marketed");
  if (s.includes("suspen")) return T("Suspendu", "Suspended");
  if (s.includes("retir")) return T("Retiré du marché", "Withdrawn");
  if (s.includes("commercialis")) return T("Commercialisé", "Marketed");
  return raw;
};

/// Description block: form, box, lab, status, price, rules, generics,
/// availability, indications, official page.
export function MedicineDescription({ cis, cip13 }) {
  const [med, setMed] = useState(null);
  const [extras, setExtras] = useState(null);
  const [generics, setGenerics] = useState([]);
  const [indications, setIndications] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const box = cip13
        ? supabase.from("medications").select().eq("cip13", cip13).limit(1)
        : supabase.from("medications").select().eq("cis_code", cis).limit(1);
      const [m, x, g, i] = await Promise.all([
        box,
        cis ? supabase.from("medication_extras").select().eq("cis_code", cis).limit(1) : Promise.resolve({ data: [] }),
        cis ? supabase.rpc("generic_equivalents", { p_cis: cis }) : Promise.resolve({ data: [] }),
        cis ? supabase.from("medicine_indications").select("indications").eq("cis_code", cis).limit(1) : Promise.resolve({ data: [] }),
      ]);
      setMed((m.data || [])[0] || null);
      setExtras((x.data || [])[0] || null);
      setGenerics((g.data || []).filter((r) => r.marketed).slice(0, 6));
      setIndications(((i.data || [])[0] || {}).indications || null);
      setLoaded(true);
    })();
  }, [cis, cip13]);

  if (!loaded) return html`<div class="card"><div class="row sub">…</div></div>`;
  const row = (label, value) => (value ? html`<div class="row"><div class="sub label">${label}</div><div class="main right">${value}</div></div>` : null);
  const shortage = extras && [1, 2, 3].includes(extras.availability_code);
  const purpose = purposeFrom(indications);

  return html`
    <div class="section-title">${T("Description", "Description")}</div>
    <div class="card">
      ${med && html`<div class="row"><div class="main"><div class="name">${med.name}</div></div></div>`}
      ${purpose && html`<div class="row"><div class="sub label">${T("Pour", "For")}</div><div class="main right purpose">${purpose}</div></div>`}
      ${med && row(T("Substance(s)", "Substance(s)"), (med.active_substances || []).join(" + ").toLowerCase())}
      ${med && row(T("Forme", "Form"), med.form)}
      ${med && row(T("Voie", "Route"), med.route)}
      ${med && row(T("Boîte", "Box"), med.presentation)}
      ${med && row(T("Laboratoire", "Laboratory"), med.lab)}
      ${med && row(T("Statut", "Status"), statusText(med.marketing_status))}
      ${med && row(T("Remboursement", "Reimbursement"), med.reimbursement_rate)}
      ${med && med.price != null && row(T("Prix", "Price"), `${Number(med.price).toFixed(2).replace(".", english ? "." : ",")} €`)}
      ${extras && (extras.prescription_conditions || []).length ? row(T("Prescription", "Prescription"), extras.prescription_conditions.join(" · ")) : null}
      ${shortage && html`<div class="row"><div class="sub label">${T("Disponibilité", "Availability")}</div><div class="main right orange">
        ${{ 1: T("Rupture de stock", "Out of stock"), 2: T("Tension d'approvisionnement", "Supply shortage"), 3: T("Arrêt de commercialisation", "Discontinued") }[extras.availability_code]}
        ${extras.availability_since ? html`<div class="sub">${T("depuis le", "since")} ${dayText(parseDay(extras.availability_since))}</div>` : ""}
        ${extras.availability_link ? html`<a class="link small" href=${extras.availability_link} target="_blank" rel="noopener">ANSM</a>` : ""}</div></div>`}
      ${!med && !indications && html`<div class="row sub">${T("Pas de description pour ce médicament.", "No description for this medicine.")}</div>`}
    </div>
    ${generics.length ? html`
      <div class="section-title">${T("Équivalents (même substance)", "Equivalents (same substance)")}</div>
      <div class="card">${generics.map((g) => html`<div class="row"><div class="main">${g.name}</div>
        <div class="sub">${g.generic_type === 0 ? T("Original", "Brand") : T("Générique", "Generic")}</div></div>`)}</div>` : ""}
    <div class="section-title">${T("Indications thérapeutiques", "Therapeutic indications")}</div>
    <div class="card"><div class="row"><div class="main">
      ${indications
        ? html`${english ? html`<p class="sub" style="margin:0 0 6px">${T("", "(official text, in French)")}</p>` : ""}
               ${bullets(indications).map((b) => html`<div class=${b.bullet ? "bullet" : "para"}>${b.line}</div>`)}`
        : html`<span class="sub">${T("Pas encore disponible : ouvrez ce médicament une fois dans l'app iPhone pour le charger.",
                                      "Not available yet: open this medicine once in the iPhone app to load it.")}</span>`}
    </div></div></div>
    ${cis && html`<p class="note"><a class="link small" href=${`https://base-donnees-publique.medicaments.gouv.fr/medicament/${cis}/extrait`} target="_blank" rel="noopener">${T("Fiche officielle (base publique du médicament) ↗", "Official page (public medicines database) ↗")}</a></p>`}`;
}
