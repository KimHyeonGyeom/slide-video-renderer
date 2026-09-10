/**
 * 카운팅 세마포어. Spring 의 java.util.concurrent.Semaphore 와 같은 역할.
 * 렌더를 파드당 N개로 제한하는 데 쓴다. 기다리는 쪽은 프로미스로 대기하므로 메모리를 거의 쓰지 않는다.
 */
export class Semaphore {
  private readonly waiters: Array<() => void> = [];
  private activeCount = 0;

  constructor(private readonly max: number) {}

  /** 실행 중인 수 */
  get active(): number {
    return this.activeCount;
  }

  /** 대기 중인 수 */
  get waiting(): number {
    return this.waiters.length;
  }

  /** 슬롯을 얻는다. 반환된 함수를 호출하면 반납된다 (두 번 호출해도 안전). */
  async acquire(): Promise<() => void> {
    if (this.activeCount < this.max) {
      this.activeCount++;
    } else {
      // 슬롯이 반납될 때 그대로 넘겨받는다 (activeCount 는 그대로).
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) next();
      else this.activeCount--;
    };
  }
}
