export const do_ = <A>(k: () => A): A => k();

export function fold<A>(xss: A[][]): A[] {
  return xss.reduce((acc, arr) => acc.concat(arr), [] as A[]);
}

export function batch<A>(xs: A[], batch_size: number): A[][] {
  const batches: A[][] = [];
  for (let i = 0; i < xs.length; i += batch_size) {
    const batch = xs.slice(i, i + batch_size);
    batches.push(batch);
  }
  return batches;
}
