/** `45000` → `45 000 so'm`, as people write it here. */
export const formatMoney = (amount: number): string =>
  `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} so'm`;
