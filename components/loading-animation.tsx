import styles from "./loading-animation.module.css";

export function LoadingAnimation({ className }: { className?: string }) {
  return (
    <div className={`${styles.wrapper} ${className ?? "min-h-[60vh]"}`} role="status" aria-label="Cargando">
      <div className={styles.loader}>
        <svg viewBox="0 0 310 290" xmlns="http://www.w3.org/2000/svg" fill="none">
          {/* Documento (contorno con esquina doblada) */}
          <path
            className={styles.docOutline}
            d="M 218 118 L 218 42 L 190 14 L 52 14 C 43 14 36 21 36 30 L 36 234 C 36 243 43 250 52 250 L 128 250"
            stroke="#1d6ef5"
            strokeWidth={15}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Esquina doblada */}
          <path className={styles.fold} d="M 186 12 L 222 48 L 196 48 C 190 48 186 44 186 38 Z" fill="#1d6ef5" />

          {/* Líneas de texto */}
          <rect className={styles.tline} x={68} y={88} width={98} height={13} rx={6.5} fill="#a9c3dd" />
          <rect className={styles.tline} x={68} y={118} width={122} height={13} rx={6.5} fill="#a9c3dd" />
          <rect className={styles.tline} x={98} y={148} width={72} height={13} rx={6.5} fill="#a9c3dd" />

          {/* Recorrido de puntos hacia el pin */}
          <circle className={styles.dot} cx={152} cy={268} r={13} stroke="#1d6ef5" strokeWidth={9} />
          <circle className={styles.dot} cx={184} cy={258} r={7} fill="#1d6ef5" />
          <circle className={styles.dot} cx={207} cy={240} r={8} fill="#1d6ef5" />
          <circle className={styles.dot} cx={222} cy={214} r={9} stroke="#1d6ef5" strokeWidth={8} />
          <circle className={styles.dot} cx={243} cy={192} r={7} fill="#1d6ef5" />
          <circle className={styles.dot} cx={258} cy={172} r={6} fill="#1d6ef5" />

          {/* Pin de ubicación */}
          <g className={styles.pin}>
            <path
              d="M 266 108 C 251 108 240 119 240 133 C 240 145 252 156 263 166 C 264.7 167.6 267.3 167.6 269 166 C 280 156 292 145 292 133 C 292 119 281 108 266 108 Z"
              fill="#1d6ef5"
            />
            <circle cx={266} cy={132} r={9} fill="#fff" />
          </g>

          {/* Círculo con check */}
          <g className={styles.checkCircle}>
            <circle cx={75} cy={212} r={52} fill="#fff" stroke="#1d6ef5" strokeWidth={13} />
            <path
              className={styles.check}
              d="M 52 214 L 68 230 L 100 196"
              stroke="#0e2a5c"
              strokeWidth={15}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </div>

      <div className={styles.loadingText}>
        <span style={{ color: "var(--navy)" }}>Cargando</span>
        <span className={styles.ellipsis}>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </div>
    </div>
  );
}
