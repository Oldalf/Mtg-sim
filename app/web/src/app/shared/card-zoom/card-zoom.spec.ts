import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CardZoom } from './card-zoom';

// CardZoom has no selector: components use it as a host directive, so the test does too.
@Component({
  selector: 'app-zoomable-card',
  hostDirectives: [CardZoom],
  template: '',
})
class ZoomableCard {}

@Component({
  imports: [ZoomableCard],
  template: `
    <app-zoomable-card class="first" />
    <app-zoomable-card class="second" />
    <p class="elsewhere">text</p>
  `,
})
class TwoCards {}

describe('CardZoom on a touch screen', () => {
  let firstCard: HTMLElement;
  let secondCard: HTMLElement;
  let elsewhere: HTMLElement;

  const zoomedCards = () =>
    document.body.querySelectorAll(':scope > [popover]');
  const touchPointerDown = (target: HTMLElement) =>
    target.dispatchEvent(
      new PointerEvent('pointerdown', {
        pointerType: 'touch',
        bubbles: true,
      }),
    );
  const tap = (target: HTMLElement) => {
    touchPointerDown(target);
    target.click();
  };

  beforeEach(() => {
    HTMLElement.prototype.showPopover = () => {};
    const fixture = TestBed.createComponent(TwoCards);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    firstCard = root.querySelector('.first')!;
    secondCard = root.querySelector('.second')!;
    elsewhere = root.querySelector('.elsewhere')!;
  });

  afterEach(() => {
    document.body
      .querySelectorAll(':scope > [popover]')
      .forEach((popup) => popup.remove());
  });

  it('opens on a tap', () => {
    tap(firstCard);
    expect(zoomedCards().length).toBe(1);
  });

  it('closes on a second tap on the same card', () => {
    tap(firstCard);
    tap(firstCard);
    expect(zoomedCards().length).toBe(0);
  });

  it('closes on a tap elsewhere', () => {
    tap(firstCard);
    touchPointerDown(elsewhere);
    expect(zoomedCards().length).toBe(0);
  });

  it('moves to another card on a tap on it', () => {
    tap(firstCard);
    tap(secondCard);
    expect(zoomedCards().length).toBe(1);
  });

  it('does not open from the pointer-enter a touch also sends', () => {
    firstCard.dispatchEvent(
      new PointerEvent('pointerenter', { pointerType: 'touch' }),
    );
    expect(zoomedCards().length).toBe(0);
  });
});
