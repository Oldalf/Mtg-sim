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

/** The field whose label is exactly this text (the settings are labelled by their names). */
export function fieldLabelled<FieldElement extends HTMLElement>(
  fixture: ComponentFixture<unknown>,
  labelText: string,
): FieldElement {
  const page = fixture.nativeElement as HTMLElement;
  const formField = [...page.querySelectorAll('mat-form-field')].find(
    (candidate) =>
      candidate.querySelector('mat-label')?.textContent?.trim() === labelText,
  );
  const field = formField?.querySelector<FieldElement>('input, select');
  if (!field) throw new Error(`no field labelled ${labelText}`);
  return field;
}

/** The hint and help text of the field labelled this, as one text. */
export function helpOfField(
  fixture: ComponentFixture<unknown>,
  labelText: string,
): { hint: string; tooltip: string } {
  const formField = fieldLabelled(fixture, labelText).closest(
    'mat-form-field',
  )!;
  return {
    hint: formField.querySelector('mat-hint')?.textContent?.trim() ?? '',
    tooltip:
      formField
        .querySelector('app-help-icon mat-icon')
        ?.getAttribute('aria-label') ?? '',
  };
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
