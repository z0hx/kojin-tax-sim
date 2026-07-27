// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PersonAvatar } from '../PersonAvatar';

afterEach(cleanup);

describe('PersonAvatar', () => {
  it('表示名の先頭1文字を表示する', () => {
    const { container } = render(<PersonAvatar displayName="配偶者" color="#112233" />);
    expect(container).toHaveTextContent('配');
  });

  it('表示名が空文字の場合は?を表示する', () => {
    const { container } = render(<PersonAvatar displayName="" color="#112233" />);
    expect(container).toHaveTextContent('?');
  });

  it('識別色を背景色として反映する', () => {
    const { container } = render(<PersonAvatar displayName="本人" color="#112233" />);
    const span = container.querySelector('span')!;
    expect(span.style.background).toBe('rgb(17, 34, 51)');
  });
});
