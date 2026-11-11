import React from 'react';
import { Camera, ExternalLink, X } from 'lucide-react';
import {
  PHOTO_CREDITS,
  photoThumbUrl,
  photographicAssetErrors,
  photographicAssetsLoaded,
} from '../render/PhotographicAssets';

interface Props {
  onClose: () => void;
}

/**
 * "Referências fotográficas" — keeps the provenance of every real photograph
 * visible in-game. One source (ESO/H.H. Heyer) is CC BY 4.0 and therefore
 * requires attribution; the others are Unsplash / public domain, listed so the
 * player can verify that no stock render or AI image was used.
 */
export const PhotoCreditsModal: React.FC<Props> = ({ onClose }) => {
  const errors = photographicAssetErrors();
  return (
    <div className="vu-overlay" onClick={onClose}>
      <div
        className="vu-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(860px, 96vw)', maxHeight: '86vh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div className="vu-eyebrow" style={{ color: '#38bdf8' }}>Realismo • Passo Fotográfico</div>
            <h2 className="vu-title">Referências Fotográficas</h2>
            <div className="vu-muted" style={{ maxWidth: 660 }}>
              As texturas de asfalto, grama, casca, nuvens, horizonte, faróis e lanternas deste jogo
              são derivadas de fotografias reais — não de ruído procedural, renders de banco de imagens
              ou imagens geradas por IA. Cada foto foi recortada, transformada em textura repetível e
              convertida em mapas de normal/roughness/oclusão medidos a partir da própria luminância.
            </div>
          </div>
          <button className="vu-btn vu-btn-icon" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {PHOTO_CREDITS.map((c) => (
            <a
              key={c.file}
              href={c.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'block',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.035)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <img
                src={photoThumbUrl(c.file)}
                alt={c.label}
                loading="lazy"
                style={{ width: '100%', height: 116, objectFit: 'cover', display: 'block' }}
              />
              <div style={{ padding: '8px 10px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{c.author}</div>
                <div style={{ fontSize: 10, color: c.license.startsWith('CC') ? '#ffb347' : '#64748b', marginTop: 4 }}>
                  {c.license} <ExternalLink size={10} style={{ verticalAlign: -1 }} />
                </div>
              </div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 16, fontSize: 11, color: '#94a3b8', lineHeight: 1.6 }}>
          <div style={{ color: '#ffb347', fontWeight: 800, marginBottom: 4 }}>
            <Camera size={12} style={{ verticalAlign: -2 }} /> Atribuição obrigatória
          </div>
          O panorama noturno é <strong>ESO/H.H. Heyer, CC BY 4.0</strong> (Via Láctea, luz zodiacal e
          observatórios), obtido via Wikimedia Commons. A ESO não endossa este projeto. As demais
          imagens são de domínio público ou da licença Unsplash, que permite uso comercial e
          modificação gratuitos. Lista completa e URLs:{' '}
          <code style={{ color: '#cbd5e1' }}>assets/photos/CREDITS.md</code>.
        </div>

        <div style={{ marginTop: 10, fontSize: 11, color: errors.length ? '#ef233c' : '#64748b' }}>
          {photographicAssetsLoaded()
            ? 'Todas as texturas fotográficas foram decodificadas e estão na GPU.'
            : 'Carregando texturas fotográficas… (o jogo usa o visual procedural até terminar)'}
          {errors.length > 0 && ` • ${errors.length} arquivo(s) não carregaram: ${errors.join(', ')}`}
        </div>
      </div>
    </div>
  );
};
