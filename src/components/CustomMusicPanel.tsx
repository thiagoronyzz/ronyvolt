import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ListMusic, Pause, Play, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, Upload } from 'lucide-react';
import { PlayMode } from '../audio/CustomMusicLibrary';
import { customMusicMedia, CustomTrackView } from '../audio/CustomMusicMedia';
import { customMusicPlayer, CustomPlayerState } from '../audio/CustomMusicPlayer';
import { audioEngine } from '../audio/VelocityAudioEngine';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec) || sec < 0) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.wav,.flac,.opus,.webm';

const STATUS_LABEL: Record<CustomPlayerState['status'], string> = {
  idle: 'pronto',
  loading: 'carregando…',
  playing: 'tocando',
  paused: 'pausado',
  blocked: 'bloqueado pelo navegador',
  error: 'erro',
};

/**
 * "Minhas Músicas" — player-imported MP3s stored on the device (IndexedDB),
 * played as a queue inside the car. Works on PC and mobile: file picker,
 * drag & drop on desktop, touch-friendly rows.
 *
 * IMPORTANT: this component does NOT own the blob URLs anymore. They live in
 * `customMusicMedia`, so closing this tab / modal / starting a race cannot
 * revoke the URL that is currently playing. See CustomMusicMedia.ts.
 */
export const CustomMusicPanel: React.FC = () => {
  const [tracks, setTracks] = useState<CustomTrackView[]>(() => customMusicMedia.getViews());
  const [durations, setDurations] = useState<Record<string, number | null>>({});
  const [player, setPlayer] = useState<CustomPlayerState>(() => customMusicPlayer.getState());
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    // No URL cleanup here on purpose: the queue must survive unmount.
    const unsubMedia = customMusicMedia.subscribe(setTracks);
    const unsubPlayer = customMusicPlayer.subscribe(setPlayer);
    void customMusicMedia.refresh();
    return () => {
      unsubMedia();
      unsubPlayer();
    };
  }, []);

  // Probe durations lazily (metadata only, no playback).
  useEffect(() => {
    for (const t of tracks) {
      if (!t.url || durations[t.id] !== undefined) continue;
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.src = t.url;
      probe.addEventListener('loadedmetadata', () => {
        setDurations((d) => ({ ...d, [t.id]: probe.duration }));
      });
      probe.addEventListener('error', () => {
        setDurations((d) => ({ ...d, [t.id]: null }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = [...files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac|opus|webm)$/i.test(f.name));
    if (arr.length === 0) {
      setError('Nenhum arquivo de áudio válido encontrado. Use MP3, M4A, OGG, WAV ou FLAC.');
      return;
    }
    setError(null);
    audioEngine.init();
    await customMusicMedia.addFiles(arr);
  }, []);

  const removeTrack = useCallback(async (id: string) => {
    await customMusicMedia.remove(id);
  }, []);

  /** Index inside the player queue (which excludes tracks without a blob). */
  const queueIndexOf = useCallback((id: string) => {
    return tracks.filter((t) => t.url).findIndex((t) => t.id === id);
  }, [tracks]);

  const playTrack = useCallback((view: CustomTrackView) => {
    const index = queueIndexOf(view.id);
    if (index < 0) {
      setError('O arquivo desta faixa não pôde ser lido. Importe novamente.');
      return;
    }
    audioEngine.playCustom(index);
  }, [queueIndexOf]);

  const modeBtn = (mode: PlayMode, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => customMusicPlayer.setMode(mode)}
      className="vu-btn"
      style={{
        background: player.mode === mode ? 'rgba(255,149,0,0.25)' : undefined,
        borderColor: player.mode === mode ? '#ff9500' : undefined,
      }}
      title={label}
    >
      {icon}
      <span style={{ fontSize: 11 }}>{label}</span>
    </button>
  );

  const playable = tracks.filter((t) => t.url).length;
  const nowPlaying = tracks.find((t) => t.id === player.trackId) ?? null;
  const duration = player.duration || (nowPlaying ? durations[nowPlaying.id] ?? null : null);
  const progress = duration && duration > 0 ? Math.min(1, player.currentTime / duration) : 0;

  return (
    <div>
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        style={{
          border: `2px dashed ${dragOver ? '#ff9500' : 'rgba(255,255,255,0.22)'}`,
          borderRadius: 12,
          padding: '18px 14px',
          textAlign: 'center',
          background: dragOver ? 'rgba(255,149,0,0.08)' : 'rgba(255,255,255,0.03)',
          transition: 'border-color 0.15s ease, background 0.15s ease',
        }}
      >
        <Upload size={22} style={{ color: '#ff9500', marginBottom: 6 }} />
        <div style={{ fontSize: 13, fontWeight: 800 }}>Arraste seus MP3 aqui</div>
        <div className="vu-muted" style={{ margin: '4px 0 10px' }}>
          ou toque no botão abaixo — os arquivos ficam salvos neste dispositivo e tocam em sequência dentro do carro,
          inclusive depois de fechar esta janela.
        </div>
        <button className="vu-btn vu-btn-primary" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} /> Importar músicas
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={AUDIO_ACCEPT}
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {(error || player.error) && (
          <div style={{ fontSize: 11, color: '#ef233c', marginTop: 8 }}>
            {player.error ?? error}
          </div>
        )}
      </div>

      {/* Transport + queue controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px', flexWrap: 'wrap' }}>
        <button className="vu-btn vu-btn-icon" onClick={() => audioEngine.customPrevious()} title="Anterior" disabled={playable === 0}>
          <SkipBack size={16} />
        </button>
        <button
          className="vu-btn vu-btn-icon"
          style={{ background: '#ff9500', color: '#000', border: 'none', width: 44, height: 44 }}
          onClick={() => audioEngine.customToggle()}
          title={player.playing ? 'Pausar' : 'Tocar'}
          disabled={playable === 0}
        >
          {player.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="vu-btn vu-btn-icon" onClick={() => audioEngine.customNext()} title="Próxima" disabled={playable === 0}>
          <SkipForward size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nowPlaying ? nowPlaying.name : playable > 0 ? 'Pronto para tocar' : 'Nenhuma música importada'}
          </div>
          <div style={{ fontSize: 11, color: player.status === 'error' ? '#ef233c' : '#94a3b8' }}>
            {playable} faixa(s) • {STATUS_LABEL[player.status]}
            {duration ? ` • ${formatDuration(player.currentTime)} / ${formatDuration(duration)}` : ''}
          </div>
        </div>
        {modeBtn('sequential', <ListMusic size={14} />, 'Sequencial')}
        {modeBtn('loop_one', <Repeat1 size={14} />, 'Repetir uma')}
        {modeBtn('shuffle', <Shuffle size={14} />, 'Aleatória')}
      </div>

      {/* Real progress / seek */}
      {duration && duration > 0 && (
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => customMusicPlayer.seek(Number(e.target.value) / 1000)}
          title="Posição da faixa"
          style={{ width: '100%', margin: '0 0 12px' }}
        />
      )}

      {/* Volume (independent from engine/SFX) */}
      <div className="vu-slider-row" style={{ marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>Volume das minhas músicas</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(player.volume * 100)}
          onChange={(e) => audioEngine.setCustomVolume(Number(e.target.value) / 100)}
        />
        <span style={{ fontSize: 11, color: '#94a3b8', width: 34 }}>{Math.round(player.volume * 100)}%</span>
      </div>

      {/* Track list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '38vh', overflowY: 'auto', paddingRight: 4 }}>
        {tracks.map((t) => {
          const active = player.trackId === t.id;
          return (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 10,
                background: active ? 'rgba(255,149,0,0.14)' : 'rgba(255,255,255,0.035)',
                border: `1px solid ${active ? '#ff9500' : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              <button
                className="vu-btn vu-btn-icon"
                style={{ width: 34, height: 34, borderRadius: 8 }}
                onClick={() => (active ? audioEngine.customToggle() : playTrack(t))}
                title={active && player.playing ? 'Pausar' : 'Tocar'}
                disabled={!t.url}
              >
                {active && player.playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  {formatDuration(durations[t.id] ?? null)} • {formatSize(t.size)}
                  {!t.url ? ' • arquivo indisponível' : ''}
                </div>
              </div>
              {active && player.playing && (
                <span className="vu-eq" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              )}
              <button
                className="vu-btn vu-btn-icon"
                style={{ width: 30, height: 30, borderRadius: 8 }}
                onClick={() => removeTrack(t.id)}
                title="Remover"
              >
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
        {tracks.length === 0 && (
          <div className="vu-muted" style={{ textAlign: 'center', padding: 12 }}>
            Importe seus MP3 para montar a playlist do carro. Eles tocam em loop/sequência durante a corrida e podem ser
            controlados no mini-player do HUD.
          </div>
        )}
      </div>
    </div>
  );
};
