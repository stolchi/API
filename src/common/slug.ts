/** Turns a cafe name into a URL slug. Returns '' if nothing usable is left. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      // Uzbek apostrophes (o', g', o‘, g‘) disappear rather than splitting the word.
      .replace(/['’‘ʻʼ`]/g, '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/g, '')
  );
}
