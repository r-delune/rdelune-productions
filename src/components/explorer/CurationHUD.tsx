'use client';

import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { AudioSignal } from './audio-signal';
import type { BeatGrid, TrackVisualConfig, TrackVisualPlan } from './runtime/types';
import { getBeatGridPosition, getSectionRecipe } from './runtime/plans';

// Profile → muted hsl background color for section table swatches
const PROFILE_COLORS: Record<string, string> = {
  ink:      'hsl(220,28%,18%)',
  smoke:    'hsl(240,18%,20%)',
  tide:     'hsl(200,38%,18%)',
  cloud:    'hsl(210,24%,22%)',
  rain:     'hsl(195,32%,19%)',
  flow:     'hsl(180,28%,20%)',
  spiral:   'hsl(260,28%,20%)',
  contour:  'hsl(170,26%,19%)',
  planet:   'hsl(290,22%,20%)',
  particle: 'hsl(160,26%,19%)',
  galaxy:   'hsl(250,32%,22%)',
  storm:    'hsl(330,28%,20%)',
  mist:     'hsl(215,20%,22%)',
  texture:  'hsl(205,16%,20%)',
  line:     'hsl(230,22%,20%)',
  grid:     'hsl(240,18%,18%)',
  geology:  'hsl(35,20%,20%)',
  sparse:   'hsl(200,14%,18%)',
};

interface CurationHUDProps {
  visualPlan: TrackVisualPlan;
  sectionTimes: number[];
  beatGrid: BeatGrid;
  currentTime: number;
  sectionIndex: number;
  trackDuration: number | undefined;
  visualConfig: TrackVisualConfig | undefined;
  audioSignalRef: MutableRefObject<AudioSignal>;
  isPlaying: boolean;
}

interface LiveSignal {
  energy: number;
  bass: number;
  mids: number;
  highs: number;
}

function getSectionStart(sectionTimes: number[], idx: number): number {
  return idx === 0 ? 0 : (sectionTimes[idx - 1] ?? 0);
}

function getSectionEnd(sectionTimes: number[], idx: number, totalDuration: number): number {
  return sectionTimes[idx] ?? totalDuration;
}

function estimateTotalDuration(sectionTimes: number[], trackDuration: number | undefined): number {
  if (trackDuration && trackDuration > 0) return trackDuration;
  const last = sectionTimes.at(-1);
  if (last && last > 0) return last * 1.25;
  return 240;
}

export default function CurationHUD({
  visualPlan,
  sectionTimes,
  beatGrid,
  currentTime,
  sectionIndex,
  trackDuration,
  visualConfig,
  audioSignalRef,
  isPlaying,
}: CurationHUDProps) {
  const [tableExpanded, setTableExpanded] = useState(false);
  const [liveSignal, setLiveSignal] = useState<LiveSignal>({ energy: 0, bass: 0, mids: 0, highs: 0 });
  const beatDotRef = useRef<HTMLDivElement>(null);
  const prevBeatPhaseRef = useRef<number | undefined>(undefined);
  const lastMeterUpdateRef = useRef(0);

  // rAF loop for audio meters + beat pulse
  useEffect(() => {
    if (!isPlaying) return;
    let raf: number;

    const loop = () => {
      const sig = audioSignalRef.current;
      const now = Date.now();

      if (now - lastMeterUpdateRef.current > 90) {
        lastMeterUpdateRef.current = now;
        setLiveSignal({ energy: sig.energy, bass: sig.bass, mids: sig.mids, highs: sig.highs });
      }

      // Beat pulse — direct DOM mutation, no re-render
      const bp = sig.beatPhase;
      if (bp !== undefined && beatDotRef.current) {
        const prev = prevBeatPhaseRef.current;
        if (prev !== undefined && prev > 0.85 && bp < 0.15) {
          beatDotRef.current.classList.add('chud-beat-on');
          setTimeout(() => beatDotRef.current?.classList.remove('chud-beat-on'), 120);
        }
        prevBeatPhaseRef.current = bp;
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, audioSignalRef]);

  const totalDuration = estimateTotalDuration(sectionTimes, trackDuration);
  const currentRecipe = getSectionRecipe(visualPlan, sectionIndex);

  // Recent non-bar-cue events (last 2s)
  const recentEvents = visualPlan.events.filter(
    (e) => e.type !== 'bar-cue' && e.t >= currentTime - 2 && e.t <= currentTime + 0.15,
  );

  const sectionRoles = visualConfig?.storyboard?.sectionRoles;

  return (
    <div className="hidden lg:block">
      <div className="chud-root">
        {/* Section table toggle */}
        <button
          className="chud-toggle-btn"
          onClick={() => setTableExpanded((v) => !v)}
          aria-label="Toggle section table"
        >
          {tableExpanded ? 'hide sections' : 'sections'}
        </button>

        {/* Section table */}
        {tableExpanded && (
          <div className="chud-panel" style={{ maxWidth: 320, maxHeight: 240, overflowY: 'auto' }}>
            <table className="chud-section-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Recipe</th>
                  <th>Scene</th>
                  <th>Mood</th>
                  <th>Ev</th>
                  <th>Dur</th>
                </tr>
              </thead>
              <tbody>
                {visualPlan.steps.map((step, idx) => {
                  const recipe = getSectionRecipe(visualPlan, idx);
                  const start = getSectionStart(sectionTimes, idx);
                  const end = getSectionEnd(sectionTimes, idx, totalDuration);
                  const dur = end - start;
                  const evCount = visualPlan.events.filter(
                    (e) => e.type !== 'bar-cue' && e.t >= start && e.t < end,
                  ).length;
                  const role = sectionRoles?.[idx];
                  const isActive = idx === sectionIndex;
                  return (
                    <tr key={idx} className={isActive ? 'chud-active' : ''}>
                      <td>{idx + 1}</td>
                      <td style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {recipe.name}
                      </td>
                      <td>
                        <span
                          className="chud-pill"
                          style={{ background: PROFILE_COLORS[recipe.sceneProfile] ?? 'transparent' }}
                        >
                          {recipe.sceneProfile}
                        </span>
                      </td>
                      <td>{role ?? step.moodId ?? '—'}</td>
                      <td>{evCount || '—'}</td>
                      <td>{Math.round(dur)}s</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Now panel */}
        <div className="chud-panel">
          {/* Section + scene profile */}
          <div className="chud-row" style={{ marginBottom: 4 }}>
            <span className="chud-value" style={{ fontWeight: 600 }}>
              S{sectionIndex + 1}/{visualPlan.steps.length}
            </span>
            <span className="chud-muted" style={{ fontSize: '0.5rem' }}>scene</span>
            <span
              className="chud-pill"
              style={{ background: PROFILE_COLORS[currentRecipe.sceneProfile] ?? 'transparent' }}
            >
              {currentRecipe.sceneProfile}
            </span>
            <div ref={beatDotRef} className="chud-beat-dot" title="beat pulse" />
          </div>

          <div style={{ marginBottom: 6 }}>
            <span className="chud-label">Recipe</span>
            <span className="chud-value">{currentRecipe.name}</span>
          </div>

          <hr className="chud-divider" />

          {/* Audio signal meters */}
          <div className="chud-row" style={{ gap: 8, alignItems: 'flex-end' }}>
            <div>
              <span className="chud-label" style={{ marginBottom: 3, display: 'block' }}>Signal</span>
              <div className="chud-meters">
                {(['energy', 'bass', 'mids', 'highs'] as const).map((key) => (
                  <div key={key} className={`chud-meter-track chud-meter-${key[0]}`} title={key}>
                    <div
                      className="chud-meter-fill"
                      style={{ height: `${Math.round(liveSignal[key] * 100)}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <span style={{ fontSize: '0.48rem', color: 'var(--explorer-c3)', lineHeight: 1.4 }}>
              E·B·M·H
            </span>
          </div>

          {/* Recent events */}
          {recentEvents.length > 0 && (
            <>
              <hr className="chud-divider" />
              <div>
                <span className="chud-label">Events</span>
                {recentEvents.slice(0, 4).map((ev, i) => (
                  <div key={i} className="chud-event-row">
                    <span className="chud-muted" style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {ev.type}
                    </span>
                    <div className="chud-event-bar-track">
                      <div
                        className="chud-event-bar-fill"
                        style={{ width: `${Math.round((ev.intensity ?? 0.5) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
