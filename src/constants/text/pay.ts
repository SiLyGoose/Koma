import { CURRENCY_NAME } from '../core.js';
import { boldMoney } from './currency.js';

export const payText = {
  usage: (p: string) => `Use \`${p}pay @user <amount>\` (or \`${p}pay @user all\`) to give some of your ${CURRENCY_NAME} to another member.`,
  badAmount: 'The amount must be a whole number of at least 1, or "all".',
  botTarget: `Bots don't need ${CURRENCY_NAME}.`,
  selfTarget: 'You paid yourself. Nothing changed.',
  nothing: `You have no ${CURRENCY_NAME} to pay with.`,
  tooPoor: (balance: string) => `You only have ${boldMoney(balance)}`,
  title: 'Payment sent',
  done: (payer: string, payee: string, amount: string) => `${payer} paid ${payee} ${boldMoney(amount)}`,
  yourBalanceField: 'Your balance',
  theirBalanceField: 'Their balance',
};
