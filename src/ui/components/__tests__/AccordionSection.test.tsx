// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AccordionSection } from '../AccordionSection';

afterEach(cleanup);

describe('AccordionSection', () => {
  it('タイトルと子要素を表示する', () => {
    render(
      <AccordionSection title="医療費">
        <p>中身</p>
      </AccordionSection>
    );
    expect(screen.getByText('医療費')).toBeInTheDocument();
    expect(screen.getByText('中身')).toBeInTheDocument();
  });

  it('defaultOpen=falseの場合は<details>が閉じた状態でレンダリングされる', () => {
    render(
      <AccordionSection title="任意区分" defaultOpen={false}>
        <p>中身</p>
      </AccordionSection>
    );
    const details = screen.getByText('任意区分').closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
  });
});
