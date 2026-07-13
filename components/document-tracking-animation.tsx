"use client";

import { useEffect, useRef } from "react";
import styles from "./document-tracking-animation.module.css";

type Doc = { id: string; name: string; sub: string; chip: string };

const DOCS: Doc[] = [
  { id: "cam", name: "Cámara de Comercio", sub: "Grupo Vertex S.A.S. · Vence 15 nov 2026", chip: "Vigente" },
  { id: "rut", name: "RUT actualizado", sub: "Grupo Vertex S.A.S. · Vence 31 dic 2026", chip: "Vigente" },
  { id: "pol", name: "Póliza de cumplimiento", sub: "Grupo Vertex S.A.S. · Vence 10 jul 2026", chip: "Vigente" },
  { id: "ban", name: "Certificación bancaria", sub: "Grupo Vertex S.A.S. · Vence 02 sep 2026", chip: "Vigente" },
];

const ROW_H = 90;
const PAD = 6;

function folderSVG(color1: string, color2: string) {
  return `
    <svg viewBox="0 0 46 38">
      <path d="M2 8a4 4 0 0 1 4-4h11l4 5h17a4 4 0 0 1 4 4v19a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z" fill="${color2}"/>
      <path d="M2 13h42v16a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5z" fill="${color1}"/>
    </svg>`;
}

// Animación de demostración: no refleja datos reales de ningún proveedor.
export function DocumentTrackingAnimation() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const panel = root?.querySelector<HTMLDivElement>(`.${styles.panel}`);
    const toast = root?.querySelector<HTMLDivElement>(`.${styles.toast}`);
    const badge = root?.querySelector<HTMLSpanElement>(`.${styles.badge}`);
    const bell = root?.querySelector<HTMLDivElement>(`.${styles.bell}`);
    const typed = root?.querySelector<HTMLSpanElement>(`.${styles.typed}`);
    if (!root || !panel || !toast || !badge || !bell || !typed) return;

    const rows: Record<string, HTMLDivElement> = {};
    DOCS.forEach((d) => {
      const el = document.createElement("div");
      el.className = styles.row;
      el.innerHTML = `
        <div class="${styles.pulseRing}"></div>
        <div class="${styles.folder}">${folderSVG("#3b82f6", "#2563eb")}</div>
        <div class="${styles.info}">
          <div class="${styles.docName}">${d.name}</div>
          <div class="${styles.docSub}">${d.sub}</div>
        </div>
        <div class="${styles.chip}">${d.chip}</div>`;
      panel.appendChild(el);
      rows[d.id] = el;
    });

    const setOrder = (orderIds: string[]) => {
      orderIds.forEach((id, i) => {
        rows[id].style.transform = `translateY(${PAD + i * ROW_H}px)`;
      });
    };

    let timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    function typeText(text: string, start: number, speed = 55) {
      [...text].forEach((ch, i) =>
        at(start + i * speed, () => {
          typed!.textContent += ch;
        })
      );
    }

    function reset() {
      timers.forEach(clearTimeout);
      timers = [];
      root!.classList.remove(styles.playing);
      typed!.textContent = "";
      toast!.classList.remove(styles.show);
      badge!.classList.remove(styles.pop);
      bell!.classList.remove(styles.ring);
      Object.values(rows).forEach((r) => {
        r.classList.remove(styles.in, styles.alerting, styles.shake);
        r.style.transform = "translateY(0)";
        const chip = r.querySelector<HTMLDivElement>(`.${styles.chip}`)!;
        chip.className = styles.chip;
        chip.textContent = "Vigente";
        r.querySelector(`.${styles.folder}`)!.innerHTML = folderSVG("#3b82f6", "#2563eb");
      });
    }

    function play() {
      reset();
      void root!.offsetWidth; // fuerza reflow para reiniciar las transiciones

      const baseOrder = ["cam", "rut", "pol", "ban"];
      const alertOrder = ["pol", "cam", "rut", "ban"];
      const pol = rows["pol"];
      const chip = pol.querySelector<HTMLDivElement>(`.${styles.chip}`)!;

      at(50, () => root!.classList.add(styles.playing));

      baseOrder.forEach((id, i) => {
        at(500 + i * 180, () => {
          rows[id].style.transform = `translateY(${PAD + i * ROW_H}px)`;
          rows[id].classList.add(styles.in);
        });
      });

      typeText("proveedores…", 1400);

      at(2600, () => {
        chip.classList.add(styles.warn);
        chip.textContent = "Por vencer";
      });

      at(3400, () => {
        setOrder(alertOrder);
      });

      at(4300, () => {
        pol.classList.add(styles.alerting, styles.shake);
        chip.className = `${styles.chip} ${styles.expired}`;
        chip.textContent = "Vencido";
        pol.querySelector(`.${styles.folder}`)!.innerHTML = folderSVG("#ef4444", "#dc2626");
      });

      at(4800, () => {
        toast!.classList.add(styles.show);
        bell!.classList.add(styles.ring);
        badge!.classList.add(styles.pop);
      });

      at(9200, () => toast!.classList.remove(styles.show));

      // Bucle automático
      at(11000, play);
    }

    play();

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={rootRef} className={styles.wrapper}>
      <div className={styles.stage}>
        <div className={styles.window}>
          <aside className={styles.sidebar}>
            <div className={styles.dots}>
              <span></span>
              <span></span>
            </div>
            <div className={`${styles.nav} ${styles.active}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V21h14V9.5" />
              </svg>
            </div>
            <div className={styles.nav}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <circle cx="12" cy="8" r="3.6" />
                <path d="M5 20c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" />
              </svg>
            </div>
            <div className={styles.nav}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
                <circle cx="9" cy="9" r="3.2" />
                <path d="M3.5 20c1-2.9 3-4.4 5.5-4.4s4.5 1.5 5.5 4.4" />
                <circle cx="17" cy="10" r="2.6" />
                <path d="M15.5 15.8c2.4.2 4 1.5 5 4.2" />
              </svg>
            </div>
            <div className={styles.nav}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 3h7l4 4v14H7z" />
                <path d="M14 3v4h4" />
                <path d="M10 12h5M10 16h5" />
              </svg>
            </div>
          </aside>

          <main className={styles.main}>
            <div className={styles.topbar}>
              <div className={styles.search}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m20 20-3.8-3.8" />
                </svg>
                <span className={styles.typed}></span>
                <span className={styles.caret}></span>
              </div>
              <div className={styles.bell}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 15 18 9" />
                  <path d="M10.3 20a2 2 0 0 0 3.4 0" />
                </svg>
                <span className={styles.badge}>1</span>
              </div>
            </div>

            <div className={styles.panel}></div>

            <div className={styles.toast}>
              <div className={styles.toastIcon}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3 2.5 20h19z" />
                  <path d="M12 9.5v4.5" />
                  <circle cx="12" cy="17" r=".6" fill="currentColor" />
                </svg>
              </div>
              <div>
                <div className={styles.toastTitle}>Documento vencido</div>
                <div className={styles.toastBody}>
                  La <b>Póliza de cumplimiento</b> de Grupo Vertex S.A.S. venció el 10 jul 2026.
                </div>
                <div className={styles.toastTime}>Hace un momento · Revisar ahora →</div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
