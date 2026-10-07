// Read through the provider's row cap; never render a silently partial recipient set.
export async function collectPages<T>(
  read: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await read(from, from + 499);
    if (result.error || !result.data)
      throw new Error("Unable to load all items. Please try again.");
    rows.push(...result.data);
    if (result.data.length < 500) return rows;
  }
}
