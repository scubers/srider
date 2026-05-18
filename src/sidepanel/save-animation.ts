/**
 * "Save to Stash" visual feedback. Replaces a textual toast with a small
 * animated dot that morphs out of the source row/header, flies along a
 * shallow Bézier curve to the "📦 Stash" tab in the top switcher, and
 * triggers a brief shake on the target text.
 *
 * Respects `prefers-reduced-motion`: skips the morph and flight, only
 * shakes the target (still conveys "something landed there").
 */

/** A DOM rect describing where the save originated (the row or group header). */
export interface SaveAnimationOptions {
  sourceRect: DOMRect;
  /**
   * CSS selector used to find the Stash target element. The Switcher tags
   * its Stash button with this attribute. If the target isn't in the DOM
   * (e.g., user navigated away), the animation is a no-op.
   */
  targetSelector?: string;
}

const DEFAULT_SELECTOR = '[data-stash-target]';

export function runSaveAnimation(opts: SaveAnimationOptions): void {
  const target = document.querySelector<HTMLElement>(
    opts.targetSelector ?? DEFAULT_SELECTOR,
  );
  if (!target) return;
  const targetRect = target.getBoundingClientRect();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced) {
    shake(target);
    return;
  }

  const dot = makeDot();
  document.body.appendChild(dot);

  const sourceCenterX = opts.sourceRect.left + opts.sourceRect.width / 2;
  const sourceCenterY = opts.sourceRect.top + opts.sourceRect.height / 2;
  const targetCenterX = targetRect.left + targetRect.width / 2;
  const targetCenterY = targetRect.top + targetRect.height / 2;

  // Place dot at source center (dot is 12px square; offset by 6).
  dot.style.left = `${sourceCenterX - 6}px`;
  dot.style.top = `${sourceCenterY - 6}px`;

  const dx = targetCenterX - sourceCenterX;
  const dy = targetCenterY - sourceCenterY;
  // Lift the midpoint above the straight line for a soft arc.
  const ctrlX = dx / 2;
  const ctrlY = Math.min(0, dy) - 50;

  // Use CSS motion path so we don't have to integrate the bezier manually.
  const path = `path('M 0 0 Q ${ctrlX} ${ctrlY}, ${dx} ${dy}')`;
  dot.style.offsetPath = path;
  // Some browsers also want the unprefixed `motion-path`; setting both is harmless.
  (dot.style as CSSStyleDeclaration & { motionPath?: string }).motionPath = path;

  const animation = dot.animate(
    [
      { offsetDistance: '0%', opacity: 1, transform: 'scale(1)' },
      { offsetDistance: '100%', opacity: 0, transform: 'scale(0.4)' },
    ],
    {
      duration: 400,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards',
    },
  );

  animation.onfinish = () => {
    dot.remove();
    shake(target);
  };
  animation.oncancel = () => {
    dot.remove();
  };
}

function makeDot(): HTMLElement {
  const dot = document.createElement('div');
  dot.setAttribute('aria-hidden', 'true');
  dot.style.cssText = [
    'position: fixed',
    'width: 12px',
    'height: 12px',
    'border-radius: 50%',
    'background: var(--accent, #4f46e5)',
    'z-index: 9999',
    'pointer-events: none',
    'box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25)',
  ].join('; ');
  return dot;
}

function shake(target: HTMLElement): void {
  target.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-2px)' },
      { transform: 'translateX(2px)' },
      { transform: 'translateX(-2px)' },
      { transform: 'translateX(2px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 150, easing: 'linear' },
  );
}
