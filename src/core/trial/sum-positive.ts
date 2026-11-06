/** Returns the sum of the positive numbers in `xs` (zero and negatives are ignored). */
export const sumPositive = (xs: number[]): number => xs.reduce((total, x) => (x > 0 ? total + x : total), 0);
