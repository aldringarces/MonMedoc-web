// Small shared pieces: profile photo/initials, the profile menu, sheets.
import { useState, useEffect, useRef } from "https://esm.sh/preact@10.24.3/hooks";
import { html, supabase, T, initials, profileName, menuName } from "./lib.js";

const photoCache = new Map();   // "id|version" → object URL

export function Avatar({ profile, size = 44, onClick }) {
  const key = profile && profile.photo_updated_at ? `${profile.id}|${profile.photo_updated_at}` : null;
  const [src, setSrc] = useState(key ? photoCache.get(key) : null);
  useEffect(() => {
    if (!key) { setSrc(null); return; }
    if (photoCache.has(key)) { setSrc(photoCache.get(key)); return; }
    supabase.storage.from("profile-photos").download(profile.id.toLowerCase() + ".jpg").then(({ data }) => {
      if (data) { const url = URL.createObjectURL(data); photoCache.set(key, url); setSrc(url); }
    });
  }, [key]);
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
  return html`<button class="avatar" style=${style} onClick=${onClick} title=${profile ? profileName(profile) : ""} tabindex=${onClick ? 0 : -1}>
    ${src ? html`<img src=${src} alt="" />` : profile ? initials(profile) : "?"}
  </button>`;
}

export function ProfileMenu({ profiles, active, onSwitch, onManage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const sorted = [...profiles].sort((a, b) => (b.is_self - a.is_self) || profileName(a).localeCompare(profileName(b)));
  return html`<div style="position:relative" ref=${ref}>
    <${Avatar} profile=${active} onClick=${() => setOpen(!open)} />
    ${open && html`<div class="menu">
      ${sorted.map((p) => html`<button onClick=${() => { setOpen(false); onSwitch(p.id); }}>
        <span class="check">${p.is_active ? "✓" : ""}</span>${menuName(p)}</button>`)}
      <hr />
      <button onClick=${() => { setOpen(false); onManage(); }}><span class="check"></span>${T("Gérer les profils…", "Manage profiles…")}</button>
    </div>`}
  </div>`;
}

/// A panel over the page (like an iPhone sheet), closed with ✕ or Échap.
export function Sheet({ title, onClose, children, actions }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return html`<div class="sheet-bg" onClick=${(e) => e.target === e.currentTarget && onClose()}>
    <div class="sheet" role="dialog" aria-label=${title}>
      <div class="sheet-head">
        <button class="link" onClick=${onClose}>${T("Fermer", "Close")}</button>
        <strong>${title}</strong>
        <span>${actions || ""}</span>
      </div>
      <div class="sheet-body">${children}</div>
    </div>
  </div>`;
}

export const ErrorBox = ({ error }) => (error ? html`<div class="error">${error}</div>` : null);
