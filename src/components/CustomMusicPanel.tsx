import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Trash2, Upload } from 'lucide-react';
import { customMusicLibrary, CustomTrackMeta, PlayMode } from '../audio/CustomMusicLibrary';
import { customMusicPlayer, CustomPlayerState } from '../audio/CustomMusicPlayer';
import { audioEngine } from '../audio/VelocityAudioEngine';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.ogg,.oga,.wav,.flac,.opus,.webm';

/**
 * "Minhas Músicas" — player-imported MP3s stored on the device (IndexedDB),
 * played as a queue inside the car. Works on PC and mobile: file picker,
 * drag & drop on desktop, touch-friendly rows.
 */
export const CustomMusicPanel: React.FC = () => {
  const [tracks, setTracks] = useState<CustomTrackMeta[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [durations, setDurations] = useState<Record<string, number | null>>({});
  const [player, setPlayer] = useState<CustomPlayerState>(() => customMusicPlayer.getState());
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const urlsRef = useRef<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const list = await customMusicLibrary.list();
    setTracks(list);
    const next: Record<string, string> = {};
    for (const t of list) {
      const existing = urlsRef.current[t.id];
      if (existing) {
        next[t.id] = existing;
      } else {
        const blob = await customMusicLibrary.getBlob(t.id);
        if (blob) next[t.id] = URL.createObjectURL(blob);
      }
    }
    // Revoke URLs of removed tracks.
    for (const [id, url] of Object.entries(urlsRef.current)) {
      if (!next[id]) URL.revokeObjectURL(url);
    }
    urlsRef.current = next;
    setUrls(next);
    customMusicPlayer.setTracks(
      list.filter((t) => next[t.id]).map((t) => ({ id: t.id, name: t.name, url: next[t.id] }))
    );
  }, []);

  useEffect(() => {
    refresh();
    const unsub = customMusicPlayer.subscribe(setPlayer);
    return () => {
      unsub();
      for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
      urlsRef.current = {};
    };
  }, [refresh]);

  // Probe durations lazily (metadata only, no playback).
  useEffect(() => {
    for (const t of tracks) {
      if (durations[t.id] !== undefined || !urls[t.id]) continue;
      const probe = new Audio();
      probe.preload = 'metadata';
      probe.src = urls[t.id];
      probe.addEventListener('loadedmetadata', () => {
        setDurations((d) => ({ ...d, [t.id]: probe.duration }));
      });
      probe.addEventListener('error', () => {
        setDurations((d) => ({ ...d, [t.id]: null }));
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, urls]);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = [...files].filter((f) => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|wav|flac|opus|webm)$/i.test(f.name));
      if (arr.length === 0) {
        setError('Nenhum arquivo de áudio válido encontrado. Use MP3, M4A, OGG, WAV ou FLAC.');
        return;
      }
      setError(null);
      audioEngine.init();
      for (const f of arr) {
        await customMusicLibrary.add(f);
      }
      await refresh();
    },
    [refresh]
  );

  const removeTrack = useCallback(
    async (id: string) => {
      await customMusicLibrary.remove(id);
      await refresh();
    },
    [refresh]
  );

  const playTrack = useCallback((index: number) => {
    audioEngine.init();
    audioEngine.setStation('custom_usb');
    customMusicPlayer.play(index);
  }, []);

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

  const nowPlaying = player.index >= 0 ? tracks[player.index] : null;

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
          ou toque no botão abaixo — os arquivos ficam salvos neste dispositivo e tocam em sequência dentro do carro.
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
        {error && (
          <div style={{ fontSize: 11, color: '#ef233c', marginTop: 8 }}>{error}</div>
        )}
      </div>

      {/* Transport + queue controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '14px 0 10px',
          flexWrap: 'wrap',
        }}
      >
        <button className="vu-btn vu-btn-icon" onClick={() => customMusicPlayer.previous()} title="Anterior" disabled={tracks.length === 0}>
          <SkipBack size={16} />
        </button>
        <button
          className="vu-btn vu-btn-icon"
          style={{ background: '#ff9500', color: '#000', border: 'none', width: 44, height: 44 }}
          onClick={() => {
            audioEngine.init();
            audioEngine.setStation('custom_usb');
            customMusicPlayer.toggle();
          }}
          title={player.playing ? 'Pausar' : 'Tocar'}
          disabled={tracks.length === 0}
        >
          {player.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="vu-btn vu-btn-icon" onClick={() => customMusicPlayer.next()} title="Próxima" disabled={tracks.length === 0}>
          <SkipForward size={16} />
        </button>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nowPlaying ? nowPlaying.name : tracks.length > 0 ? 'Pronto para tocar' : 'Nenhuma música importada'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>
            {tracks.length} faixa(s) • {player.playing ? 'tocando' : 'pausado'}
          </div>
        </div>
        {modeBtn('sequential', <ListMusic size={14} />, 'Sequencial')}
        {modeBtn('loop_one', <Repeat1 size={14} />, 'Repetir uma')}
        {modeBtn('shuffle', <Shuffle size={14} />, 'Aleatória')}
        {modeBtn('sequential', <Repeat size={14} />, '')}
      </div>

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
        {tracks.map((t, i) => {
          const active = player.index === i;
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
                onClick={() => (active ? customMusicPlayer.toggle() : playTrack(i))}
                title={active && player.playing ? 'Pausar' : 'Tocar'}
              >
                {active && player.playing ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  {formatDuration(durations[t.id] ?? null)} • {formatSize(t.size)}
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
