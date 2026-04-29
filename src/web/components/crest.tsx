export function Crest({ kind = "a", size = 32 }: { kind?: "a" | "b"; size?: number }) {
  const bg = kind === "a" ? "var(--accent)" : "var(--court)";
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", borderTop: "1.5px solid var(--paper)", borderBottom: "1.5px solid var(--paper)", transform: "scaleX(0.55)" }}/>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", borderLeft: "1.5px solid var(--paper)", borderRight: "1.5px solid var(--paper)", transform: "scaleY(0.6)" }}/>
    </div>
  );
}
