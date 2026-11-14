import type { ComponentFixture } from '@angular/core/testing';

/** What a user does in a form, as DOM events, for the page tests. Each waits until the page has updated. */

export async function typeInto(
  fixture: ComponentFixture<unknown>,
  field: HTMLInputElement,
  text: string,
): Promise<void> {
  field.value = text;
  field.dispatchEvent(new Event('input'));
  await fixture.whenStable();
}

export async function chooseOption(
  fixture: ComponentFixture<unknown>,
  select: HTMLSelectElement,
  optionValue: string,
): Promise<void> {
  select.value = optionValue;
  select.dispatchEvent(new Event('input'));
  select.dispatchEvent(new Event('change'));
  await fixture.whenStable();
}

/** Sends the form as the Run button would (a disabled button cannot be clicked, so this sends it anyway). */
export async function submitForm(
  fixture: ComponentFixture<unknown>,
): Promise<void> {
  const page = fixture.nativeElement as HTMLElement;
  page
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await fixture.whenStable();
}

export function numberFields(
  fixture: ComponentFixture<unknown>,
): HTMLInputElement[] {
  const page = fixture.nativeElement as HTMLElement;
  return [...page.querySelectorAll<HTMLInputElement>('input[type=number]')];
}

export function selects(
  fixture: ComponentFixture<unknown>,
): HTMLSelectElement[] {
  const page = fixture.nativeElement as HTMLElement;
  return [...page.querySelectorAll('select')];
}
