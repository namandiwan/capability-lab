import { artifact, type Step } from './schema.js';

// Hand-authored test data. Never presented as a discovery run.
export const fixtureSteps: Step[] = [
  { action: { kind: 'fill', target: 'memberId', input: 'memberId' }, before: 'search', after: 'search' },
  { action: { kind: 'click', target: 'search' }, before: 'search', after: 'results' },
  { action: { kind: 'click', target: 'openMember' }, before: 'results', after: 'detail' },
  { action: { kind: 'click', target: 'prepareAccount' }, before: 'detail', after: 'form' },
  { action: { kind: 'select', target: 'product', value: 'Savings' }, before: 'form', after: 'form' },
  { action: { kind: 'fill', target: 'nickname', input: 'nickname' }, before: 'form', after: 'form' },
  { action: { kind: 'click', target: 'review' }, before: 'form', after: 'review' },
];
export const fixture = () => artifact(fixtureSteps, crypto.randomUUID(), 'none', 'test-fixture');
