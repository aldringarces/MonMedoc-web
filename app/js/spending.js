// Dépenses en pharmacie: boxes received valued at their public price,
// health insurance share estimated (ALD = 100 %, except 15 % medicines),
// and the amounts actually paid (update 026, same as the iPhone).
import { useState, useEffect } from "https://esm.sh/preact@10.24.3/hooks";
import { html, supabase, T, locale, clean, parseDay, message } from "./lib.js";
import { Sheet, ErrorBox } from "./components.js";

const euros = (n) => Number(n || 0).toLocaleString(locale, { style: "currency", currency: "EUR" });
const short = (d) => d.toLocaleDateString(locale, { day: "numeric", month: "short" });

export function Spending({ onClose }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [lines, setLines] = useState(null);
  const [payments, setPayments] = useState([]);
  const [error, setError] = useState(null);
  const [amount, setAmount] = useState("");

  async function load() {
    const [l, p] = await Promise.all([supabase.from("pharmacy_spending").select(),
                                      supabase.from("pharmacy_payments").select().order("paid_on", { ascending: false })]);
    if (l.error || p.error) setError(message(l.error || p.error));
    setLines(l.data || []); setPayments(p.data || []);
  }
  useEffect(() => { load(); }, []);

  async function addPayment(e) {
    e.preventDefault();
    const value = Number(amount.replace(",", ".").replace("€", "").trim());
    if (!(value >= 0) || amount.trim() === "") return;
    const { error } = await supabase.from("pharmacy_payments").insert({ amount: value, paid_on: new Date().toISOString().slice(0, 10) });
    if (error) setError(message(error)); else { setAmount(""); load(); }
  }
  async function remove(p) {
    if (!confirm(T("Supprimer ce paiement ?", "Delete this payment?"))) return;
    const { error } = await supabase.from("pharmacy_payments").delete().eq("id", p.id);
    if (error) setError(message(error)); else load();
  }

  if (!lines) return html`<${Sheet} title=${T("Dépenses en pharmacie", "Pharmacy spending")} onClose=${onClose}><div class="empty">…</div><//>`;
  const yl = lines.filter((l) => parseDay(l.day).getFullYear() === year);
  const yp = payments.filter((p) => parseDay(p.paid_on).getFullYear() === year);
  const sum = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0);
  const value = sum(yl, (l) => l.value), insurance = sum(yl, (l) => l.insurance_share);
  const years = [...new Set([thisYear, ...lines.map((l) => parseDay(l.day).getFullYear()), ...payments.map((p) => parseDay(p.paid_on).getFullYear())])].sort((a, b) => b - a);
  const monthKeys = [...new Set([...yl.map((l) => l.day.slice(0, 7)), ...yp.map((p) => p.paid_on.slice(0, 7))])].sort().reverse();

  const detail = (l) => {
    const parts = [short(parseDay(l.day))];
    if (l.boxes != null) parts.push(T(`${clean(l.boxes)} boîte(s)`, `${clean(l.boxes)} box(es)`));
    if (Number(l.rate) > 0) parts.push(l.ald && Number(l.covered_rate) !== Number(l.rate)
      ? T(`${clean(l.rate)} % → ALD ${clean(l.covered_rate)} %`, `${clean(l.rate)}% → ALD ${clean(l.covered_rate)}%`)
      : T(`remb. ${clean(l.rate)} %`, `reimb. ${clean(l.rate)}%`));
    else if (l.price != null) parts.push(T("non remboursé", "not reimbursed"));
    return parts.join(" · ");
  };

  return html`<${Sheet} title=${T("Dépenses en pharmacie", "Pharmacy spending")} onClose=${onClose}>
    <${ErrorBox} error=${error} />
    <div class="card form">
      <div class="row"><div class="main">${T("Année", "Year")}</div>
        <select value=${year} onChange=${(e) => setYear(Number(e.target.value))}>${years.map((y) => html`<option value=${y}>${y}</option>`)}</select></div>
      <div class="row"><div class="main">${T("Valeur des boîtes reçues", "Value of boxes received")}</div><div class="sub">${euros(value)}</div></div>
      <div class="row"><div class="main">${T("Part Assurance maladie (estimée)", "Health insurance share (est.)")}</div><div class="sub">${euros(insurance)}</div></div>
      <div class="row"><div class="main name">${T("Reste avant mutuelle (estimé)", "Left before mutuelle (est.)")}</div><div class="name">${euros(value - insurance)}</div></div>
      ${yp.length ? html`<div class="row"><div class="main name">${T("Payé (saisi)", "Paid (entered)")}</div><div class="name">${euros(sum(yp, (p) => p.amount))}</div></div>` : ""}
    </div>
    <p class="note">${T("Prix public des boîtes reçues en pharmacie (et ajoutées à l'inventaire depuis le 12 nov. 2026). Estimation : taux de remboursement de chaque boîte, 100 % pour les traitements en ALD (sauf médicaments à 15 %). Sans votre mutuelle ni les franchises médicales : saisissez le montant payé pour le vrai total.",
                       "Public price of boxes received at the pharmacy (and added to the inventory since 12 Nov 2026). Estimate: each box's reimbursement rate, 100% for ALD treatments (except 15% medicines). Without your mutuelle or medical deductibles: enter the amount paid for the real total.")}</p>
    <form class="card form" onSubmit=${addPayment}>
      <div class="row"><div class="main">${T("Payé aujourd'hui", "Paid today")}</div>
        <input inputmode="decimal" placeholder="0,00 €" value=${amount} onInput=${(e) => setAmount(e.target.value)} style="max-width:90px" />
        <button class="primary small" style="margin:0" disabled=${!amount.trim()}>${T("Ajouter", "Add")}</button></div>
    </form>
    ${!monthKeys.length ? html`<div class="empty">${T(`Rien en ${year}.`, `Nothing in ${year}.`)}</div>` : monthKeys.map((k) => {
      const ml = yl.filter((l) => l.day.startsWith(k)), mp = yp.filter((p) => p.paid_on.startsWith(k));
      const rest = sum(ml, (l) => l.value) - sum(ml, (l) => l.insurance_share);
      const title = new Date(k + "-01T00:00:00").toLocaleDateString(locale, { month: "long" });
      return html`<div class="section-title" style="display:flex;justify-content:space-between;text-transform:capitalize"><span>${title}</span>
          <span>${mp.length ? T(`payé ${euros(sum(mp, (p) => p.amount))}`, `paid ${euros(sum(mp, (p) => p.amount))}`) : T(`reste ≈ ${euros(rest)}`, `left ≈ ${euros(rest)}`)}</span></div>
        <div class="card">
          ${ml.map((l) => html`<div class="row"><span class="hist-icon">${l.source === "inventory" ? "📦" : "💊"}</span>
            <div class="main"><div class="name">${l.name || "?"}</div><div class="sub">${detail(l)}</div></div>
            <div class="right">${l.value != null ? html`<div>${euros(l.value)}</div><div class="sub">${T("reste", "left")} ${euros(l.value - l.insurance_share)}</div>` : html`<div class="sub">${T("prix inconnu", "no price")}</div>`}</div></div>`)}
          ${mp.map((p) => html`<div class="row"><span class="hist-icon green">€</span>
            <div class="main"><div class="name">${T("Payé le", "Paid on")} ${short(parseDay(p.paid_on))}</div>${p.note ? html`<div class="sub">${p.note}</div>` : ""}</div>
            <div>${euros(p.amount)}</div><button class="link small" style="margin:0" onClick=${() => remove(p)}>✕</button></div>`)}
        </div>`;
    })}
  <//>`;
}
