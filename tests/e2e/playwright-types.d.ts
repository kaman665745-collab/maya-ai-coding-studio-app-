declare module '@playwright/test' {
  export interface Locator {
    click(): Promise<void>;
  }
  export interface Page {
    goto(url: string): Promise<unknown>;
    getByText(text: string | RegExp): Locator;
    getByRole(role: string, options?: { name?: string | RegExp }): Locator;
    locator(selector: string): Locator;
  }
  export function expect(target: Locator): {
    toBeVisible(options?: { timeout?: number }): Promise<void>;
  };
  export const test: {
    (title: string, fn: (args: { page: Page }) => Promise<void>): void;
    describe(title: string, fn: () => void): void;
  };
}
