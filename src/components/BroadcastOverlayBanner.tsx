import { useState, useEffect, useRef } from 'react';
import { AnimationOverlay } from '@/lib/displaySync';

interface BroadcastOverlayBannerProps {
  overlay: AnimationOverlay;
  onHide?: () => void;
}

/**
 * Full-width professional broadcast banner for FOUR, SIX, WICKET events.
 * Inspired by ICC/IPL broadcast lower-third overlays.
 * Shows for 5 seconds then auto-hides with slide-down exit animation.
 */
export default function BroadcastOverlayBanner({ overlay, onHide }: BroadcastOverlayBannerProps) {
  const [animIn, setAnimIn] = useState(false);
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const animInTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (overlay === 'none' || !['four', 'six', 'wicket', 'free_hit', 'hat_trick'].includes(overlay)) {
      // Trigger hide animation
      setAnimIn(false);
      const t = setTimeout(() => setVisible(false), 500);
      return () => clearTimeout(t);
    }

    // Show banner
    setVisible(true);
    setAnimIn(false);

    // Clear any existing timers
    if (animInTimer.current) clearTimeout(animInTimer.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);

    // Slight delay for slide-up animation
    animInTimer.current = setTimeout(() => setAnimIn(true), 40);

    // Auto-hide after 5 seconds
    hideTimer.current = setTimeout(() => {
      setAnimIn(false);
      setTimeout(() => {
        setVisible(false);
        onHide?.();
      }, 500);
    }, 5000);

    return () => {
      if (animInTimer.current) clearTimeout(animInTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [overlay]);

  if (!visible) return null;

  // === Config per overlay type ===
  type BannerConfig = {
    label: string;
    bgGradient: string;
    ghostColor: string;
    textColor: string;
    iconType: 'diamond' | 'arrow' | 'chevron';
    iconColor: string;
    borderColor: string;
    glowColor: string;
    scrollText: string;
  };

  const configs: Partial<Record<AnimationOverlay, BannerConfig>> = {
    four: {
      label: 'FOUR',
      bgGradient: 'linear-gradient(135deg, #2d1b8e 0%, #3d2098 30%, #4a27a8 50%, #3d2098 70%, #2d1b8e 100%)',
      ghostColor: 'rgba(180,150,255,0.18)',
      textColor: '#ffffff',
      iconType: 'diamond',
      iconColor: '#f472b6',
      borderColor: '#d4a017',
      glowColor: 'rgba(100,60,220,0.5)',
      scrollText: 'FOUR',
    },
    six: {
      label: 'SIX',
      bgGradient: 'linear-gradient(135deg, #be185d 0%, #db2777 30%, #ec4899 50%, #db2777 70%, #be185d 100%)',
      ghostColor: 'rgba(255,200,230,0.18)',
      textColor: '#ffffff',
      iconType: 'diamond',
      iconColor: '#a855f7',
      borderColor: '#d4a017',
      glowColor: 'rgba(220,60,150,0.5)',
      scrollText: 'SIX',
    },
    wicket: {
      label: 'WICKET',
      bgGradient: 'linear-gradient(135deg, #991b1b 0%, #b91c1c 30%, #dc2626 50%, #b91c1c 70%, #991b1b 100%)',
      ghostColor: 'rgba(255,180,180,0.18)',
      textColor: '#ffffff',
      iconType: 'chevron',
      iconColor: '#fbbf24',
      borderColor: '#d4a017',
      glowColor: 'rgba(220,30,30,0.5)',
      scrollText: 'WICKET',
    },
    free_hit: {
      label: 'FREE HIT',
      bgGradient: 'linear-gradient(135deg, #92400e 0%, #b45309 30%, #d97706 50%, #b45309 70%, #92400e 100%)',
      ghostColor: 'rgba(255,220,100,0.18)',
      textColor: '#ffffff',
      iconType: 'diamond',
      iconColor: '#fef08a',
      borderColor: '#d4a017',
      glowColor: 'rgba(220,150,20,0.5)',
      scrollText: 'FREE HIT',
    },
    hat_trick: {
      label: 'HAT TRICK!',
      bgGradient: 'linear-gradient(135deg, #4c1d95 0%, #5b21b6 30%, #7c3aed 50%, #5b21b6 70%, #4c1d95 100%)',
      ghostColor: 'rgba(200,180,255,0.18)',
      textColor: '#ffffff',
      iconType: 'diamond',
      iconColor: '#f472b6',
      borderColor: '#d4a017',
      glowColor: 'rgba(120,60,240,0.5)',
      scrollText: 'HAT TRICK',
    },
  };

  const cfg = configs[overlay];
  if (!cfg) return null;

  // Build scrolling ghost text
  const ghostItems = Array.from({ length: 8 }, (_, i) => cfg.scrollText);

  return (
    <>
      <style>{`
        @keyframes bcBannerScrollLeft {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes bcCenterPulse {
          0%, 100% { letter-spacing: 0.12em; }
          50% { letter-spacing: 0.18em; }
        }
        @keyframes bcIconSpin {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(180deg) scale(1.2); }
          100% { transform: rotate(360deg) scale(1); }
        }
        @keyframes bcIconBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.3); }
        }
        @keyframes bcShimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes bcGlowPulse {
          0%, 100% { box-shadow: 0 0 20px ${cfg.glowColor}; }
          50% { box-shadow: 0 0 50px ${cfg.glowColor}, 0 0 80px ${cfg.glowColor}; }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 200,
          transform: animIn ? 'translateY(0)' : 'translateY(102%)',
          transition: 'transform 0.42s cubic-bezier(0.34, 1.10, 0.64, 1)',
          pointerEvents: 'none',
          willChange: 'transform',
        }}
      >
        {/* Gold top border */}
        <div style={{
          height: '5px',
          background: `linear-gradient(90deg, #92400e, ${cfg.borderColor}, #fbbf24, ${cfg.borderColor}, #92400e)`,
          backgroundSize: '200% 100%',
          animation: 'bcShimmer 2s linear infinite',
        }} />

        {/* Main banner */}
        <div style={{
          position: 'relative',
          height: '80px',
          background: cfg.bgGradient,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          animation: 'bcGlowPulse 1.5s ease-in-out infinite',
        }}>
          {/* Scrolling ghost text layer */}
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              gap: '60px',
              whiteSpace: 'nowrap',
              animation: 'bcBannerScrollLeft 8s linear infinite',
              willChange: 'transform',
            }}>
              {[...ghostItems, ...ghostItems].map((text, i) => (
                <span
                  key={i}
                  style={{
                    fontFamily: 'Oswald, system-ui, sans-serif',
                    fontWeight: 900,
                    fontSize: '62px',
                    color: cfg.ghostColor,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    userSelect: 'none',
                  }}
                >
                  {text}
                </span>
              ))}
            </div>
          </div>

          {/* Left decorative icon */}
          <div style={{
            position: 'absolute',
            left: '80px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <IconElement type={cfg.iconType} color={cfg.iconColor} size={38} animate />
          </div>

          {/* Right decorative icon */}
          <div style={{
            position: 'absolute',
            right: '80px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <IconElement type={cfg.iconType} color={cfg.iconColor} size={38} animate />
          </div>

          {/* CENTER: Main label */}
          <div style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}>
            <span style={{
              fontFamily: 'Oswald, system-ui, sans-serif',
              fontWeight: 900,
              fontSize: '52px',
              color: cfg.textColor,
              textTransform: 'uppercase',
              letterSpacing: '0.14em',
              textShadow: '0 2px 20px rgba(0,0,0,0.8), 0 0 40px rgba(255,255,255,0.15)',
              animation: 'bcCenterPulse 1.2s ease-in-out infinite',
              whiteSpace: 'nowrap',
            }}>
              {cfg.label}
            </span>
          </div>
        </div>

        {/* Gold bottom border */}
        <div style={{
          height: '5px',
          background: `linear-gradient(90deg, #92400e, ${cfg.borderColor}, #fbbf24, ${cfg.borderColor}, #92400e)`,
          backgroundSize: '200% 100%',
          animation: 'bcShimmer 2s linear infinite',
        }} />
      </div>
    </>
  );
}

// Icon sub-component
function IconElement({ type, color, size, animate }: { type: 'diamond' | 'arrow' | 'chevron'; color: string; size: number; animate?: boolean }) {
  const animStyle = animate ? { animation: 'bcIconBounce 1.4s ease-in-out infinite' } : {};

  if (type === 'diamond') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" style={animStyle}>
        <polygon points="20,2 38,20 20,38 2,20" fill={color} />
        <polygon points="20,8 32,20 20,32 8,20" fill="rgba(255,255,255,0.2)" />
      </svg>
    );
  }
  if (type === 'chevron') {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" style={{ ...animStyle }}>
        <polygon points="0,0 30,20 0,40" fill={color} />
        <polygon points="10,5 30,20 10,35" fill="rgba(255,255,255,0.3)" />
      </svg>
    );
  }
  // arrow
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={animStyle}>
      <polygon points="0,10 25,10 25,2 40,20 25,38 25,30 0,30" fill={color} />
    </svg>
  );
}
