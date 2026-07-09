// App shell + screen flow: Level Select -> Intro card -> Play -> (Victory /
// Defeat overlays). Holds the manifest, the loaded level, and localStorage
// progression (FR-5.1).

import { useCallback, useEffect, useState } from "react";

import type { Level, Manifest } from "./types";
import { loadLevel, loadManifest } from "./levels/loader";
import { loadCompleted, markComplete, nextLevelId } from "./state/progression";
import { IntroCard } from "./components/IntroCard";
import { LevelSelect } from "./components/LevelSelect";
import { PlayScreen } from "./components/PlayScreen";

export default function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [level, setLevel] = useState<Level | null>(null);
  const [phase, setPhase] = useState<"select" | "play">("select");
  const [showIntro, setShowIntro] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCompleted(loadCompleted());
    loadManifest()
      .then(setManifest)
      .catch((e) => setError(String(e)));
  }, []);

  const pick = useCallback(
    async (id: string) => {
      if (!manifest) return;
      const entry = manifest.levels.find((l) => l.id === id);
      if (!entry) return;
      setBusy(true);
      try {
        const loaded = await loadLevel(entry.file);
        setLevel(loaded);
        setShowIntro(true);
        setPhase("play");
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(false);
      }
    },
    [manifest],
  );

  const onWin = useCallback((id: string) => setCompleted(markComplete(id)), []);
  const onExit = useCallback(() => {
    setPhase("select");
    setLevel(null);
  }, []);
  const onNext = useCallback(() => {
    if (!manifest || !level) return;
    const next = nextLevelId(manifest, level.id);
    if (next) pick(next);
    else onExit();
  }, [manifest, level, pick, onExit]);

  if (error) {
    return (
      <div className="screen error">
        <div className="card">
          <h1>Couldn't load the game</h1>
          <p className="brief">{error}</p>
        </div>
      </div>
    );
  }
  if (!manifest || busy) {
    return (
      <div className="screen loading">
        <div className="card">
          <p className="brief">Loading Jerry's schemes…</p>
        </div>
      </div>
    );
  }

  if (phase === "play" && level) {
    if (showIntro) return <IntroCard level={level} onUnderstand={() => setShowIntro(false)} />;
    const hasNext = nextLevelId(manifest, level.id) !== null;
    return (
      <PlayScreen
        key={level.id}
        level={level}
        hasNext={hasNext}
        onWin={onWin}
        onNext={onNext}
        onExit={onExit}
      />
    );
  }

  return <LevelSelect manifest={manifest} completed={completed} onPick={pick} />;
}
