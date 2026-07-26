import type { Bracket } from '../taxParams/schema';
import { floor100, floor1000, type Yen } from './types';

export function calcTaxableIncome(totalIncome: Yen, deductionTotal: Yen): Yen {
  return floor1000(Math.max(0, totalIncome - deductionTotal));
}

export function lookupTaxRate(taxable: Yen, brackets: Bracket[]): { rate: number; offset: Yen } {
  const bracket = brackets.find((b) => b.upTo === null || taxable <= b.upTo) ?? brackets[brackets.length - 1];
  return { rate: bracket.rate, offset: bracket.addend as Yen };
}

export function calcCalculatedTax(taxable: Yen, rate: number, offset: Yen): Yen {
  return Math.max(0, Math.round(taxable * rate) - offset) as Yen;
}

export function calcReconstructionTax(taxAfterCredits: Yen, reconstructionSurtaxRate: number): Yen {
  return floor100(taxAfterCredits * reconstructionSurtaxRate);
}

export function calcIncomeTaxTotal(taxAfterCredits: Yen, reconstruction: Yen): Yen {
  return (taxAfterCredits + reconstruction) as Yen;
}
