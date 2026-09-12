import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { DecisionResponse } from '../src/planner.js';

test('provider decision schema uses supported anyOf while preserving action validation', () => {
  const schema = JSON.stringify(z.toJSONSchema(DecisionResponse));
  assert.ok(!schema.includes('"oneOf"'));
  assert.ok(schema.includes('"anyOf"'));
  assert.equal(DecisionResponse.safeParse({kind:'action',action:{kind:'fill',target:'memberId',input:'memberId'},reason:'locate_member'}).success,true);
  assert.equal(DecisionResponse.safeParse({kind:'action',action:{kind:'fill',target:'memberId',value:'literal'},reason:'locate_member'}).success,false);
});
