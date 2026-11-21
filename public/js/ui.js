// Tiny helpers for building the interface without a framework.

/** h("button", { class: "btn", onclick }, "Text") */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

let toastTimer = null;
export function toast(msg, ms = 3500) {
  let el = $("#toast");
  if (!el) { el = h("div", { id: "toast", role: "status", "aria-live": "polite" }); (document.getElementById("app") || document.body).append(el); }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/** Full-screen layer on top of the app. Returns a close function. */
export function overlay(content, { className = "", onClose } = {}) {
  const layer = h("div", { class: `overlay ${className}`, role: "dialog", "aria-modal": "true" }, content);
  (document.getElementById("app") || document.body).append(layer);
  document.body.classList.add("has-overlay");
  const close = () => {
    layer.remove();
    if (!document.querySelector(".overlay")) document.body.classList.remove("has-overlay");
    onClose?.();
  };
  layer.close = close;
  return close;
}

export function timeAgo(iso, t) {
  if (!iso) return "";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("ago_now");
  if (min < 60) return t("ago_min", { n: min });
  return t("ago_hr", { n: Math.floor(min / 60) });
}

export function vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch { /* ignore */ } }

/** Replaces an element's children, skipping empty (null/false) entries. */
export function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
}
