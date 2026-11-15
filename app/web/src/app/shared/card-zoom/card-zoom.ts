import { DestroyRef, Directive, ElementRef, inject } from '@angular/core';
import { placeZoomedCard } from './zoom-placement';

const ZOOMED_CARD_WIDTH = 262;
const CARD_ASPECT = 88 / 63;
const HOVER_DELAY_MS = 120;

/**
 * Makes a card grow: a copy of it, about the size of a real card, in a pop-up beside it. Shows on mouse hover, on
 * keyboard focus, and on a tap (a second tap or a tap elsewhere closes it). The pop-up is in the top layer, so no
 * parent clips it, and it ignores the pointer, so it never takes the hover away.
 */
@Directive({
  host: {
    tabindex: '0',
    '(pointerdown)': 'rememberPointerType($event)',
    '(pointerenter)': 'onPointerEnter($event)',
    '(pointerleave)': 'hide()',
    '(focus)': 'onFocus()',
    '(blur)': 'hide()',
    '(click)': 'onClick()',
    '(keydown.escape)': 'hide()',
  },
})
export class CardZoom {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private zoomedCard: HTMLElement | undefined;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private lastPointerType = 'mouse';
  private readonly hideOnTapElsewhere = (event: Event) => {
    if (!this.host.contains(event.target as Node)) this.hide();
  };

  constructor() {
    inject(DestroyRef).onDestroy(() => this.hide());
  }

  protected rememberPointerType(event: PointerEvent): void {
    this.lastPointerType = event.pointerType;
  }

  protected onPointerEnter(event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => this.show(), HOVER_DELAY_MS);
  }

  protected onFocus(): void {
    if (this.host.matches(':focus-visible')) this.show();
  }

  protected onClick(): void {
    if (this.lastPointerType !== 'touch') return;
    if (this.zoomedCard) this.hide();
    else this.show();
  }

  protected hide(): void {
    clearTimeout(this.showTimer);
    document.removeEventListener('pointerdown', this.hideOnTapElsewhere, true);
    this.zoomedCard?.remove();
    this.zoomedCard = undefined;
  }

  private show(): void {
    if (this.zoomedCard) return;
    const zoomedCard = this.host.cloneNode(true) as HTMLElement;
    zoomedCard.removeAttribute('tabindex');
    zoomedCard.setAttribute('aria-hidden', 'true');
    zoomedCard.setAttribute('popover', 'manual');
    zoomedCard.classList.remove('is-tapped');
    zoomedCard.querySelectorAll('img').forEach((image) => {
      image.loading = 'eager';
      image.removeAttribute('title');
    });
    const height = ZOOMED_CARD_WIDTH * CARD_ASPECT;
    const { left, top } = placeZoomedCard(
      this.host.getBoundingClientRect(),
      { width: ZOOMED_CARD_WIDTH, height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    // the popover's own default styles (border, padding, centring) are reset; only left and top are set here
    zoomedCard.style.cssText = `position:fixed;inset:auto;margin:0;padding:0;border:0;overflow:visible;background:none;pointer-events:none;rotate:none;width:${ZOOMED_CARD_WIDTH}px;height:${height}px;left:${left}px;top:${top}px;`;
    document.body.appendChild(zoomedCard);
    zoomedCard.showPopover();
    this.zoomedCard = zoomedCard;
    document.addEventListener('pointerdown', this.hideOnTapElsewhere, true);
  }
}
