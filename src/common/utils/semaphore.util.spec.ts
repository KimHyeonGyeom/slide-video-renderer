import { describe, expect, it } from 'vitest';
import { Semaphore } from './semaphore.util.js';

describe('Semaphore', () => {
  it('max 개까지만 동시에 통과시키고 나머지는 순서대로 기다린다', async () => {
    const sem = new Semaphore(1);
    const order: string[] = [];

    const r1 = await sem.acquire();
    order.push('a-in');
    const second = sem.acquire().then((release) => {
      order.push('b-in');
      return release;
    });

    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(1);

    r1();
    const r2 = await second;
    expect(order).toEqual(['a-in', 'b-in']);
    expect(sem.active).toBe(1);
    expect(sem.waiting).toBe(0);

    r2();
    expect(sem.active).toBe(0);
  });

  it('반납을 두 번 호출해도 슬롯이 두 개가 되지 않는다', async () => {
    const sem = new Semaphore(1);
    const release = await sem.acquire();
    release();
    release();
    expect(sem.active).toBe(0);
    const again = await sem.acquire();
    expect(sem.active).toBe(1);
    again();
  });
});
