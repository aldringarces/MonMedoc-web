// Aujourd'hui: today's doses, ticked like on the iPhone.
import { html, T, timeOf, clean } from "./lib.js";

const groups = [
  [T("Matin", "Morning"), 0, 10], [T("Midi", "Midday"), 11, 14],
  [T("Après-midi", "Afternoon"), 15, 17], [T("Soir", "Evening"), 18, 23],
];

export function Today({ doses, onToggle }) {
  if (!doses) return html`<div class="empty">…</div>`;
  if (!doses.length) return html`<div class="empty">${T("Rien de prévu aujourd'hui.", "Nothing planned today.")}</div>`;
  return groups.map(([title, from, to]) => {
    const items = doses.filter((d) => { const hr = new Date(d.scheduled_for).getHours(); return hr >= from && hr <= to; });
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
            <div class="sub">${clean(d.units)} × ${d.form || T("unité", "unit")} · ${timeOf(d.scheduled_for)}</div>
            ${auto && html`<div class="sub">${taken ? T("Prise enregistrée automatiquement", "Logged automatically")
                                                    : T("Sera enregistrée automatiquement", "Will be logged automatically")}</div>`}
          </div>
        </div>`;
      })}</div>
    </div>`;
  });
}
