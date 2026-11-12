// Aujourd'hui: today's doses, ticked like on the iPhone, then the
// "si besoin" (as needed) medicines with a "Prendre" button (update 023).
import { html, supabase, T, timeOf, clean, message } from "./lib.js";
import { purposeOf, Purpose } from "./info.js";

const groups = [
  [T("Matin", "Morning"), 0, 10], [T("Midi", "Midday"), 11, 14],
  [T("Après-midi", "Afternoon"), 15, 17], [T("Soir", "Evening"), 18, 23],
];

export function Today({ doses, meds, indications, onToggle, onChanged, onError }) {
  const medById = Object.fromEntries((meds || []).map((m) => [m.id, m]));
  if (!doses) return html`<div class="empty">…</div>`;
  const planned = doses.filter((d) => !d.as_needed);
  const asNeeded = (meds || []).filter((m) => m.as_needed);
  if (!planned.length && !asNeeded.length) return html`<div class="empty">${T("Rien de prévu aujourd'hui.", "Nothing planned today.")}</div>`;
  const purpose = (id) => { const m = medById[id]; return m ? html`<${Purpose} text=${purposeOf(m.purpose, m.cis_code, indications)} />` : null; };

  const sections = groups.map(([title, from, to]) => {
    const items = planned.filter((d) => { const hr = new Date(d.scheduled_for).getHours(); return hr >= from && hr <= to; });
    if (!items.length) return null;
    return html`<div>
      <div class="section-title">${title}</div>
      <div class="card">${items.map((d) => {
        const auto = d.logging_mode === "automatic";
        const taken = d.status === "taken";
        return html`<div class="row">
          <button class=${"tick" + (taken ? " done" : "") + (auto ? " auto" : "")} disabled=${auto}
                  onClick=${() => !auto && onToggle(d)} aria-label=${taken ? T("Pris", "Taken") : T("À prendre", "To take")}>
            ${taken ? "✓" : ""}</button>
          <div class="main">
            <div class="name">${d.display_name}</div>
            ${purpose(d.prescription_item_id)}
            <div class="sub">${clean(d.units)} × ${d.form || T("unité", "unit")} · ${timeOf(d.scheduled_for)}</div>
            ${auto && html`<div class="sub">${taken ? T("Prise enregistrée automatiquement", "Logged automatically")
                                                    : T("Sera enregistrée automatiquement", "Will be logged automatically")}</div>`}
          </div>
        </div>`;
      })}</div>
    </div>`;
  });

  return html`${sections}
    ${asNeeded.length ? html`<div>
      <div class="section-title">${T("Si besoin", "As needed")}</div>
      <div class="card">${asNeeded.map((m) => html`<${AsNeededRow} med=${m} purpose=${purpose(m.id)}
          doses=${doses.filter((d) => d.as_needed && d.prescription_item_id === m.id && d.status === "taken")}
          onChanged=${onChanged} onError=${onError} />`)}</div>
    </div>` : ""}`;
}

/// Same rules as the iPhone: warn before going over the daily maximum or
/// taking it too soon after the last dose.
function AsNeededRow({ med, purpose, doses, onChanged, onError }) {
  const times = doses.map((d) => new Date(d.taken_at || d.scheduled_for)).sort((a, b) => a - b);
  const last = times[times.length - 1];
  const max = med.max_doses_per_day, gap = med.min_hours_between;
  const maxReached = max != null && times.length >= max;
  const next = last && gap ? new Date(last.getTime() + gap * 3600e3) : null;
  const tooSoon = next && next > new Date();
  const hm = (d) => timeOf(d.toISOString());

  async function take() {
    const warnings = [];
    if (maxReached) warnings.push(T(`Vous avez déjà pris ${times.length} prise(s) aujourd'hui : le maximum est ${max} par jour.`,
                                    `You've already taken ${times.length} dose(s) today: the maximum is ${max} a day.`));
    if (tooSoon) warnings.push(T(`Dernière prise à ${hm(last)} : attendez ${clean(gap)} h entre deux prises (après ${hm(next)}).`,
                                 `Last dose at ${hm(last)}: wait ${clean(gap)} h between doses (after ${hm(next)}).`));
    if (warnings.length && !confirm(warnings.join("\n\n") + "\n\n" + T("Prendre quand même ?", "Take anyway?"))) return;
    const { error } = await supabase.from("dose_logs").insert({
      prescription_item_id: med.id, scheduled_for: new Date().toISOString(), units: med.units_per_dose, status: "taken",
    });
    if (error) onError(message(error));
    await onChanged();
  }
  async function undo() {
    const lastDose = [...doses].sort((a, b) => new Date(b.taken_at || b.scheduled_for) - new Date(a.taken_at || a.scheduled_for))[0];
    if (!lastDose || !confirm(T("Annuler la dernière prise ?", "Undo the last dose?"))) return;
    const { error } = await supabase.from("dose_logs").delete().eq("id", lastDose.dose_log_id);
    if (error) onError(message(error));
    await onChanged();
  }

  const count = max != null ? T(`${times.length}/${max} aujourd'hui`, `${times.length}/${max} today`)
                            : T(`${times.length} aujourd'hui`, `${times.length} today`);
  return html`<div class="row">
    <span class="asneeded-icon" aria-hidden="true">✋</span>
    <div class="main">
      <div class="name">${med.display_name}</div>
      ${purpose}
      <div class=${"sub" + (maxReached ? " orange" : "")}>${clean(med.units_per_dose)} × ${med.form || T("unité", "unit")} · ${count}${last ? T(` · dernière à ${hm(last)}`, ` · last at ${hm(last)}`) : ""}</div>
      ${tooSoon && html`<div class="sub orange">${T(`Prochaine prise possible à ${hm(next)}`, `Next dose possible at ${hm(next)}`)}</div>`}
      ${doses.length ? html`<button class="link small" onClick=${undo}>${T("Annuler la dernière prise", "Undo last dose")}</button>` : ""}
    </div>
    <button class="primary small" onClick=${take}>${T("Prendre", "Take")}</button>
  </div>`;
}
