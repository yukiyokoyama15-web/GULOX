import React from 'react';

interface GubloxLogoProps {
  className?: string;
  variant?: 'full' | 'simple';
  color?: string;
}

export const GubloxLogo: React.FC<GubloxLogoProps> = ({ className = "", variant = 'full', color = 'white' }) => {
  const [hasError, setHasError] = React.useState(false);

  return (
    <div className={`flex flex-col items-center justify-center ${className} overflow-hidden`}>
      {/* Filtro Inteligente: Usa o contorno vermelho para criar uma máscara que mantém o interior das letras */}
      <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <filter id="smart-remove-bg" x="-20%" y="-20%" width="140%" height="140%">
          {/* 1. Isola as partes vermelhas (contornos) com mais tolerância */}
          <feColorMatrix 
            type="matrix" 
            values="0 0 0 0 0
                    0 0 0 0 0
                    0 0 0 0 0
                    1.2 -0.6 -0.6 0 0" 
            result="red-outlines"
          />
          {/* 2. Expande o vermelho significativamente para preencher o interior das letras */}
          <feMorphology operator="dilate" radius="12" in="red-outlines" result="filled-letters"/>
          {/* 3. Torna a máscara bem sólida e nítida */}
          <feComponentTransfer in="filled-letters" result="solid-mask">
            <feFuncA type="table" tableValues="0 0 1 1" />
          </feComponentTransfer>
          {/* 4. Suaviza levemente as bordas para não ficar serrilhado */}
          <feGaussianBlur stdDeviation="1" in="solid-mask" result="soft-mask"/>
          {/* 5. Aplica a máscara na imagem original e aumenta um pouco o brilho do branco */}
          <feComposite operator="in" in="SourceGraphic" in2="soft-mask" result="final-logo"/>
          <feColorMatrix 
            type="matrix" 
            values="1.1 0 0 0 0.05
                    0 1.1 0 0 0.05
                    0 0 1.1 0 0.05
                    0 0 0 1 0" 
          />
        </filter>
      </svg>
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        <img 
          src="/removed-background.png" 
          alt="Gublox Logo" 
          className="w-full h-full object-contain"
          referrerPolicy="no-referrer"
          style={{ filter: 'url(#smart-remove-bg)' }}
          onError={() => setHasError(true)}
        />
        
        {hasError && (
          <div className="flex flex-col items-center justify-center opacity-50">
            <div className="text-[10px] text-white/40 italic mb-2">Aguardando upload de removed-background.png...</div>
            {/* Fallback SVG that looks like the photo proportions */}
            <svg viewBox="0 0 500 200" className="w-64 h-auto opacity-20">
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="white" fontSize="80" fontFamily="serif">GUBLoX</text>
            </svg>
          </div>
        )}

        {variant === 'full' && !hasError && (
          <div 
            className="mt-2 text-center whitespace-nowrap opacity-80" 
            style={{ 
              color: color === 'white' ? 'white' : color,
              fontSize: '0.6em',
              fontFamily: '"Permanent Marker", cursive',
              letterSpacing: '0.3em',
              textTransform: 'uppercase'
            }}
          >
            LIKE OR LOVE
          </div>
        )}
      </div>
    </div>
  );
};
