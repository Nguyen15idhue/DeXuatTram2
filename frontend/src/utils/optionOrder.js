export const sortByOrder = (list) => [...(list || [])]
  .map((item, index) => ({ item, index }))
  .sort((a, b) => {
    const oa = a.item && a.item.sort_order !== undefined && a.item.sort_order !== null ? Number(a.item.sort_order) : 9999;
    const ob = b.item && b.item.sort_order !== undefined && b.item.sort_order !== null ? Number(b.item.sort_order) : 9999;
    if (oa !== ob) return oa - ob;
    return a.index - b.index;
  })
  .map(({ item }) => item);
